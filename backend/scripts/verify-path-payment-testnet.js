import "dotenv/config";
import * as StellarSdk from "stellar-sdk";

const NETWORK = (process.env.STELLAR_NETWORK || "testnet").toLowerCase();
const HORIZON_URL =
  process.env.STELLAR_HORIZON_URL ||
  (NETWORK === "public"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org");
const NETWORK_PASSPHRASE =
  NETWORK === "public"
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET;
const FRIEND_BOT_URL =
  process.env.STELLAR_FRIENDBOT_URL || "https://friendbot.stellar.org";

if (NETWORK !== "testnet") {
  console.error("This verifier only supports Stellar testnet.");
  process.exit(1);
}

const server = new StellarSdk.Horizon.Server(HORIZON_URL);

function assertSuccess(result, label) {
  if (!result.successful) {
    throw new Error(`${label} failed: transaction was not successful`);
  }
}

async function fundAccount(publicKey) {
  const response = await fetch(`${FRIEND_BOT_URL}?addr=${publicKey}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Friendbot funding failed for ${publicKey}: ${body}`);
  }
  return response.json();
}

async function submitTransaction(sourceKeypair, operationBuilder, label) {
  const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());
  const txBuilder = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  operationBuilder(txBuilder);

  const transaction = txBuilder.setTimeout(60).build();
  transaction.sign(sourceKeypair);

  const result = await server.submitTransaction(transaction);
  assertSuccess(result, label);
  return result;
}

async function getAssetBalance(accountId, asset) {
  const account = await server.loadAccount(accountId);
  const balanceLine = account.balances.find((balance) => {
    if (asset.isNative()) {
      return balance.asset_type === "native";
    }

    return (
      balance.asset_code === asset.getCode() &&
      balance.asset_issuer === asset.getIssuer()
    );
  });

  return balanceLine ? Number(balanceLine.balance) : 0;
}

function formatAmount(value) {
  return Number(value).toFixed(7);
}

async function main() {
  console.log(`Using Horizon: ${HORIZON_URL}`);

  const issuer = StellarSdk.Keypair.random();
  const marketMaker = StellarSdk.Keypair.random();
  const sender = StellarSdk.Keypair.random();
  const recipient = StellarSdk.Keypair.random();

  console.log("Funding issuer, market maker, sender, and recipient...");
  await Promise.all(
    [issuer, marketMaker, sender, recipient].map((keypair) =>
      fundAccount(keypair.publicKey()),
    ),
  );

  const usdcAsset = new StellarSdk.Asset("USDC", issuer.publicKey());
  const invoiceAmount = "25.0000000";
  const offerAmount = "500.0000000";
  const offerPrice = "2.0000000";

  console.log("Creating trustlines for USDC...");
  await submitTransaction(
    marketMaker,
    (txBuilder) => {
      txBuilder.addOperation(
        StellarSdk.Operation.changeTrust({
          asset: usdcAsset,
        }),
      );
    },
    "market-maker trustline",
  );

  await submitTransaction(
    recipient,
    (txBuilder) => {
      txBuilder.addOperation(
        StellarSdk.Operation.changeTrust({
          asset: usdcAsset,
        }),
      );
    },
    "recipient trustline",
  );

  console.log("Issuing USDC to the market maker...");
  await submitTransaction(
    issuer,
    (txBuilder) => {
      txBuilder.addOperation(
        StellarSdk.Operation.payment({
          destination: marketMaker.publicKey(),
          asset: usdcAsset,
          amount: offerAmount,
        }),
      );
    },
    "issue USDC",
  );

  console.log("Placing a DEX sell offer for USDC/XLM...");
  await submitTransaction(
    marketMaker,
    (txBuilder) => {
      txBuilder.addOperation(
        StellarSdk.Operation.manageSellOffer({
          selling: usdcAsset,
          buying: StellarSdk.Asset.native(),
          amount: offerAmount,
          price: offerPrice,
          offerId: "0",
        }),
      );
    },
    "create sell offer",
  );

  console.log("Discovering strict-receive path from XLM to USDC...");
  const paths = await server
    .strictReceivePaths([StellarSdk.Asset.native()], usdcAsset, invoiceAmount)
    .call();

  if (!paths.records?.length) {
    throw new Error("No strict-receive path found for XLM -> USDC");
  }

  const bestPath = paths.records[0];
  const sourceAmount = Number(bestPath.source_amount);
  const sendMax = formatAmount(sourceAmount * 1.01);
  const path = bestPath.path.map((asset) =>
    asset.asset_type === "native"
      ? StellarSdk.Asset.native()
      : new StellarSdk.Asset(asset.asset_code, asset.asset_issuer),
  );

  const recipientBalanceBefore = await getAssetBalance(
    recipient.publicKey(),
    usdcAsset,
  );

  console.log(
    `Submitting path payment. Source amount estimate: ${bestPath.source_amount} XLM, send max: ${sendMax} XLM`,
  );

  const paymentResult = await submitTransaction(
    sender,
    (txBuilder) => {
      txBuilder
        .addOperation(
          StellarSdk.Operation.pathPaymentStrictReceive({
            sendAsset: StellarSdk.Asset.native(),
            sendMax,
            destination: recipient.publicKey(),
            destAsset: usdcAsset,
            destAmount: invoiceAmount,
            path,
          }),
        )
        .addMemo(StellarSdk.Memo.text("path-payment-check"));
    },
    "path payment",
  );

  const recipientBalanceAfter = await getAssetBalance(
    recipient.publicKey(),
    usdcAsset,
  );
  const receivedDelta = formatAmount(recipientBalanceAfter - recipientBalanceBefore);

  if (receivedDelta !== invoiceAmount) {
    throw new Error(
      `Recipient received ${receivedDelta} USDC instead of expected ${invoiceAmount} USDC`,
    );
  }

  console.log("Path payment verification succeeded.");
  console.log(`Transaction hash: ${paymentResult.hash}`);
  console.log(`Recipient received: ${receivedDelta} USDC`);
  console.log(`Recipient account: ${recipient.publicKey()}`);
}

main().catch((error) => {
  console.error("Path payment verification failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
