/**
 * Tests for Ledger Monitor security helpers (ledger-monitor-security.js).
 *
 * Focus: validatePaymentRecord must treat the native asset (XLM / "native")
 * as not requiring an issuer (Issue #910 — enhance error recovery / security
 * integrity for the Ledger Monitor). Previously native XLM payments were
 * rejected for a "missing" issuer, so the poller skipped every native payment.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("./logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  validatePaymentRecord,
  sanitizePaymentMetadata,
  isValidTransactionHash,
  isNativeAsset,
} from "./ledger-monitor-security.js";

const RECIPIENT = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";
const ISSUER = "GCEZWKCA5VLDNRLN3RPRJMR3PXJHUWB2TVXVDZQEQ3GTKEX2OQ2BYE4Z";

function nativePayment(overrides = {}) {
  return {
    id: "pay-001",
    recipient: RECIPIENT,
    amount: "10.0000000",
    asset: "XLM",
    asset_issuer: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("isNativeAsset", () => {
  it("recognises XLM and native in any case", () => {
    expect(isNativeAsset("XLM")).toBe(true);
    expect(isNativeAsset("xlm")).toBe(true);
    expect(isNativeAsset(" Native ")).toBe(true);
    expect(isNativeAsset("native")).toBe(true);
  });

  it("rejects issued asset codes and non-strings", () => {
    expect(isNativeAsset("USDC")).toBe(false);
    expect(isNativeAsset(null)).toBe(false);
    expect(isNativeAsset(undefined)).toBe(false);
    expect(isNativeAsset(123)).toBe(false);
  });
});

describe("validatePaymentRecord — native asset handling", () => {
  it("accepts a native XLM payment with a null issuer", () => {
    expect(validatePaymentRecord(nativePayment())).toEqual({ valid: true });
  });

  it("accepts asset 'native' with a null issuer", () => {
    expect(
      validatePaymentRecord(nativePayment({ asset: "native" })),
    ).toEqual({ valid: true });
  });

  it("accepts lowercase 'xlm' with a null issuer", () => {
    expect(validatePaymentRecord(nativePayment({ asset: "xlm" }))).toEqual({
      valid: true,
    });
  });

  it("still requires a valid issuer for non-native assets", () => {
    const result = validatePaymentRecord(
      nativePayment({ asset: "USDC", asset_issuer: null }),
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/asset_issuer/);
  });

  it("accepts a non-native asset with a valid issuer", () => {
    expect(
      validatePaymentRecord(nativePayment({ asset: "USDC", asset_issuer: ISSUER })),
    ).toEqual({ valid: true });
  });
});

describe("validatePaymentRecord — field guards", () => {
  it("rejects an invalid recipient address", () => {
    const result = validatePaymentRecord(nativePayment({ recipient: "GABC" }));
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/recipient/);
  });

  it("rejects a non-positive amount", () => {
    expect(validatePaymentRecord(nativePayment({ amount: "0" })).valid).toBe(false);
    expect(validatePaymentRecord(nativePayment({ amount: "-5" })).valid).toBe(false);
  });

  it("rejects a null payment record", () => {
    expect(validatePaymentRecord(null).valid).toBe(false);
  });
});

describe("sanitizePaymentMetadata", () => {
  it("drops keys not on the allowlist", () => {
    const out = sanitizePaymentMetadata({ order_id: "x", evil: "drop" });
    expect(out).toEqual({ order_id: "x" });
  });

  it("returns an empty object for non-object input", () => {
    expect(sanitizePaymentMetadata(null)).toEqual({});
    expect(sanitizePaymentMetadata("nope")).toEqual({});
    expect(sanitizePaymentMetadata([1, 2])).toEqual({});
  });
});

describe("isValidTransactionHash", () => {
  it("accepts a 64-char hex string", () => {
    expect(isValidTransactionHash("a".repeat(64))).toBe(true);
  });

  it("rejects malformed hashes", () => {
    expect(isValidTransactionHash("tx-abc")).toBe(false);
    expect(isValidTransactionHash("a".repeat(63))).toBe(false);
    expect(isValidTransactionHash(null)).toBe(false);
  });
});
