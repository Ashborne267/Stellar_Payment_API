import jwt from "jsonwebtoken";
import * as StellarSdk from "stellar-sdk";
import { randomBytes } from "node:crypto";
import { logger } from "./logger.js";

const DEFAULT_HOME_DOMAIN = "localhost";

const NETWORK = (process.env.STELLAR_NETWORK || "testnet").toLowerCase();
const NETWORK_PASSPHRASE =
  NETWORK === "public"
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET;

export const CHALLENGE_EXPIRES_IN = 300;
export const MAX_CHALLENGE_XDR_BYTES = 8192;
export const MIN_CHALLENGE_NONCE_LENGTH = 16;

const NONCE_CLEANUP_INTERVAL = 600_000;
const MAX_NONCE_CACHE = 10_000;
const STORE_RETRY_DELAYS_MS = [100, 300];

const _usedNonces = new Set();
let _nonceCleanupTimer = null;

/**
 * Structured error for SEP-10 route/store failures (#587).
 */
export class Sep10AuthError extends Error {
  constructor(code, message, httpStatus = 400, { retryable = false, cause } = {}) {
    super(message);
    this.name = "Sep10AuthError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    if (cause) this.cause = cause;
  }
}

export function getHomeDomain() {
  const configured = process.env.HOME_DOMAIN;
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured.trim();
  }
  return DEFAULT_HOME_DOMAIN;
}

export function getNetworkPassphrase() {
  return NETWORK_PASSPHRASE;
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required for SEP-10 authentication");
  }
  return secret;
}

function startNonceCleanup() {
  if (_nonceCleanupTimer) return;
  _nonceCleanupTimer = setInterval(() => {
    if (_usedNonces.size > MAX_NONCE_CACHE) {
      _usedNonces.clear();
    }
  }, NONCE_CLEANUP_INTERVAL);
  if (_nonceCleanupTimer.unref) _nonceCleanupTimer.unref();
}

function isNonceReused(nonce) {
  if (_usedNonces.has(nonce)) return true;
  _usedNonces.add(nonce);
  if (_usedNonces.size === 1) startNonceCleanup();
  return false;
}

export function _resetNonceCacheForTests() {
  _usedNonces.clear();
  if (_nonceCleanupTimer) {
    clearInterval(_nonceCleanupTimer);
    _nonceCleanupTimer = null;
  }
}

function getServerSigningKey() {
  return process.env.SEP10_SERVER_SIGNING_KEY;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableSep10StoreError(error) {
  if (!error) return false;
  const message = String(error.message || "");
  return (
    /fetch failed|timeout|ECONNRESET|ETIMEDOUT|502|503|504|temporarily unavailable/i.test(
      message,
    ) || error.code === "PGRST000"
  );
}

/**
 * Retry transient store failures before surfacing a retryable 503 (#587).
 */
export async function withSep10StoreRecovery(fn, label) {
  let lastError = null;

  for (let attempt = 0; attempt <= STORE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryableSep10StoreError(err) || attempt === STORE_RETRY_DELAYS_MS.length) {
        if (isRetryableSep10StoreError(err)) {
          logger.warn({ label, attempt }, "sep10 store temporarily unavailable");
          throw new Sep10AuthError(
            "SERVICE_UNAVAILABLE",
            "Authentication store temporarily unavailable, please retry",
            503,
            { retryable: true, cause: err },
          );
        }
        throw err;
      }
      await sleep(STORE_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
}

/**
 * Guard against oversized or malformed challenge XDR before parsing (#588).
 */
export function validateChallengeXdr(challengeXdr) {
  if (typeof challengeXdr !== "string" || challengeXdr.trim().length === 0) {
    return { valid: false, error: "Missing challenge transaction" };
  }

  const trimmed = challengeXdr.trim();
  if (trimmed.length > MAX_CHALLENGE_XDR_BYTES) {
    return { valid: false, error: "Challenge transaction exceeds maximum size" };
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return { valid: false, error: "Invalid challenge transaction encoding" };
  }

  return { valid: true };
}

export function generateChallenge(clientAccountId, homeDomain = getHomeDomain()) {
  const serverSigningKey = getServerSigningKey();

  if (!serverSigningKey) {
    throw new Error("SEP-0010 server signing key not configured");
  }

  try {
    StellarSdk.Keypair.fromPublicKey(clientAccountId);
  } catch {
    throw new Error("Invalid client Stellar account");
  }

  const serverKeypair = StellarSdk.Keypair.fromSecret(serverSigningKey);
  const nonce = randomBytes(32).toString("base64");

  const now = Math.floor(Date.now() / 1000);
  const minTime = now.toString();
  const maxTime = (now + CHALLENGE_EXPIRES_IN).toString();

  const account = new StellarSdk.Account(serverKeypair.publicKey(), "-1");

  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
    timebounds: {
      minTime,
      maxTime,
    },
  })
    .addOperation(
      StellarSdk.Operation.manageData({
        name: `${homeDomain} auth`,
        value: nonce,
        source: clientAccountId,
      }),
    )
    .build();

  transaction.sign(serverKeypair);

  return transaction.toXDR();
}

