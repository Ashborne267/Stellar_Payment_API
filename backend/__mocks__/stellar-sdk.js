import { vi } from "vitest";

const nativeAsset = { type: "native" };

class MockAsset {
  constructor(code, issuer) {
    this.code = code;
    this.issuer = issuer;
    this.type = "credit";
  }
  static native() {
    return nativeAsset;
  }
}

// Ensure the spy can be read by tests via a global or by importing the mock directly.
// We'll export the mock functions directly so the test can assert on them.

export const _textMemoSpy = vi.fn((value) => ({ type: "text", value }));
export const _pathPaymentStrictReceiveSpy = vi.fn((params) => ({
  type: "path_payment_strict_receive",
  ...params,
}));

export const Asset = MockAsset;
export const BASE_FEE = "100";
export const Memo = {
  text: _textMemoSpy,
  id: vi.fn(),
  hash: vi.fn(),
  return: vi.fn(),
};

export const Horizon = {
  Server: vi.fn(() => ({
    loadAccount: vi.fn().mockResolvedValue({
      accountId: () => "GTESTSOURCEACCOUNT",
      sequence: "1234567890",
    }),
  })),
};

export const Operation = {
  payment: vi.fn(),
  pathPaymentStrictReceive: _pathPaymentStrictReceiveSpy,
};

export const TransactionBuilder = vi.fn().mockImplementation(() => ({
  addOperation: vi.fn().mockReturnThis(),
  addMemo: vi.fn().mockReturnThis(),
  setTimeout: vi.fn().mockReturnThis(),
  build: vi.fn().mockReturnValue({
    toXDR: () => "AAAA-path-payment-xdr",
  }),
}));
