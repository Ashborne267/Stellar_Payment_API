/**
 * Audit Logging Helper
 *
 * Provides a lightweight helper to record merchant login attempts
 * (success and failure) into the `audit_logs` table for security monitoring.
 *
 * Design notes:
 * - All errors are swallowed so audit logging never blocks or crashes auth.
 * - `merchantId` is required (NOT NULL FK); only call this after merchant lookup.
 * - `status` is stored as a suffix of the `action` field: 'login_success' | 'login_failure'.
 */

import { AuditCircuitBreaker, CircuitState } from "./audit-circuit-breaker.js";
import { replayFallbackLogs } from "./audit-replay.js";
import { pool, isRetryablePoolError } from "./db.js";
import {
  consumeAuditLogRateLimit,
  createAuditLogRateLimitKey,
  hashAuditPayload,
  sanitizeAuditValue,
  signAuditPayload,
  validateAuditAction,
} from "./audit-security.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditLogWritesTotal,
  auditLogWriteDuration,
  auditLogFallbackWritesTotal,
  auditLogCircuitBreakerTrips,
  auditLogCircuitBreakerState,
  auditLogRateLimitRejectionsTotal,
} from "./metrics.js";

const AUDIT_SOURCE = "login_attempt";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_FALLBACK_LOG_PATH = process.env.AUDIT_FALLBACK_LOG_PATH || path.join(__dirname, "../../logs/audit_fallback.log");
const AUDIT_DB_RETRY_ATTEMPTS = Number.parseInt(process.env.AUDIT_DB_RETRY_ATTEMPTS || "2", 10);
const AUDIT_DB_RETRY_DELAY_MS = Number.parseInt(process.env.AUDIT_DB_RETRY_DELAY_MS || "100", 10);

/**
 * Circuit-breaker state for the audit DB path (issue #771).
 * After CIRCUIT_FAILURE_THRESHOLD consecutive DB failures the circuit opens
 * and all writes are routed directly to the fallback log for
 * CIRCUIT_RESET_MS milliseconds before a single probe attempt is made.
 */
const CIRCUIT_FAILURE_THRESHOLD = Number.parseInt(process.env.AUDIT_CIRCUIT_FAILURE_THRESHOLD || "5", 10);
const CIRCUIT_RESET_MS = Number.parseInt(process.env.AUDIT_CIRCUIT_RESET_MS || "60000", 10);

const auditCircuitBreaker = new AuditCircuitBreaker({
  failureThreshold: CIRCUIT_FAILURE_THRESHOLD,
  resetTimeoutMs: CIRCUIT_RESET_MS,
  label: "audit-helper",
  onClose: () => {
    auditLogCircuitBreakerState.set({ source: AUDIT_SOURCE }, 0);
    replayFallbackLogs(AUDIT_FALLBACK_LOG_PATH).catch((err) => {
      console.error("[Audit Replay] Fallback log replay failed:", err.message);
    });
  },
  onOpen: () => {
    auditLogCircuitBreakerTrips.inc({ source: AUDIT_SOURCE });
    auditLogCircuitBreakerState.set({ source: AUDIT_SOURCE }, 1);
  },
  onHalfOpen: () => {
    auditLogCircuitBreakerState.set({ source: AUDIT_SOURCE }, 2);
  },
});

export function getAuditCircuitState() {
  return {
    open: auditCircuitBreaker.state === CircuitState.OPEN,
    failures: auditCircuitBreaker.failures,
    openedAt: auditCircuitBreaker.openedAt,
    state: auditCircuitBreaker.state,
  };
}

export function _resetAuditCircuitForTests() {
  auditCircuitBreaker.reset();
}

function isCircuitOpen(now = Date.now()) {
  return auditCircuitBreaker.isOpen(now);
}

function recordCircuitSuccess() {
  auditCircuitBreaker.recordSuccess();
}

