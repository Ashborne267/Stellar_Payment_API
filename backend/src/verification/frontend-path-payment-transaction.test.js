import { beforeEach, describe, expect, it, vi } from "vitest";

// Vitest will automatically grab __mocks__/stellar-sdk.js
vi.mock("stellar-sdk");

// We import the mocked module to grab the spies exported from our __mocks__ file
import * as MockedStellarSdk from "stellar-sdk";

describe("frontend Stellar path payment builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a strict-receive path payment with memo for an XLM to USDC invoice", async () => {
    const { buildPathPaymentTransaction } = await import(
      "../../../frontend/src/lib/stellar.ts"
    );

    const xdr = await buildPathPaymentTransaction({
      sourcePublicKey: "GTESTSOURCEACCOUNT",
      destinationPublicKey: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      sendMax: "60.7262500",
      sendAssetCode: "XLM",
      sendAssetIssuer: null,
      destAmount: "25.0000000",
      destAssetCode: "USDC",
      destAssetIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      path: [],
      memo: "invoice-123",
      memoType: "text",
      horizonUrl: "https://horizon-testnet.stellar.org",
      networkPassphrase: "Test SDF Network ; September 2015",
    });

    expect(MockedStellarSdk._pathPaymentStrictReceiveSpy).toHaveBeenCalledWith({
      sendAsset: MockedStellarSdk.Asset.native(),
      sendMax: "60.7262500",
      destination: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      destAsset: expect.objectContaining({
        type: "credit",
        code: "USDC",
        issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      }),
      destAmount: "25.0000000",
      path: [],
    });
    expect(MockedStellarSdk._textMemoSpy).toHaveBeenCalledWith("invoice-123");
    expect(xdr).toBe("AAAA-path-payment-xdr");
  });
});
