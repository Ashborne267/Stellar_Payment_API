/**
 * Transaction Signer — Issues #912 (rate limiting), #913 (crypto signature
 * verification), #1075 (verification caching), #1077 (refactoring)
 *
 * Provides a hardened wrapper around the core `verifyTransactionSignature`
 * function from stellar.js with:
 *
 * - Replay attack prevention via an in-process LRU cache with TTL.
 * - Verification result caching (in-memory + optional Redis) to reduce
 *   redundant Horizon API calls.
 * - XDR / txHash format validation before touching the network.
 * - Rate-limit middleware factory wired to `transaction-signer-rate-limit.js`.
 * - Structured audit logging and Prometheus metrics on every outcome.
 * - Express middleware factory and route handler for `POST /api/verify-signature`.
 */

import {
  createTransactionSignerRateLimit,
  createTransactionSignerBurstRateLimit,
  createTransactionSignerRedisStore,
} from "./transaction-signer-rate-limit.js";
import { getTransactionSignerCache } from "./transaction-signer-cache.js";
import { verifyTransactionSignature } from "./stellar.js";
import { logger } from "./logger.js";
import {
  txSignatureVerificationTotal,
  txSignatureVerificationLatency,
  txSignatureVerificationErrors,
  txSignatureReplayAttempts,
  txSignatureCacheSize,
  txSignatureValidationFailures,
} from "./metrics.js";

// ── Configuration ─────────────────────────────────────────────────────────────

const CONFIG = Object.freeze({
  /** Regex for a valid Stellar transaction hash (64 hex chars). */
  TX_HASH_REGEX: /^[a-f0-9]{64}$/i,

  /** How long a verified txHash is retained in the replay cache (ms). */
  REPLAY_CACHE_TTL_MS: 5 * 60 * 1000,

  /** Maximum number of entries in the in-process replay cache. */
  REPLAY_CACHE_MAX_SIZE: 10_000,
});

// ── Replay Cache ──────────────────────────────────────────────────────────────

/**
 * In-process LRU cache of recently verified txHash values.
 *
 * Prevents replay attacks by rejecting duplicate verification requests
 * within the TTL window. This supplements (not replaces) the DB-level
 * unique constraint on tx_id.
 *
 * Designed as a standalone class for encapsulation, testability, and
 * adherence to the single-responsibility principle.
 */
class ReplayCache {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxSize] - Maximum cache entries.
   * @param {number} [options.ttlMs] - Entry time-to-live in milliseconds.
   * @param {Function} [options.nowFn] - Clock function (injectable for tests).
   */
  constructor({ maxSize = CONFIG.REPLAY_CACHE_MAX_SIZE, ttlMs = CONFIG.REPLAY_CACHE_TTL_MS, nowFn = () => Date.now() } = {}) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.nowFn = nowFn;
    /** @type {Map<string, { verifiedAt: number }>} */
    this._cache = new Map();
  }

  /**
   * Prune expired entries from the cache.
   * @returns {number} Number of entries removed.
   */
  prune() {
    const now = this.nowFn();
    let pruned = 0;
    for (const [hash, entry] of this._cache) {
      if (now - entry.verifiedAt > this.ttlMs) {
        this._cache.delete(hash);
        pruned += 1;
      }
    }
    return pruned;
  }

  /**
   * Check if a txHash has already been verified.
   * @param {string} txHash
   * @returns {boolean}
   */
  has(txHash) {
    return this._cache.has(txHash);
  }

  /**
   * Record a txHash as verified. Evicts the oldest entry when at capacity.
   * @param {string} txHash
   */
  record(txHash) {
    if (this._cache.size >= this.maxSize) {
      const oldest = this._cache.keys().next().value;
      this._cache.delete(oldest);
    }
    this._cache.set(txHash, { verifiedAt: this.nowFn() });
    txSignatureCacheSize.set(this._cache.size);
  }

  /** Clear all entries and reset the cache-size metric. */
  clear() {
    this._cache.clear();
    txSignatureCacheSize.set(0);
  }

  /** @returns {number} Current number of entries. */
  get size() {
    return this._cache.size;
  }
}

// ── Module-level instances ────────────────────────────────────────────────────

const replayCache = new ReplayCache();

// ── Input Validation ──────────────────────────────────────────────────────────

/**
 * Validate a transaction hash string before sending it to Horizon.
 *
 * @param {unknown} txHash
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateTxHash(txHash) {
  if (typeof txHash !== "string" || txHash.trim() === "") {
    txSignatureValidationFailures.inc({ reason: "empty_or_non_string" });
    return { valid: false, reason: "txHash must be a non-empty string" };
  }
  if (!CONFIG.TX_HASH_REGEX.test(txHash)) {
    txSignatureValidationFailures.inc({ reason: "invalid_format" });
    return { valid: false, reason: "txHash must be 64 lowercase hex characters" };
  }
  return { valid: true };
}

// ── Metrics Helpers ───────────────────────────────────────────────────────────

/**
 * Record metrics and log for a successful verification.
 * @param {string} txHash
 * @param {object} result
 */
function recordVerificationSuccess(txHash, result) {
  replayCache.record(txHash);
  txSignatureVerificationTotal.inc({ outcome: "valid" });
  logger.info(
    {
      txHash,
      isMultiSig: result.isMultiSig,
      signatureCount: result.signatureCount,
    },
    "TransactionSigner: signature verified successfully",
  );
}

/**
 * Record metrics and log for a failed verification.
 * @param {string} txHash
 * @param {object} result
 */