/**
 * Verify a signed SEP-0010 challenge transaction.
 * @returns {{ valid: boolean, error?: string, code?: string }}
 */
export function verifyChallenge(challengeXdr, clientAccountId, homeDomain = getHomeDomain()) {
  const serverSigningKey = getServerSigningKey();

  if (!serverSigningKey) {
    return { valid: false, error: "SEP-0010 not configured", code: "NOT_CONFIGURED" };
  }

  const xdrValidation = validateChallengeXdr(challengeXdr);
  if (!xdrValidation.valid) {
    return { valid: false, error: xdrValidation.error, code: "INVALID_XDR" };
  }

  try {
    StellarSdk.Keypair.fromPublicKey(clientAccountId);
  } catch {
    return { valid: false, error: "Invalid client account", code: "INVALID_ACCOUNT" };
  }

  try {
    const serverKeypair = StellarSdk.Keypair.fromSecret(serverSigningKey);
    const transaction = new StellarSdk.TransactionBuilder.fromXDR(
      challengeXdr,
      NETWORK_PASSPHRASE,
    );

    if (transaction.operations.length !== 1) {
      return { valid: false, error: "Invalid challenge structure", code: "INVALID_STRUCTURE" };
    }

    const operation = transaction.operations[0];
    if (operation.type !== "manageData") {
      return { valid: false, error: "Invalid operation type", code: "INVALID_OPERATION" };
    }

    if (operation.source !== clientAccountId) {
      return { valid: false, error: "Client account mismatch", code: "ACCOUNT_MISMATCH" };
    }

    const expectedName = `${homeDomain} auth`;
    if (operation.name !== expectedName) {
      return { valid: false, error: "Challenge data name mismatch", code: "HOME_DOMAIN_MISMATCH" };
    }

    const valueStr =
      typeof operation.value === "string" ? operation.value : operation.value?.toString();
    if (typeof valueStr !== "string" || valueStr.length < MIN_CHALLENGE_NONCE_LENGTH) {
      return { valid: false, error: "Invalid challenge nonce", code: "INVALID_NONCE" };
    }

    if (isNonceReused(valueStr)) {
      return { valid: false, error: "Challenge nonce already used", code: "NONCE_REPLAY" };
    }

    const now = Math.floor(Date.now() / 1000);
    const { minTime, maxTime } = transaction.timeBounds;

    if (now < parseInt(minTime, 10) || now > parseInt(maxTime, 10)) {
      return { valid: false, error: "Challenge expired", code: "CHALLENGE_EXPIRED" };
    }

    const txHash = transaction.hash();

    const serverKeypairForVerify = StellarSdk.Keypair.fromSecret(serverSigningKey);
    const serverSigned = transaction.signatures.some((sig) => {
      try {
        return serverKeypairForVerify.verify(txHash, sig.signature());
      } catch {
        return false;
      }
    });

    if (!serverSigned) {
      return { valid: false, error: "Server signature missing", code: "SERVER_SIGNATURE_MISSING" };
    }

    const clientKeypair = StellarSdk.Keypair.fromPublicKey(clientAccountId);
    const clientSigned = transaction.signatures.some((sig) => {
      try {
        return clientKeypair.verify(txHash, sig.signature());
      } catch {
        return false;
      }
    });

    if (!clientSigned) {
      return {
        valid: false,
        error: "Client signature missing or invalid",
        code: "CLIENT_SIGNATURE_INVALID",
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Authentication failed", code: "AUTHENTICATION_FAILED" };
  }
}

/**
 * Look up a merchant by Stellar recipient with transient-error recovery (#587).
 */
export async function lookupMerchantByStellarAddress(clientAccount, supabaseClient) {
  return withSep10StoreRecovery(async () => {
    const { data, error } = await supabaseClient
      .from("merchants")
      .select("id, email, business_name, notification_email")
      .eq("recipient", clientAccount)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      if (isRetryableSep10StoreError(error)) {
        throw error;
      }
      error.status = 500;
      throw error;
    }

    return data;
  }, "sep10_merchant_lookup");
}

export function generateSessionToken(merchantId, email) {
  return jwt.sign(
    {
      id: merchantId,
      email: email,
      merchant_id: merchantId,
    },
    getJwtSecret(),
    { expiresIn: "24h" },
  );
}

export function verifySessionToken(token) {
  try {
    const payload = jwt.verify(token, getJwtSecret());
    return { valid: true, payload };
  } catch {
    return { valid: false, error: "Invalid or expired session token" };
  }
}
