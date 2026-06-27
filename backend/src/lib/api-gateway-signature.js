import crypto from "node:crypto";
import { logger } from "./logger.js";

const DEFAULT_SIGNATURE_WINDOW_SECONDS = 300;
// Minimum HMAC secret length to prevent signing with trivially weak keys (#767)
const MIN_SECRET_LENGTH = 16;

// Rate limiting for API gateway signature verification (issue #897)
const API_GATEWAY_RATE_LIMIT_MAX = Number(process.env.API_GATEWAY_RATE_LIMIT_MAX || 100);
const API_GATEWAY_RATE_LIMIT_WINDOW_MS = Number(process.env.API_GATEWAY_RATE_LIMIT_WINDOW_MS || 60000);

// Security audit #901: Enhanced rate limiting with cleanup and error recovery
const _apiGatewayRateLimitState = new Map();
const RATE_LIMIT_CLEANUP_THRESHOLD = 10000;
const RATE_LIMIT_STALE_THRESHOLD_MS = API_GATEWAY_RATE_LIMIT_WINDOW_MS * 2;

// Export for testing
export { _apiGatewayRateLimitState };

// Circuit breaker for signature verification failures (#900)
const CIRCUIT_BREAKER_THRESHOLD = 50;
const CIRCUIT_BREAKER_RESET_MS = 60000;
let _circuitBreakerFailures = 0;
let _circuitBreakerLastFailureTime = 0;
let _circuitBreakerOpen = false;

export function _resetApiGatewayRateLimitStateForTests() {
  _apiGatewayRateLimitState.clear();
  _circuitBreakerFailures = 0;
  _circuitBreakerLastFailureTime = 0;
  _circuitBreakerOpen = false;
}

// Security audit #901: Cleanup stale rate limit entries to prevent memory exhaustion
function _cleanupStaleRateLimitEntries(now = Date.now()) {
  if (_apiGatewayRateLimitState.size <= RATE_LIMIT_CLEANUP_THRESHOLD) {
    return;
  }

  let cleaned = 0;
  for (const [key, state] of _apiGatewayRateLimitState.entries()) {
    if (now - state.windowStart > RATE_LIMIT_STALE_THRESHOLD_MS) {
      _apiGatewayRateLimitState.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug({ cleaned, remaining: _apiGatewayRateLimitState.size }, "Cleaned stale API gateway rate limit entries");
  }
}

// Error recovery #900: Circuit breaker pattern for signature verification
function _isCircuitBreakerOpen(now = Date.now()) {
  if (!_circuitBreakerOpen) {
    return false;
  }

  // Attempt to reset circuit breaker after cooldown period
  if (now - _circuitBreakerLastFailureTime > CIRCUIT_BREAKER_RESET_MS) {
    _circuitBreakerOpen = false;
    _circuitBreakerFailures = 0;
    logger.info("API gateway signature verification circuit breaker reset");
    return false;
  }

  return true;
}

function _recordCircuitBreakerFailure(now = Date.now()) {
  _circuitBreakerFailures++;
  _circuitBreakerLastFailureTime = now;

  if (_circuitBreakerFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    _circuitBreakerOpen = true;
    logger.error(
      { failures: _circuitBreakerFailures },
      "API gateway signature verification circuit breaker opened due to repeated failures"
    );
  }
}

function _recordCircuitBreakerSuccess() {
  if (_circuitBreakerFailures > 0) {
    _circuitBreakerFailures = Math.max(0, _circuitBreakerFailures - 1);
  }
}

function getApiGatewayRateLimitKey(ip) {
  return `api-gateway:${ip || "unknown"}`;
}

function isApiGatewayRateLimited(ip, now = Date.now()) {
  const key = getApiGatewayRateLimitKey(ip);
  const state = _apiGatewayRateLimitState.get(key);

  if (!state || now >= state.windowStart + API_GATEWAY_RATE_LIMIT_WINDOW_MS) {
    return false;
  }

  return state.count >= API_GATEWAY_RATE_LIMIT_MAX;
}

function recordApiGatewaySignatureAttempt(ip, success, now = Date.now()) {
  try {
    const key = getApiGatewayRateLimitKey(ip);
    const state = _apiGatewayRateLimitState.get(key);

    if (!state || now >= state.windowStart + API_GATEWAY_RATE_LIMIT_WINDOW_MS) {
      _apiGatewayRateLimitState.set(key, {
        count: 1,
        windowStart: now,
        failures: success ? 0 : 1,
      });
    } else {
      state.count += 1;
      if (!success) {
        state.failures += 1;
      }
    }

    // Security audit #901: Periodic cleanup of stale entries
    _cleanupStaleRateLimitEntries(now);
  } catch (err) {
    // Error recovery #900: Log but don't fail the request
    logger.warn({ err, ip }, "Failed to record API gateway signature attempt");
  }
}

function getApiGatewayRateLimitInfo(ip, now = Date.now()) {
  const key = getApiGatewayRateLimitKey(ip);
  const state = _apiGatewayRateLimitState.get(key);

  if (!state || now >= state.windowStart + API_GATEWAY_RATE_LIMIT_WINDOW_MS) {
    return {
      allowed: true,
      remaining: API_GATEWAY_RATE_LIMIT_MAX,
      resetTime: now + API_GATEWAY_RATE_LIMIT_WINDOW_MS,
    };
  }

  return {
    allowed: state.count < API_GATEWAY_RATE_LIMIT_MAX,
    remaining: Math.max(0, API_GATEWAY_RATE_LIMIT_MAX - state.count),
    resetTime: state.windowStart + API_GATEWAY_RATE_LIMIT_WINDOW_MS,
  };
}

function normalizeSignatureHeader(signatureHeader) {
  try {
    if (typeof signatureHeader !== "string") return null;
    const trimmed = signatureHeader.trim();
    if (!trimmed.startsWith("sha256=")) return null;
    const signature = trimmed.slice("sha256=".length).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(signature)) return null;
    return signature;
  } catch (err) {
    logger.warn({ err }, "Failed to normalize signature header");
    return null;
  }
}

