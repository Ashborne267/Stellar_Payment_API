import { expect, test } from "@playwright/test";

const API_BASE = "http://localhost:4000";
const PAYMENT_ID = "5cb2bf8f-d84b-4e50-8838-dc0ac7ae0f54";
const PAY_URL = `/pay/${PAYMENT_ID}`;
const SOURCE_PUBLIC_KEY =
  "GBRPYHIL2C7Q7PGLUKSTPIY2KPJ7QMZ4ZWJHQ6GUSIW2LQAHOMK5N7BI";
const DESTINATION_PUBLIC_KEY =
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const USDC_ISSUER =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const PAYMENT = {
  id: PAYMENT_ID,
  amount: 25,
  asset: "USDC",
  asset_issuer: USDC_ISSUER,
  recipient: DESTINATION_PUBLIC_KEY,
  description: "Path payment invoice",
  memo: "invoice-123",
  memo_type: "text",
  status: "pending",
  tx_id: null,
  created_at: "2026-03-28T12:00:00.000Z",
  branding_config: null,
};

test("shows the approximate XLM cost after Freighter connects for a USDC invoice", async ({
  page,
}) => {
  let feeRequestCount = 0;

  await page.addInitScript(
    ({ sourcePublicKey }) => {
      window.addEventListener("message", (event) => {
        if (event.source !== window) return;

        const data = event.data;
        if (data?.source !== "FREIGHTER_EXTERNAL_MSG_REQUEST") return;

        const respond = (payload: Record<string, unknown>) => {
          window.postMessage(
            {
              source: "FREIGHTER_EXTERNAL_MSG_RESPONSE",
              messagedId: data.messageId,
              ...payload,
            },
            window.location.origin,
          );
        };

        switch (data.type) {
          case "REQUEST_ALLOWED_STATUS":
            respond({ isAllowed: true });
            break;
          case "REQUEST_ACCESS":
            respond({ publicKey: sourcePublicKey });
            break;
          default:
            break;
        }
      });
    },
    { sourcePublicKey: SOURCE_PUBLIC_KEY },
  );

  await page.route(`${API_BASE}/api/payment-status/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ payment: PAYMENT }),
    });
  });

  await page.route(`${API_BASE}/api/path-payment-quote/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source_asset: "XLM",
        source_asset_issuer: null,
        source_amount: "60.1250000",
        send_max: "60.7262500",
        destination_asset: "USDC",
        destination_asset_issuer: USDC_ISSUER,
        destination_amount: "25.0000000",
        path: [],
        slippage: 0.01,
      }),
    });
  });

  await page.route(`${API_BASE}/api/network-fee`, async (route) => {
    feeRequestCount += 1;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        network_fee: {
          network: "testnet",
          horizon_url: "https://horizon-testnet.stellar.org",
          operation_count: 1,
          stroops: feeRequestCount === 1 ? 100 : 250,
          xlm: feeRequestCount === 1 ? "0.0000100" : "0.0000250",
          last_ledger_base_fee: 100,
        },
      }),
    });
  });

  await page.goto(PAY_URL);

  await expect(page.getByRole("button", { name: /Freighter/i })).toBeEnabled();
  await page.getByRole("button", { name: /Freighter/i }).click();

  await expect(page.getByText("Connected via Freighter")).toBeVisible();
  await expect(page.getByText("Approximate cost in XLM")).toBeVisible();
  await expect(page.getByText("60.125 XLM")).toBeVisible();
  await expect(
    page.getByText("1% safety buffer included. Max send: 60.7262500 XLM"),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Pay with 60.1250000 XLM instead" }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Pay 60.7262500 XLM" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Pay 60.7262500 XLM" }).click();
  await expect(page.getByText("Network Fee: ~0.0000100 XLM")).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Pay 60.7262500 XLM" }).click();
  await expect(page.getByText("Network Fee: ~0.0000250 XLM")).toBeVisible();
});
