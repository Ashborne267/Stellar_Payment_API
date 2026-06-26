import crypto from "node:crypto";

const DEFAULT_SIGNATURE_WINDOW_SECONDS = 300;
// Minimum HMAC secret length to prevent signing with trivially weak keys (#767)
const MIN_SECRET_LENGTH = 16;

// Rate limiting for API gateway signature verification (issue #897)
const API_GATEWAY_RATE_LIMIT_MAX = Number(process.env.API_GATEWAY_RATE_LIMIT_MAX || 100);
const API_GATEWAY_RATE_LIMIT_WINDOW_MS = Number(process.env.API_GATEWAY_RATE_LIMIT_WINDOW_MS || 60000);

const _apiGatewayRateLimitState = new Map();

export function _resetApiGatewayRateLimitStateForTests() {
  _apiGatewayRateLimitState.clear();
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
  clientIp,
  now = Date.now(),
  toleranceSeconds = Number(
    process.env.API_GATEWAY_SIGNATURE_TOLERANCE_SECONDS || DEFAULT_SIGNATURE_WINDOW_SECONDS,
  ),
}) {
  // Rate limiting check (issue #897)
  if (clientIp && isApiGatewayRateLimited(clientIp, now)) {
    const rateLimitInfo = getApiGatewayRateLimitInfo(clientIp, now);
    return {
      valid: false,
      reason: "API gateway signature verification rate limit exceeded",
      code: "API_GATEWAY_RATE_LIMITED",
      rateLimitInfo,
    };
  }

  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    recordApiGatewaySignatureAttempt(clientIp, false, now);
    return { valid: false, reason: "Missing or insufficient signature secret" };
  }

  const timestamp = Number.parseInt(String(timestampHeader || ""), 10);
  if (!Number.isFinite(timestamp)) {
    recordApiGatewaySignatureAttempt(clientIp, false, now);
    return { valid: false, reason: "Missing or invalid x-api-timestamp header" };
  }

  const deltaSeconds = Math.abs(Math.floor(now / 1000) - timestamp);
  if (deltaSeconds > toleranceSeconds) {
    recordApiGatewaySignatureAttempt(clientIp, false, now);
    return { valid: false, reason: "Request signature timestamp is outside the accepted window" };
  }

  const receivedSignature = normalizeSignatureHeader(signatureHeader);
  if (!receivedSignature) {
    recordApiGatewaySignatureAttempt(clientIp, false, now);
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
    return { valid: false, reason: "Request signature verification failed" };
  }

  recordApiGatewaySignatureAttempt(clientIp, true, now);
  return { valid: true };
}
