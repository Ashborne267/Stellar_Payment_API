import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as StellarSdk from "stellar-sdk";
import {
  generateChallenge,
  verifyChallenge,
  validateChallengeXdr,
  getHomeDomain,
  isRetryableSep10StoreError,
  withSep10StoreRecovery,
  lookupMerchantByStellarAddress,
  Sep10AuthError,
  MAX_CHALLENGE_XDR_BYTES,
  _resetNonceCacheForTests,
} from "./sep10-auth.js";

const HOME_DOMAIN = "localhost";

describe("SEP-0010 Authentication", () => {
  let clientKeypair;
  let serverKeypair;

  beforeAll(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
    clientKeypair = StellarSdk.Keypair.random();
    serverKeypair = StellarSdk.Keypair.random();
    process.env.SEP10_SERVER_SIGNING_KEY = serverKeypair.secret();
  });

  beforeEach(() => {
    _resetNonceCacheForTests();
  });

  it("should generate a valid challenge transaction", () => {
    const challengeXdr = generateChallenge(clientKeypair.publicKey(), HOME_DOMAIN);
    expect(challengeXdr).toBeTruthy();
    expect(typeof challengeXdr).toBe("string");

    const tx = StellarSdk.TransactionBuilder.fromXDR(
      challengeXdr,
      StellarSdk.Networks.TESTNET,
    );
    expect(tx.operations.length).toBe(1);
    expect(tx.operations[0].type).toBe("manageData");
  });

  it("should reject an invalid client Stellar account", () => {
    expect(() => generateChallenge("not-a-valid-account", HOME_DOMAIN)).toThrow(
      "Invalid client Stellar account",
    );
  });

  it("should verify a properly signed challenge", () => {
    const challengeXdr = generateChallenge(clientKeypair.publicKey(), HOME_DOMAIN);
    const tx = StellarSdk.TransactionBuilder.fromXDR(
      challengeXdr,
      StellarSdk.Networks.TESTNET,
    );

    tx.sign(clientKeypair);
    const signedXdr = tx.toXDR();

    const result = verifyChallenge(signedXdr, clientKeypair.publicKey(), HOME_DOMAIN);
    expect(result.valid).toBe(true);
  });

  it("should reject challenge without client signature", () => {
    const challengeXdr = generateChallenge(clientKeypair.publicKey(), HOME_DOMAIN);

    const result = verifyChallenge(challengeXdr, clientKeypair.publicKey(), HOME_DOMAIN);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Client signature");
  });

  it("should reject challenge with wrong client account", () => {
    const wrongKeypair = StellarSdk.Keypair.random();
    const challengeXdr = generateChallenge(clientKeypair.publicKey(), HOME_DOMAIN);
    const tx = StellarSdk.TransactionBuilder.fromXDR(
      challengeXdr,
      StellarSdk.Networks.TESTNET,
    );

    tx.sign(clientKeypair);
    const signedXdr = tx.toXDR();

    const result = verifyChallenge(signedXdr, wrongKeypair.publicKey(), HOME_DOMAIN);
    expect(result.valid).toBe(false);
  });

  it("should reject a reused nonce (replay protection)", () => {
    const challengeXdr = generateChallenge(clientKeypair.publicKey(), HOME_DOMAIN);
    const tx = StellarSdk.TransactionBuilder.fromXDR(
      challengeXdr,
      StellarSdk.Networks.TESTNET,
    );

    tx.sign(clientKeypair);
    const signedXdr = tx.toXDR();

    const first = verifyChallenge(signedXdr, clientKeypair.publicKey(), HOME_DOMAIN);
    expect(first.valid).toBe(true);

    const second = verifyChallenge(signedXdr, clientKeypair.publicKey(), HOME_DOMAIN);
    expect(second.valid).toBe(false);
    expect(second.error).toBe("Challenge nonce already used");
  });

  it("should reject an invalid client account in verifyChallenge", () => {
    const result = verifyChallenge("AAAA", "not-a-key", HOME_DOMAIN);
    expect(result.valid).toBe(false);
    expect(result.code).toBe("INVALID_ACCOUNT");
  });

  it("rejects oversized challenge XDR before parsing", () => {
    const oversized = "A".repeat(MAX_CHALLENGE_XDR_BYTES + 1);
    const result = verifyChallenge(oversized, clientKeypair.publicKey(), HOME_DOMAIN);
    expect(result.valid).toBe(false);
    expect(result.code).toBe("INVALID_XDR");
  });

  it("rejects home-domain mismatch between challenge and verify", () => {
    const challengeXdr = generateChallenge(clientKeypair.publicKey(), "example.com");
    const tx = StellarSdk.TransactionBuilder.fromXDR(
      challengeXdr,
      StellarSdk.Networks.TESTNET,
    );
    tx.sign(clientKeypair);

    const result = verifyChallenge(tx.toXDR(), clientKeypair.publicKey(), HOME_DOMAIN);
    expect(result.valid).toBe(false);
    expect(result.code).toBe("HOME_DOMAIN_MISMATCH");
  });

  it("validateChallengeXdr rejects non-base64 payloads", () => {
    expect(validateChallengeXdr("not valid!!!")).toEqual({
      valid: false,
      error: "Invalid challenge transaction encoding",
    });
  });

  it("getHomeDomain falls back to localhost when unset", () => {
    delete process.env.HOME_DOMAIN;
    expect(getHomeDomain()).toBe("localhost");
    process.env.HOME_DOMAIN = HOME_DOMAIN;
  });

  it("isRetryableSep10StoreError detects transient upstream failures", () => {
    expect(isRetryableSep10StoreError({ message: "fetch failed: timeout" })).toBe(true);
    expect(isRetryableSep10StoreError({ message: "duplicate key" })).toBe(false);
  });

  it("withSep10StoreRecovery retries then throws Sep10AuthError", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ message: "503 temporarily unavailable" })
      .mockRejectedValueOnce({ message: "503 temporarily unavailable" })
      .mockRejectedValueOnce({ message: "503 temporarily unavailable" });

    await expect(withSep10StoreRecovery(fn, "test")).rejects.toBeInstanceOf(Sep10AuthError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("lookupMerchantByStellarAddress returns merchant data on success", async () => {
    const merchant = { id: "m-1", email: "a@example.com" };
    const supabaseClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: merchant, error: null }),
            }),
          }),
        }),
      }),
    };

    const result = await lookupMerchantByStellarAddress(clientKeypair.publicKey(), supabaseClient);
    expect(result).toEqual(merchant);
  });
});
