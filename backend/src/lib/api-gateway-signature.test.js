import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  signApiGatewayRequest,
  verifyApiGatewayRequestSignature,
  _resetApiGatewayRateLimitStateForTests,
  _apiGatewayRateLimitState,
} from "./api-gateway-signature.js";

// All secrets must be >= 16 characters (MIN_SECRET_LENGTH enforcement, issue #767)
const VALID_SECRET = "test-api-key-secure-32chars-padded";

// Mock logger
vi.mock("./logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("api-gateway-signature", () => {
  beforeEach(() => {
    _resetApiGatewayRateLimitStateForTests();
  });
  it("signs and verifies request payloads", () => {
    const timestamp = 1713916800;

    const signature = signApiGatewayRequest({
      secret: VALID_SECRET,
      method: "POST",
      path: "/api/payments",
      timestamp,
      body: { amount: 12.5, asset: "USDC" },
    });

    const result = verifyApiGatewayRequestSignature({
      secret: VALID_SECRET,
      method: "POST",
      path: "/api/payments",
      timestampHeader: String(timestamp),
      signatureHeader: `sha256=${signature}`,
      body: { amount: 12.5, asset: "USDC" },
      now: timestamp * 1000,
    });

    expect(result).toEqual({ valid: true });
  });

  it("rejects signatures outside timestamp tolerance", () => {
    const timestamp = 1713916800;

    const signature = signApiGatewayRequest({
      secret: VALID_SECRET,
      method: "GET",
      path: "/api/metrics/summary",
      timestamp,
      body: {},
    });

    const result = verifyApiGatewayRequestSignature({
      secret: VALID_SECRET,
      method: "GET",
      path: "/api/metrics/summary",
      timestampHeader: String(timestamp),
      signatureHeader: `sha256=${signature}`,
      body: {},
      now: (timestamp + 900) * 1000,
      toleranceSeconds: 300,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/outside the accepted window/i);
  });

  it("rejects malformed signature headers", () => {
    const result = verifyApiGatewayRequestSignature({
      secret: VALID_SECRET,
      method: "GET",
      path: "/health",
      timestampHeader: "1713916800",
      signatureHeader: "not-a-signature",
      body: {},
      now: 1713916800 * 1000,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/invalid x-api-signature/i);
  });

  // ── Security audit: minimum secret length (#767) ──────────────────────────

  it("rejects signing with a secret shorter than the minimum length", () => {
    const result = signApiGatewayRequest({
      secret: "short",
      method: "GET",
      path: "/health",
      timestamp: 1713916800,
      body: {},
    });

    expect(result).toBeNull();
  });

  it("rejects verification with a secret shorter than the minimum length", () => {
    const result = verifyApiGatewayRequestSignature({
      secret: "tooshort",
      method: "GET",
      path: "/health",
      timestampHeader: "1713916800",
      signatureHeader: "sha256=" + "a".repeat(64),
      body: {},
      now: 1713916800 * 1000,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/insufficient.*secret/i);
  });

  it("rejects verification with a missing secret", () => {
    const result = verifyApiGatewayRequestSignature({
      secret: "",
      method: "GET",
      path: "/health",
      timestampHeader: "1713916800",
      signatureHeader: "sha256=" + "a".repeat(64),
      body: {},
      now: 1713916800 * 1000,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/insufficient.*secret/i);
  });

  it("detects a tampered body by producing a different signature", () => {
    const timestamp = 1713916800;

    const signature = signApiGatewayRequest({
      secret: VALID_SECRET,
      method: "POST",
      path: "/api/payments",
      timestamp,
      body: { amount: 10 },
    });

    const result = verifyApiGatewayRequestSignature({
      secret: VALID_SECRET,
      method: "POST",
      path: "/api/payments",
      timestampHeader: String(timestamp),
      signatureHeader: `sha256=${signature}`,
      body: { amount: 99 }, // tampered
      now: timestamp * 1000,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/verification failed/i);
  });

  // ── Security audit #901: Stale entry cleanup ───────────────────────────────

  it("cleans up stale rate limit entries when threshold exceeded", () => {
    vi.useFakeTimers();

    const staleStart = Date.now() - 300000; // 5 minutes ago
    for (let i = 0; i < 10001; i++) {
      const key = `api-gateway:192.168.1.${i}`;
      // Manually set stale entries
      _apiGatewayRateLimitState.set(key, {
        count: 1,
        windowStart: staleStart,
        failures: 0,
      });
    }

    // Trigger cleanup by recording a new attempt
    verifyApiGatewayRequestSignature({
      secret: VALID_SECRET,
      method: "GET",
      path: "/health",
      timestampHeader: "1713916800",
      signatureHeader: "sha256=" + "a".repeat(64),
      body: {},
      now: Date.now(),
    });

    expect(_apiGatewayRateLimitState.size).toBeLessThan(10001);

    vi.useRealTimers();
  });

  // ── Error recovery #900: Circuit breaker pattern ───────────────────────────

  it("opens circuit breaker after repeated failures", () => {
    const timestamp = 1713916800;
    const invalidSignature = "sha256=" + "a".repeat(64);

    // Trigger 50 failures to open circuit breaker
    for (let i = 0; i < 50; i++) {
      verifyApiGatewayRequestSignature({
        secret: VALID_SECRET,
        method: "GET",
        path: "/health",
        timestampHeader: String(timestamp),
        signatureHeader: invalidSignature,
        body: {},
        now: timestamp * 1000,
      });
    }

    // Circuit breaker should now be open
    const result = verifyApiGatewayRequestSignature({
      secret: VALID_SECRET,
      method: "GET",
      path: "/health",
      timestampHeader: String(timestamp),
      signatureHeader: invalidSignature,
      body: {},
      now: timestamp * 1000,
    });

    expect(result.valid).toBe(false);
    expect(result.code).toBe("API_GATEWAY_CIRCUIT_BREAKER_OPEN");
  });

  it("resets circuit breaker after cooldown period", () => {
    vi.useFakeTimers();

    const timestamp = 1713916800;
    const invalidSignature = "sha256=" + "a".repeat(64);

    // Open circuit breaker
    for (let i = 0; i < 50; i++) {
      verifyApiGatewayRequestSignature({
        secret: VALID_SECRET,
        method: "GET",
        path: "/health",
        timestampHeader: String(timestamp),
        signatureHeader: invalidSignature,
        body: {},
        now: timestamp * 1000,
      });
    }

    // Advance past cooldown period (60s)
    vi.advanceTimersByTime(61000);

    // Circuit breaker should be reset
    const result = verifyApiGatewayRequestSignature({
      secret: VALID_SECRET,
      method: "GET",
      path: "/health",
      timestampHeader: String(timestamp),
      signatureHeader: invalidSignature,
      body: {},
      now: timestamp * 1000 + 61000,
    });

    expect(result.code).not.toBe("API_GATEWAY_CIRCUIT_BREAKER_OPEN");

    vi.useRealTimers();
  });

  it("decrements circuit breaker failure count on success", () => {
    const timestamp = 1713916800;

    // Create a valid signature
    const validSignature = signApiGatewayRequest({
      secret: VALID_SECRET,
      method: "GET",
      path: "/health",
      timestamp,
      body: {},
    });

    // Trigger some failures
    for (let i = 0; i < 10; i++) {
      verifyApiGatewayRequestSignature({
        secret: VALID_SECRET,
        method: "GET",
        path: "/health",
        timestampHeader: String(timestamp),
        signatureHeader: "sha256=" + "a".repeat(64),
        body: {},
        now: timestamp * 1000,
      });
    }

    // Success should decrement failure count
    verifyApiGatewayRequestSignature({
      secret: VALID_SECRET,
      method: "GET",
      path: "/health",
      timestampHeader: String(timestamp),
      signatureHeader: `sha256=${validSignature}`,
      body: {},
      now: timestamp * 1000,
    });

    // Circuit breaker should not be open
    const result = verifyApiGatewayRequestSignature({
      secret: VALID_SECRET,
      method: "GET",
      path: "/health",
      timestampHeader: String(timestamp),
      signatureHeader: "sha256=" + "a".repeat(64),
      body: {},
      now: timestamp * 1000,
    });

    expect(result.code).not.toBe("API_GATEWAY_CIRCUIT_BREAKER_OPEN");
  });

  // ── Error recovery #900: Graceful error handling ───────────────────────────

  it("handles unexpected errors gracefully", () => {
    const result = verifyApiGatewayRequestSignature({
      secret: VALID_SECRET,
      method: "GET",
      path: "/health",
      timestampHeader: "invalid-timestamp",
      signatureHeader: "sha256=" + "a".repeat(64),
      body: {},
      now: 1713916800 * 1000,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("timestamp");
  });
});
