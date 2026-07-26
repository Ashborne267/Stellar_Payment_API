/**
 * Transaction Signer — Issues #912 (rate limiting) and #913 (crypto signature verification)
 *
 * Provides a hardened wrapper around the core `verifyTransactionSignature` function
 * from stellar.js with:
 *
 * - In-process replay attack prevention: a verified txHash is cached and any
 *   second attempt within the TTL window is rejected immediately.
 * - XDR / txHash format validation before touching the network.
 * - Rate-limit middleware factory wired to `transaction-signer-rate-limit.js`.
 * - Structured audit logging on every verification outcome.
 */

import { createHash } from "node:crypto";
import { verifyTransactionSignature } from "./stellar.js";
import {
  createTransactionSignerRateLimit,
  createTransactionSignerBurstRateLimit,
  createTransactionSignerRedisStore,
} from "./transaction-signer-rate-limit.js";
import { logger } from "./logger.js";
import {
  txSignatureVerificationTotal,
  txSignatureVerificationLatency,
  txSignatureVerificationErrors,
  txSignatureReplayAttempts,
  txSignatureCacheSize,
  txSignatureValidationFailures,
} from "./metrics.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Regex for a valid Stellar transaction hash (64 hex chars). */
const TX_HASH_REGEX = /^[a-f0-9]{64}$/i;

/**
 * How long a verified txHash is retained in the replay cache (ms).
 * Must be longer than the maximum expected Horizon finality window.
 */
const REPLAY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Maximum number of entries in the in-process replay cache. */
const REPLAY_CACHE_MAX_SIZE = 10_000;

// ── Replay Cache ──────────────────────────────────────────────────────────────

/**
 * In-process cache of recently seen txHash values that have already been
 * verified. Keyed by txHash → { verifiedAt: number }.
 *
 * This supplements (not replaces) the DB-level unique constraint on tx_id.
 * It catches replay attempts that arrive before the DB write completes.
 */
const _replayCache = new Map();

function pruneReplayCache() {
  const now = Date.now();
  for (const [hash, entry] of _replayCache) {
    if (now - entry.verifiedAt > REPLAY_CACHE_TTL_MS) {
      _replayCache.delete(hash);
    }
  }
}

function recordVerifiedHash(txHash) {
  if (_replayCache.size >= REPLAY_CACHE_MAX_SIZE) {
    // Evict oldest entry when cap is reached
    const oldest = _replayCache.keys().next().value;
    _replayCache.delete(oldest);
  }
  _replayCache.set(txHash, { verifiedAt: Date.now() });
  txSignatureCacheSize.set(_replayCache.size);
}

/** Exposed for tests only. */
export function clearReplayCache() {
  _replayCache.clear();
  txSignatureCacheSize.set(0);
}

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
  if (!TX_HASH_REGEX.test(txHash)) {
    txSignatureValidationFailures.inc({ reason: "invalid_format" });
    return { valid: false, reason: "txHash must be 64 lowercase hex characters" };
  }
  return { valid: true };
}

// ── Hardened verifyTransactionSignature ──────────────────────────────────────

/**
 * Verify a Stellar transaction's cryptographic signature with replay protection.
 *
 * @param {string} txHash - 64-char hex transaction hash
 * @param {object} [options] - Forwarded to the underlying verifyTransactionSignature
 * @returns {Promise<{ valid: boolean, reason?: string, replay?: boolean, [key: string]: unknown }>}
 */
export async function verifyTransactionSignatureSecure(txHash, options = {}) {
  const timerLabel = "transaction_signer";
  const timerEnd = txSignatureVerificationLatency.startTimer({ label: timerLabel });

  // 1. Format validation
  const formatCheck = validateTxHash(txHash);
  if (!formatCheck.valid) {
    txSignatureVerificationErrors.inc({ error_type: "validation_failure" });
    logger.warn({ txHash: String(txHash).slice(0, 10), reason: formatCheck.reason },
      "TransactionSigner: invalid txHash format rejected");
    return { valid: false, reason: formatCheck.reason };
  }

  const normalizedHash = txHash.toLowerCase();

  // 2. Replay detection — prune stale entries first
  pruneReplayCache();
  if (_replayCache.has(normalizedHash)) {
    txSignatureReplayAttempts.inc();
    txSignatureVerificationErrors.inc({ error_type: "replay_attempt" });
    logger.warn({ txHash: normalizedHash },
      "TransactionSigner: replay attempt detected — txHash already verified");
    return { valid: false, reason: "replay: txHash was already verified", replay: true };
  }

  // 3. Delegate to the core verifier
  let result;
  try {
    result = await verifyTransactionSignature(normalizedHash, options);
  } catch (err) {
    txSignatureVerificationErrors.inc({ error_type: "verification_exception" });
    logger.warn({ err, txHash: normalizedHash },
      "TransactionSigner: unexpected error during signature verification");
    return { valid: false, reason: "verification error: " + (err?.message ?? "unknown") };
  }

  // 4. Record metrics based on outcome
  if (result?.valid) {
    recordVerifiedHash(normalizedHash);
    txSignatureVerificationTotal.inc({ outcome: "valid" });
    logger.info({
      txHash: normalizedHash,
      isMultiSig: result.isMultiSig,
      signatureCount: result.signatureCount,
    }, "TransactionSigner: signature verified successfully");
  } else {
    txSignatureVerificationTotal.inc({ outcome: "invalid" });
    txSignatureVerificationErrors.inc({ error_type: "invalid_signature" });
    logger.warn({
      txHash: normalizedHash,
      reason: result?.reason ?? "unknown",
    }, "TransactionSigner: signature verification failed");
  }

  timerEnd();
  return result ?? { valid: false, reason: "verifier returned no result" };
}

// ── Express Middleware Factory ─────────────────────────────────────────────────

/**
 * Build and return an array of Express middlewares for the transaction signer
 * endpoint: burst limiter first, then standard limiter.
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
      logger.warn({ err }, "TransactionSigner: failed to create Redis store, using memory store");
    }
  }

  return [
    createTransactionSignerBurstRateLimit({ store }),
    createTransactionSignerRateLimit({ store }),
  ];
}

/**
 * Express route handler for POST /api/verify-signature.
 *
 * Expects JSON body: { txHash: string }
 * Returns: { valid: boolean, reason?: string, ... }
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