function recordCircuitFailure(now = Date.now()) {
  auditCircuitBreaker.recordFailure(now);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeFallbackLog(payload, error) {
  const timestamp = new Date().toISOString();
  const entry = `${timestamp} | ${JSON.stringify(payload)} | error: ${error.message}\n`;
  try {
    const dir = path.dirname(AUDIT_FALLBACK_LOG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(AUDIT_FALLBACK_LOG_PATH, entry);
    auditLogFallbackWritesTotal.inc({ source: AUDIT_SOURCE });
  } catch (fallbackErr) {
    console.error("Failed to write audit fallback log:", fallbackErr.message);
  }
}

async function insertAuditLog({ payload, payloadHash, signature }) {
  if (isCircuitOpen()) {
    return { success: false, error: new Error("Circuit breaker open: DB writes suspended"), circuitOpen: true };
  }

  for (let attempt = 0; attempt <= AUDIT_DB_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await pool.query(
        `INSERT INTO audit_logs (merchant_id, action, status, ip_address, user_agent, payload_hash, signature)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          payload.merchant_id,
          payload.action,
          payload.status,
          payload.ip_address,
          payload.user_agent,
          payloadHash,
          signature,
        ],
      );
      recordCircuitSuccess();
      return { success: true };
    } catch (err) {
      const isRetryable = attempt < AUDIT_DB_RETRY_ATTEMPTS && isRetryablePoolError(err);
      if (!isRetryable) {
        recordCircuitFailure();
        return { success: false, error: err };
      }
      const delayMs = AUDIT_DB_RETRY_DELAY_MS * (attempt + 1);
      console.warn(
        `Audit log DB failed (attempt ${attempt + 1}/${AUDIT_DB_RETRY_ATTEMPTS + 1}): ${err.message}. Retrying in ${delayMs}ms.`,
      );
      await sleep(delayMs);
    }
  }
  recordCircuitFailure();
  return { success: false, error: new Error("Max retry attempts exceeded") };
}

/**
 * Record a merchant login attempt in the audit_logs table.
 *
 * @param {object} opts
 * @param {string|null} opts.merchantId  - UUID of the merchant (null if unknown)
 * @param {string|null} opts.ipAddress   - Remote IP from req.ip
 * @param {string|null} opts.userAgent   - User-Agent header value
 * @param {'success'|'failure'} opts.status - Outcome of the login attempt
 * @returns {Promise<void>}
 */
export async function logLoginAttempt({ merchantId, ipAddress, userAgent, status }) {
  const action = "login";

  // Guard against unexpected action values reaching the DB (issue #772)
  if (!validateAuditAction(action)) {
    console.error(`[audit] Rejected disallowed action: ${action}`);
    return;
  }
  const rateLimitKey = createAuditLogRateLimitKey({
    merchantId,
    action,
    ipAddress,
  });
  const rateLimitResult = consumeAuditLogRateLimit(rateLimitKey);
  if (!rateLimitResult.allowed) {
    auditLogRateLimitRejectionsTotal.inc({ source: AUDIT_SOURCE });
    return;
  }

  const payload = {
    merchant_id: merchantId ?? null,
    action,
    status: sanitizeAuditValue(status),
    ip_address: sanitizeAuditValue(ipAddress),
    user_agent: sanitizeAuditValue(userAgent),
    event_type: "login_attempt",
  };

  const payloadHash = hashAuditPayload(payload);
  const signature = signAuditPayload(payload);

  const writeStart = process.hrtime.bigint();
  const result = await insertAuditLog({ payload, payloadHash, signature });
  const durationSeconds = Number(process.hrtime.bigint() - writeStart) / 1e9;

  const resultTag = result.success ? "success" : result.circuitOpen ? "circuit_open" : "failure";
  auditLogWritesTotal.inc({ source: AUDIT_SOURCE, result: resultTag });
  auditLogWriteDuration.observe({ source: AUDIT_SOURCE, result: resultTag }, durationSeconds);

  if (!result.success) {
    writeFallbackLog(payload, result.error);
    console.error("Failed to write audit log:", result.error.message);
  }
}

