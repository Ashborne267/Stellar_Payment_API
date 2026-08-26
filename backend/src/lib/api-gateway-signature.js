import crypto from "node:crypto";

const DEFAULT_SIGNATURE_WINDOW_SECONDS = 300;
// Minimum HMAC secret length to prevent signing with trivially weak keys
const MIN_SECRET_LENGTH = 16;

// Supported key rotation indices: 0 = current, 1 = previous
const MAX_KEY_ROTATION_DEPTH = 2;

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
  if (typeof signatureHeader !== "string") return null;
  const trimmed = signatureHeader.trim();
  if (!trimmed.startsWith("sha256=")) return null;
  const signature = trimmed.slice("sha256=".length).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(signature)) return null;
  return signature;
}

function safeJsonStringify(value) {
  try {
    if (value === undefined) {
      return "";
    }
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function buildCanonicalPayload({ method, path, timestamp, body }) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const normalizedPath = String(path || "/");
  const bodyHash = crypto
    .createHash("sha256")
    .update(safeJsonStringify(body), "utf8")
    .digest("hex");

  return `${normalizedMethod}\n${normalizedPath}\n${timestamp}\n${bodyHash}`;
}

function signaturesEqual(a, b) {
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");

  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Verify signature using key rotation support.
 * Tries each secret in sequence, returning the first valid result.
 *
 * @param {Array<string>} secrets - Array of secrets to try (current + previous)
 * @param {object} params - Parameters for signature verification
 * @returns {{ valid: boolean, reason?: string, keyIndex?: number }}
 */
export function verifyApiGatewayRequestSignatureWithRotation({
  secrets,
  method,
  path,
  timestampHeader,
  signatureHeader,
  body,
  now = Date.now(),
  toleranceSeconds = Number(
    process.env.API_GATEWAY_SIGNATURE_TOLERANCE_SECONDS || DEFAULT_SIGNATURE_WINDOW_SECONDS,
  ),
}) {
  for (let keyIndex = 0; keyIndex < secrets.length; keyIndex++) {
    const secret = secrets[keyIndex];
    const result = verifyApiGatewayRequestSignature({
      secret,
      method,
      path,
      timestampHeader,
      signatureHeader,
      body,
      now,
      toleranceSeconds,
    });

    if (result.valid) {
      return { valid: true, keyIndex };
    }
  }

  return { valid: false, reason: "Request signature verification failed with all provided keys" };
}

function getCurrentAndPreviousSecret(currentSecret, previousSecret) {
  if (!previousSecret) return [currentSecret];
  return [currentSecret, previousSecret].filter((s) => s != null);
}


export function signApiGatewayRequest({
  secret,
  method,
  path,
  timestamp,
  body,
}) {
  if (!secret || secret.length < MIN_SECRET_LENGTH || !timestamp) {
    return null;
  }

  const payload = buildCanonicalPayload({ method, path, timestamp, body });
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function verifyApiGatewayRequestSignature({
  secret,
  method,
  path,
  timestampHeader,
  signatureHeader,
  body,
  now = Date.now(),
  toleranceSeconds = Number(
    process.env.API_GATEWAY_SIGNATURE_TOLERANCE_SECONDS || DEFAULT_SIGNATURE_WINDOW_SECONDS,
  ),
}) {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    return { valid: false, reason: "Missing or insufficient signature secret" };
  }

  const timestamp = Number.parseInt(String(timestampHeader || ""), 10);
  if (!Number.isFinite(timestamp)) {
    return { valid: false, reason: "Missing or invalid x-api-timestamp header" };
  }

  const deltaSeconds = Math.abs(Math.floor(now / 1000) - timestamp);
  if (deltaSeconds > toleranceSeconds) {
    return { valid: false, reason: "Request signature timestamp is outside the accepted window" };
  }

  const receivedSignature = normalizeSignatureHeader(signatureHeader);
  if (!receivedSignature) {
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
    return { valid: false, reason: "Request signature verification failed" };
  }

  return { valid: true };
}