function recordVerificationFailure(txHash, result) {
  txSignatureVerificationTotal.inc({ outcome: "invalid" });
  txSignatureVerificationErrors.inc({ error_type: "invalid_signature" });
  logger.warn(
    { txHash, reason: result?.reason ?? "unknown" },
    "TransactionSigner: signature verification failed",
  );
}

/**
 * Record metrics and log for a verification exception.
 * @param {string} txHash
 * @param {Error} err
 * @returns {{ valid: false, reason: string }}
 */
function recordVerificationException(txHash, err) {
  txSignatureVerificationErrors.inc({ error_type: "verification_exception" });
  logger.warn(
    { err, txHash },
    "TransactionSigner: unexpected error during signature verification",
  );
  return { valid: false, reason: `verification error: ${err?.message ?? "unknown"}` };
}

// ── Core Verification ─────────────────────────────────────────────────────────

/**
 * Verify a Stellar transaction's cryptographic signature with replay protection
 * and result caching.
 *
 * Pipeline:
 *   1. Format validation (reject malformed txHash before network call)
 *   2. Replay detection (in-process cache with TTL)
 *   3. Verification cache lookup (in-memory LRU + optional Redis)
 *   4. Core cryptographic verification via Horizon
 *   5. Cache the result for future lookups
 *   6. Record metrics and structured logs
 *
 * @param {string} txHash - 64-char hex transaction hash
 * @param {object} [options] - Forwarded to the underlying verifyTransactionSignature
 * @returns {Promise<{ valid: boolean, reason?: string, replay?: boolean, [key: string]: unknown }>}
 */
export async function verifyTransactionSignatureSecure(txHash, options = {}) {
  const timerEnd = txSignatureVerificationLatency.startTimer({ label: "transaction_signer" });

  try {
    // ── Step 1: Format validation ──────────────────────────────────────────────
    const formatCheck = validateTxHash(txHash);
    if (!formatCheck.valid) {
      txSignatureVerificationErrors.inc({ error_type: "validation_failure" });
      logger.warn(
        { txHash: String(txHash).slice(0, 10), reason: formatCheck.reason },
        "TransactionSigner: invalid txHash format rejected",
      );
      return { valid: false, reason: formatCheck.reason };
    }

    const normalizedHash = txHash.toLowerCase();

    // ── Step 2: Replay detection ───────────────────────────────────────────────
    replayCache.prune();
    if (replayCache.has(normalizedHash)) {
      txSignatureReplayAttempts.inc();
      txSignatureVerificationErrors.inc({ error_type: "replay_attempt" });
      logger.warn(
        { txHash: normalizedHash },
        "TransactionSigner: replay attempt detected — txHash already verified",
      );
      return { valid: false, reason: "replay: txHash was already verified", replay: true };
    }

    // ── Step 3: Verification cache lookup ──────────────────────────────────────
    const cache = getTransactionSignerCache();
    const cached = await cache.get(normalizedHash);
    if (cached.hit) {
      txSignatureVerificationTotal.inc({ outcome: cached.result?.valid ? "valid" : "invalid" });
      logger.debug(
        { txHash: normalizedHash, cached: true },
        "TransactionSigner: returning cached verification result",
      );
      return cached.result;
    }

    // ── Step 4: Core cryptographic verification ────────────────────────────────
    let result;
    try {
      result = await verifyTransactionSignature(normalizedHash, options);
    } catch (err) {
      return recordVerificationException(normalizedHash, err);
    }

    const finalResult = result ?? { valid: false, reason: "verifier returned no result" };

    // ── Step 5: Cache the result ───────────────────────────────────────────────
    await cache.set(normalizedHash, finalResult, !!finalResult.valid);

    // ── Step 6: Metrics and logging ────────────────────────────────────────────
    if (finalResult.valid) {
      recordVerificationSuccess(normalizedHash, finalResult);
    } else {
      recordVerificationFailure(normalizedHash, finalResult);
    }

    return finalResult;
  } finally {
    timerEnd();
  }
}

// ── Replay Cache Exports (Testing) ───────────────────────────────────────────

/** Clear the replay cache. Exposed for tests only. */
export function clearReplayCache() {
  replayCache.clear();
}

// ── Express Integration ───────────────────────────────────────────────────────

/**
 * Build an array of Express middlewares for the transaction signer endpoint:
 * burst limiter first, then standard limiter.
 *
 * @param {object} [options]
 * @param {import('ioredis').Redis} [options.redisClient] - Redis client for distributed limiting
 * @returns {import('express').RequestHandler[]}
 */
export function createTransactionSignerMiddlewares({ redisClient } = {}) {
  let store;
  if (redisClient) {
    try {
      store = createTransactionSignerRedisStore({ client: redisClient });
    } catch (err) {
      logger.warn(
        { err },
        "TransactionSigner: failed to create Redis store, using memory store",
      );
    }
  }

  return [
    createTransactionSignerBurstRateLimit({ store }),
    createTransactionSignerRateLimit({ store }),
  ];
}

/**
 * Express route handler for `POST /api/verify-signature`.
 *
 * Expects JSON body: `{ txHash: string }` or query param `?txHash=...`.
 * Returns `{ valid: boolean, reason?: string, ... }` with appropriate status.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handleVerifySignature(req, res) {
  const txHash = req.body?.txHash ?? req.query?.txHash;

  const formatCheck = validateTxHash(txHash);
  if (!formatCheck.valid) {
    return res.status(400).json({ error: formatCheck.reason });
  }

  try {
    const result = await verifyTransactionSignatureSecure(txHash);
    return res.status(result.valid ? 200 : 422).json(result);
  } catch (err) {
    logger.warn({ err }, "TransactionSigner route: unhandled error");
    return res.status(500).json({ error: "Internal server error" });
  }
}