function safeJsonStringify(value) {
  try {
    if (value === undefined) {
      return "";
    }
    return JSON.stringify(value);
  } catch (err) {
    logger.warn({ err }, "Failed to stringify value for signature");
    return "";
  }
}

function buildCanonicalPayload({ method, path, timestamp, body }) {
  try {
    const normalizedMethod = String(method || "GET").toUpperCase();
    const normalizedPath = String(path || "/");
    const bodyHash = crypto
      .createHash("sha256")
      .update(safeJsonStringify(body), "utf8")
      .digest("hex");

    return `${normalizedMethod}\n${normalizedPath}\n${timestamp}\n${bodyHash}`;
  } catch (err) {
    logger.warn({ err }, "Failed to build canonical payload");
    throw new Error("Failed to build canonical payload for signature");
  }
}

function signaturesEqual(a, b) {
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");

  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function signApiGatewayRequest({
  secret,
  method,
  path,
  timestamp,
  body,
}) {
  try {
    if (!secret || secret.length < MIN_SECRET_LENGTH || !timestamp) {
      logger.warn({ secretLength: secret?.length }, "Invalid parameters for signing API gateway request");
      return null;
    }

    const payload = buildCanonicalPayload({ method, path, timestamp, body });
    return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  } catch (err) {
    logger.error({ err }, "Failed to sign API gateway request");
    return null;
  }
}

export function verifyApiGatewayRequestSignature({
  secret,
  method,
  path,
  timestampHeader,
  signatureHeader,
  body,
  clientIp,
  now = Date.now(),
  toleranceSeconds = Number(
    process.env.API_GATEWAY_SIGNATURE_TOLERANCE_SECONDS || DEFAULT_SIGNATURE_WINDOW_SECONDS,
  ),
}) {
  // Error recovery #900: Check circuit breaker first
  if (_isCircuitBreakerOpen(now)) {
    logger.warn("API gateway signature verification circuit breaker is open, rejecting request");
    return {
      valid: false,
      reason: "Signature verification temporarily unavailable due to repeated failures",
      code: "API_GATEWAY_CIRCUIT_BREAKER_OPEN",
    };
  }

  try {
    // Rate limiting check (issue #897)
    if (clientIp && isApiGatewayRateLimited(clientIp, now)) {
      const rateLimitInfo = getApiGatewayRateLimitInfo(clientIp, now);
      logger.warn({ clientIp, rateLimitInfo }, "API gateway signature verification rate limit exceeded");
      return {
        valid: false,
        reason: "API gateway signature verification rate limit exceeded",
        code: "API_GATEWAY_RATE_LIMITED",
        rateLimitInfo,
      };
    }

    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      recordApiGatewaySignatureAttempt(clientIp, false, now);
      _recordCircuitBreakerFailure(now);
      logger.warn({ secretLength: secret?.length, clientIp }, "Missing or insufficient signature secret");
      return { valid: false, reason: "Missing or insufficient signature secret" };
    }

    const timestamp = Number.parseInt(String(timestampHeader || ""), 10);
    if (!Number.isFinite(timestamp)) {
      recordApiGatewaySignatureAttempt(clientIp, false, now);
      _recordCircuitBreakerFailure(now);
      logger.warn({ timestampHeader, clientIp }, "Missing or invalid x-api-timestamp header");
      return { valid: false, reason: "Missing or invalid x-api-timestamp header" };
    }

    const deltaSeconds = Math.abs(Math.floor(now / 1000) - timestamp);
    if (deltaSeconds > toleranceSeconds) {
      recordApiGatewaySignatureAttempt(clientIp, false, now);
      _recordCircuitBreakerFailure(now);
      logger.warn({ deltaSeconds, toleranceSeconds, clientIp }, "Request signature timestamp outside accepted window");
      return { valid: false, reason: "Request signature timestamp is outside the accepted window" };
    }

    const receivedSignature = normalizeSignatureHeader(signatureHeader);
    if (!receivedSignature) {
      recordApiGatewaySignatureAttempt(clientIp, false, now);
      _recordCircuitBreakerFailure(now);
      logger.warn({ signatureHeader, clientIp }, "Missing or invalid x-api-signature header");
      return { valid: false, reason: "Missing or invalid x-api-signature header" };
    }

    const expected = signApiGatewayRequest({
      secret,
      method,
      path,
      timestamp,
      body,
    });

    if (!expected || !signaturesEqual(receivedSignature, expected)) {
      recordApiGatewaySignatureAttempt(clientIp, false, now);
      _recordCircuitBreakerFailure(now);
      logger.warn({ clientIp, method, path }, "Request signature verification failed");
      return { valid: false, reason: "Request signature verification failed" };
    }

    recordApiGatewaySignatureAttempt(clientIp, true, now);
    _recordCircuitBreakerSuccess();
    return { valid: true };
  } catch (err) {
    // Error recovery #900: Catch unexpected errors and fail gracefully
    _recordCircuitBreakerFailure(now);
    logger.error({ err, clientIp }, "Unexpected error during API gateway signature verification");
    return {
      valid: false,
      reason: "Signature verification encountered an unexpected error",
      code: "API_GATEWAY_VERIFICATION_ERROR",
    };
  }
}
