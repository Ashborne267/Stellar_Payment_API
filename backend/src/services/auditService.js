import { AuditCircuitBreaker, CircuitState } from "../lib/audit-circuit-breaker.js";
import { replayFallbackLogs } from "../lib/audit-replay.js";
import { pool, isRetryablePoolError } from "../lib/db.js";
import {
  consumeAuditLogRateLimit,
  createAuditLogRateLimitKey,
  hashAuditPayload,
  sanitizeAuditKey,
  sanitizeAuditValue,
  signAuditPayload,
  validateAuditAction,
  verifyRowIntegrity,
} from "../lib/audit-security.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_FALLBACK_LOG_PATH = process.env.AUDIT_FALLBACK_LOG_PATH || path.join(__dirname, "../../logs/audit_fallback.log");
const AUDIT_DB_RETRY_ATTEMPTS = Number.parseInt(process.env.AUDIT_DB_RETRY_ATTEMPTS || "2", 10);
const AUDIT_DB_RETRY_DELAY_MS = Number.parseInt(process.env.AUDIT_DB_RETRY_DELAY_MS || "100", 10);

/**
 * Circuit-breaker for the auditService DB path (issue #771).
 * Mirrors the circuit in lib/audit.js so that both log paths independently
 * protect against DB overload during outages.
 */
const SVC_CIRCUIT_FAILURE_THRESHOLD = Number.parseInt(process.env.AUDIT_CIRCUIT_FAILURE_THRESHOLD || "5", 10);
const SVC_CIRCUIT_RESET_MS = Number.parseInt(process.env.AUDIT_CIRCUIT_RESET_MS || "60000", 10);

const svcCircuitBreaker = new AuditCircuitBreaker({
  failureThreshold: SVC_CIRCUIT_FAILURE_THRESHOLD,
  resetTimeoutMs: SVC_CIRCUIT_RESET_MS,
  label: "audit-service",
  onClose: () => {
    replayFallbackLogs(AUDIT_FALLBACK_LOG_PATH).catch((err) => {
      console.error("[Audit Replay] Fallback log replay failed:", err.message);
    });
  },
});

export function _resetSvcCircuitForTests() {
  svcCircuitBreaker.reset();
}

function isSvcCircuitOpen(now = Date.now()) {
  return svcCircuitBreaker.isOpen(now);
}

function recordSvcSuccess() {
  svcCircuitBreaker.recordSuccess();
}

function recordSvcFailure(now = Date.now()) {
  svcCircuitBreaker.recordFailure(now);
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
  } catch (fallbackErr) {
    console.error("Failed to write audit fallback log:", fallbackErr.message);
  }
}

async function insertAuditLog({ payload, payloadHash, signature }) {
  if (isSvcCircuitOpen()) {
    return { success: false, error: new Error("Circuit breaker open: DB writes suspended"), circuitOpen: true };
  }

  for (let attempt = 0; attempt <= AUDIT_DB_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await optimizedWrite(
        `INSERT INTO audit_logs (merchant_id, action, field_changed, old_value, new_value, ip_address, user_agent, payload_hash, signature)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          payload.merchant_id,
          payload.action,
          payload.field_changed,
          payload.old_value,
          payload.new_value,
          payload.ip_address,
          payload.user_agent,
          payloadHash,
          signature,
        ],
        {
          label: "insert_audit_log",
          merchantId: payload.merchant_id,
        }
      );
      recordSvcSuccess();
      return { success: true };
    } catch (err) {
      const isRetryable = attempt < AUDIT_DB_RETRY_ATTEMPTS && isRetryablePoolError(err);
      if (!isRetryable) {
        recordSvcFailure();
        return { success: false, error: err };
      }
      const delayMs = AUDIT_DB_RETRY_DELAY_MS * (attempt + 1);
      console.warn(
        `Audit log DB failed (attempt ${attempt + 1}/${AUDIT_DB_RETRY_ATTEMPTS + 1}): ${err.message}. Retrying in ${delayMs}ms.`,
      );
      await sleep(delayMs);
    }
  }
  recordSvcFailure();
  return { success: false, error: new Error("Max retry attempts exceeded") };
}

export const auditService = {
  /**
   * Retrieve paginated audit logs for a merchant.
   *
   * Splits paginated queries into parallel count and row retrieval queries (issue #770)
   * executed via optimizedQuery to allow cacheability and avoid full table scan
   * materialization in Postgres.
   */
  async getAuditLogs(merchantId, page = 1, limit = 50) {
    let p = parseInt(page, 10) || 1;
    let l = parseInt(limit, 10) || 50;

    if (p < 1) p = 1;
    if (l < 1) l = 1;
    if (l > 100) l = 100;

    const offset = (p - 1) * l;

    // Single query: window function returns the full-table count alongside
    // each row, eliminating the separate COUNT(*) round-trip (issue #770).
    const result = await pool.query(
      `SELECT id, merchant_id, action, field_changed, old_value, new_value, ip_address, user_agent, timestamp, payload_hash, signature,
              COUNT(*) OVER() AS total_count
       FROM audit_logs
       WHERE merchant_id = $1
       ORDER BY timestamp DESC
       LIMIT $2 OFFSET $3`,
      [merchantId, l, offset],
    );

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
    
    // Verify cryptographic integrity of each row before returning
    const logs = result.rows.map(({ total_count: _tc, ...row }) => {
      const integrity = verifyRowIntegrity(row);
      return {
        id: row.id,
        action: row.action,
        field_changed: row.field_changed,
        old_value: row.old_value,
        new_value: row.new_value,
        ip_address: row.ip_address,
        user_agent: row.user_agent,
        timestamp: row.timestamp,
        integrity_status: integrity.status,
      };
    });

    return {
      logs,
      total_count: totalCount,
      total_pages: Math.ceil(totalCount / l),
      page: p,
      limit: l,
    };
  },

  async logEvent({
    merchantId,
    action,
    fieldChanged,
    oldValue,
    newValue,
    ipAddress,
    userAgent,
  }) {
    // Reject unknown action values to prevent log-injection (issue #772)
    if (!validateAuditAction(action)) {
      console.error(`[auditService] Rejected disallowed audit action: ${action}`);
      return;
    }

    const rateLimitKey = createAuditLogRateLimitKey({
      merchantId,
      action,
      ipAddress,
    });
    const rateLimitResult = consumeAuditLogRateLimit(rateLimitKey);
    if (!rateLimitResult.allowed) {
      return;
    }

    const payload = {
      merchant_id: merchantId,
      action: sanitizeAuditValue(action),
      field_changed: sanitizeAuditKey(fieldChanged),
      old_value: sanitizeAuditValue(oldValue),
      new_value: sanitizeAuditValue(newValue),
      ip_address: sanitizeAuditValue(ipAddress),
      user_agent: sanitizeAuditValue(userAgent),
    };

    const payloadHash = hashAuditPayload(payload);
    const signature = signAuditPayload(payload);

    const result = await insertAuditLog({ payload, payloadHash, signature });

    if (!result.success) {
      writeFallbackLog(payload, result.error);
      console.error("Failed to log audit event:", result.error.message);
    }
  },
};
