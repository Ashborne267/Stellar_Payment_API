import { describe, it, expect } from "vitest";
import { validateMemo } from "./stellar.js";

describe("validateMemo", () => {
  describe("TEXT memos", () => {
    it("should accept valid text memos", () => {
      const result = validateMemo("Hello World", "text");
      expect(result.valid).toBe(true);
    });

    it("should accept text memos up to 28 bytes", () => {
      const result = validateMemo("1234567890123456789012345678", "text");
      expect(result.valid).toBe(true);
    });

    it("should reject text memos over 28 bytes", () => {
      const result = validateMemo("12345678901234567890123456789", "text");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("28 bytes or less");
    });

    it("should handle UTF-8 multi-byte characters correctly", () => {
      // Each emoji is 4 bytes, so 7 emojis = 28 bytes
      const result = validateMemo("😀😀😀😀😀😀😀", "text");
      expect(result.valid).toBe(true);

      // 8 emojis = 32 bytes (over limit)
      const result2 = validateMemo("😀😀😀😀😀😀😀😀", "text");
      expect(result2.valid).toBe(false);
    });
  });

  describe("ID memos", () => {
    it("should accept valid ID memos", () => {
      const result = validateMemo("12345", "id");
      expect(result.valid).toBe(true);
    });

    it("should accept zero", () => {
      const result = validateMemo("0", "id");
      expect(result.valid).toBe(true);
    });

    it("should accept maximum 64-bit unsigned integer", () => {
      const result = validateMemo("18446744073709551615", "id");
      expect(result.valid).toBe(true);
    });

    it("should reject negative numbers", () => {
      const result = validateMemo("-1", "id");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("memo must be a valid unsigned 64-bit integer when memo_type is id");
    });

    it("should reject non-numeric strings", () => {
      const result = validateMemo("abc123", "id");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("memo must be a valid unsigned 64-bit integer when memo_type is id");
    });

    it("should reject numbers over 64-bit limit", () => {
      const result = validateMemo("18446744073709551616", "id");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("between 0 and");
    });

    it("should reject decimal numbers", () => {
      const result = validateMemo("123.45", "id");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("memo must be a valid unsigned 64-bit integer when memo_type is id");
    });
  });

  describe("HASH memos", () => {
    it("should accept valid 64-character hex strings", () => {
      const validHash = "a".repeat(64);
      const result = validateMemo(validHash, "hash");
      expect(result.valid).toBe(true);
    });

    it("should accept mixed case hex strings", () => {
      const validHash = "AbCdEf0123456789".repeat(4);
      const result = validateMemo(validHash, "hash");
      expect(result.valid).toBe(true);
    });

    it("should reject hash memos shorter than 64 characters", () => {
      const result = validateMemo("a".repeat(63), "hash");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("memo must be a 32-byte hex string (64 characters) when memo_type is hash");
    });

    it("should reject hash memos longer than 64 characters", () => {
      const result = validateMemo("a".repeat(65), "hash");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("memo must be a 32-byte hex string (64 characters) when memo_type is hash");
    });

    it("should reject non-hex characters", () => {
      const invalidHash = "g".repeat(64);
      const result = validateMemo(invalidHash, "hash");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("memo must be a 32-byte hex string (64 characters) when memo_type is hash");
    });

    it("should reject hash with spaces", () => {
      const result = validateMemo(
        "a".repeat(32) + " " + "a".repeat(31),
        "hash",
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("memo must be a 32-byte hex string (64 characters) when memo_type is hash");
    });
  });

  describe("RETURN memos", () => {
    it("should accept valid 64-character hex strings", () => {
      const validReturn = "0".repeat(64);
      const result = validateMemo(validReturn, "return");
      expect(result.valid).toBe(true);
    });

    it("should reject non-numeric return memos shorter than 64 characters", () => {
      const result = validateMemo("x".repeat(10), "return");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("memo must be a valid unsigned 64-bit integer or a 32-byte hex string (64 characters) when memo_type is return");
    });

    it("should reject return memos longer than 64 characters (and not a valid ID)", () => {
      const result = validateMemo("a".repeat(65), "return");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("memo must be a valid unsigned 64-bit integer or a 32-byte hex string (64 characters) when memo_type is return");
    });

    it("should reject non-hex return characters (if not a valid ID)", () => {
      const invalidReturn = "g".repeat(64);
      const result = validateMemo(invalidReturn, "return");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("memo must be a valid unsigned 64-bit integer or a 32-byte hex string (64 characters) when memo_type is return");
    });
  });

  describe("Edge cases", () => {
    it("should return valid for empty memo and type", () => {
      const result = validateMemo("", "");
      expect(result.valid).toBe(true);
    });

    it("should return valid for null memo", () => {
      const result = validateMemo(null, null);
      expect(result.valid).toBe(true);
    });

    it("should return valid for undefined memo", () => {
      const result = validateMemo(undefined, undefined);
      expect(result.valid).toBe(true);
    });

    it("should reject invalid memo type", () => {
      const result = validateMemo("test", "invalid_type");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid memo type");
    });

    it("should handle case-insensitive memo types", () => {
      const result1 = validateMemo("test", "TEXT");
      expect(result1.valid).toBe(true);

      const result2 = validateMemo("123", "ID");
      expect(result2.valid).toBe(true);

      const result3 = validateMemo("a".repeat(64), "HASH");
      expect(result3.valid).toBe(true);

      const result4 = validateMemo("0".repeat(64), "RETURN");
      expect(result4.valid).toBe(true);
    });
  });
});
