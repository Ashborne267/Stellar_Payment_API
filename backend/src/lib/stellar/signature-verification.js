/**
 * Signature Verification - Transaction signature validation
 * 
 * This module handles cryptographic signature verification for Stellar transactions:
 * - Transaction envelope parsing
 * - Signature validation
 * - Multi-sig support
 * - Fee-bump transaction handling
 */

import * as StellarSdk from "stellar-sdk";
import { logger } from "../logger.js";
import {
  signatureVerificationOperations,
  signatureVerificationLatency,
  signatureVerificationReplayDetected,
} from "../metrics.js";

/**
 * Perform full cryptographic signature verification for a Stellar transaction
 * 
 * Verification steps:
 *  1. Fetch the transaction envelope from Horizon
 *  2. Deserialise the XDR envelope and confirm at least one signature is present
 *  3. Load the source account to obtain its current signer list and thresholds
 *  4. For each signature in the envelope, derive the signer's public key via
 *     Ed25519 key-recovery and check it against the account's authorised signers
 *  5. Accumulate signing weight and verify it meets the account's medium threshold
 *     (used for payment operations)
 * 
 * @param {object} horizonClient - Horizon client instance
 * @param {string} txHash - The transaction hash to verify
 * @param {string} networkPassphrase - Network passphrase for XDR parsing
 * @param {object} options - Optional configuration
 * @returns {Promise<SignatureVerificationResult>}
 */
export async function verifyTransactionSignature(
  horizonClient,
  txHash,
  networkPassphrase,
  options = {}
) {
  const { maxRetries = 3, retryDelay = 1000 } = options;
  const startTime = Date.now();
  
  if (!txHash || typeof txHash !== "string") {
    logger.error(
      { txHash, type: typeof txHash },
      "verifyTransactionSignature: Invalid input"
    );
    signatureVerificationOperations.inc({ result: "error" });
    signatureVerificationLatency.observe(
      { result: "error" },
      (Date.now() - startTime) / 1000
    );
    return {
      valid: false,
      reason: "Invalid transaction hash provided",
      isMultiSig: false,
      signatureCount: 0,
      thresholdMet: false,
    };
  }

  // Step 1: Fetch transaction envelope from Horizon with retry logic
  const txResult = await fetchTransactionWithRetry(
    horizonClient,
    txHash,
    maxRetries,
    retryDelay,
    startTime
  );
  
  if (!txResult.success) {
    return txResult.result;
  }

  const tx = txResult.transaction;

  // Step 2: Deserialise XDR envelope (supports fee-bump transactions)
  const parseResult = parseTransactionEnvelope(tx, txHash, networkPassphrase, startTime);
  if (!parseResult.success) {
    return parseResult.result;
  }

  const { transaction, isFeeBump } = parseResult;

  // Step 3: Load source account signers & thresholds
  const accountResult = await loadSourceAccount(
    horizonClient,
    transaction.source,
    txHash,
    startTime
  );
  
  if (!accountResult.success) {
    return accountResult.result;
  }

  const { signers, medThreshold, isMultiSig } = accountResult;

  // Step 4: Verify each signature cryptographically
  const verificationResult = verifySignatures(
    transaction,
    signers,
    medThreshold,
    txHash,
    startTime
  );

  // Step 5: Return final result
  signatureVerificationOperations.inc({ result: verificationResult.valid ? "valid" : "invalid" });
  signatureVerificationLatency.observe(
    { result: verificationResult.valid ? "valid" : "invalid" },
    (Date.now() - startTime) / 1000
  );

  return {
    valid: verificationResult.valid,
    reason: verificationResult.reason,
    isMultiSig,
    signatureCount: transaction.signatures.length,
    thresholdMet: verificationResult.thresholdMet,
    isFeeBump,
  };
}

/**
 * Fetch transaction from Horizon with retry logic
 */
async function fetchTransactionWithRetry(
  horizonClient,
  txHash,
  maxRetries,
  retryDelay,
  startTime
) {
  let retryCount = 0;
  
  while (retryCount <= maxRetries) {
    try {
      const tx = await horizonClient.fetchTransaction(txHash);
      return { success: true, transaction: tx };
    } catch (err) {
      const isTransient = 
        err?.response?.status >= 500 || 
        err?.code === 'ECONNREFUSED' || 
        err?.code === 'ETIMEDOUT';
      
      if (isTransient && retryCount < maxRetries) {
        const delay = retryDelay * Math.pow(2, retryCount);
        logger.warn(
          {
            txHash,
            retry: retryCount + 1,
            maxRetries,
            delayMs: delay,
            error: err.message,
          },
          "verifyTransactionSignature: Transient error, retrying"
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        retryCount++;
        continue;
      }
      
      logger.error(
        {
          txHash,
          errorStatus: err?.response?.status,
          errorCode: err?.code,
          retryCount,
          error: err.message,
        },
        "verifyTransactionSignature: Failed to fetch transaction"
      );
      
      signatureVerificationOperations.inc({ result: "error" });
      signatureVerificationLatency.observe(
        { result: "error" },
        (Date.now() - startTime) / 1000
      );
      
      return {
        success: false,
        result: {
          valid: false,
          reason: `Failed to fetch transaction from Horizon: ${err.message}`,
          isMultiSig: false,
          signatureCount: 0,
          thresholdMet: false,
        },
      };
    }
  }

  // Should not reach here
  return {
    success: false,
    result: {
      valid: false,
      reason: "Max retries exceeded fetching transaction",
      isMultiSig: false,
      signatureCount: 0,
      thresholdMet: false,
    },
  };
}

/**
 * Parse transaction envelope, handling fee-bump transactions
 */
function parseTransactionEnvelope(tx, txHash, networkPassphrase, startTime) {
  let transaction;
  let isFeeBump = false;
  
  try {
    transaction = new StellarSdk.Transaction(tx.envelope_xdr, networkPassphrase);
  } catch (parseErr) {
    // The Transaction constructor cannot parse a fee-bump envelope. Unwrap it
    // and verify the INNER transaction's signatures: the fee-bump's own
    // signature only authorises the fee payer, not the payment, so verifying
    // the wrapper alone would let an attacker fee-bump someone else's unsigned
    // transaction. Verifying the inner transaction closes that gap.
    try {
      const envelope = StellarSdk.TransactionBuilder.fromXDR(
        tx.envelope_xdr,
        networkPassphrase
      );
      if (envelope instanceof StellarSdk.FeeBumpTransaction) {
        transaction = envelope.innerTransaction;
        isFeeBump = true;
      } else {
        throw parseErr;
      }
    } catch (err) {
      logger.error(
        {
          txHash,
          xdrLength: tx.envelope_xdr?.length,
          errorName: err.name,
          errorMessage: err.message,
        },
        "verifyTransactionSignature: Failed to parse XDR"
      );
      
      signatureVerificationOperations.inc({ result: "error" });
      signatureVerificationLatency.observe(
        { result: "error" },
        (Date.now() - startTime) / 1000
      );
      
      return {
        success: false,
        result: {
          valid: false,
          reason: `Failed to parse transaction XDR: ${err.message}`,
          isMultiSig: false,
          signatureCount: 0,
          thresholdMet: false,
        },
      };
    }
  }

  const signatures = transaction.signatures;
  if (!signatures || signatures.length === 0) {
    logger.warn({ txHash }, "verifyTransactionSignature: No signatures found");
    
    signatureVerificationOperations.inc({ result: "invalid" });
    signatureVerificationLatency.observe(
      { result: "invalid" },
      (Date.now() - startTime) / 1000
    );
    
    return {
      success: false,
      result: {
        valid: false,
        reason: "Transaction envelope contains no signatures",
        isMultiSig: false,
        signatureCount: 0,
        thresholdMet: false,
      },
    };
  }

  return { success: true, transaction, isFeeBump };
}

/**
 * Load source account for threshold and signer information
 */
async function loadSourceAccount(horizonClient, sourceAccountId, txHash, startTime) {
  try {
    const accountData = await horizonClient.loadAccount(sourceAccountId);
    
    const signers = accountData.signers ?? [];
    const medThreshold = accountData.thresholds?.med_threshold ?? 0;
    const isMultiSig = signers.length > 1 || medThreshold > 1;

    return { success: true, signers, medThreshold, isMultiSig };
  } catch (err) {
    logger.warn(
      {
        txHash,
        sourceAccountId,
        errorStatus: err?.response?.status,
        errorMessage: err.message,
      },
      "verifyTransactionSignature: Could not load source account"
    );
    
    signatureVerificationOperations.inc({ result: "error" });
    signatureVerificationLatency.observe(
      { result: "error" },
      (Date.now() - startTime) / 1000
    );
    
    return {
      success: false,
      result: {
        valid: false,
        reason: `Could not load source account for weight verification: ${err.message}`,
        isMultiSig: false,
        signatureCount: 0,
        thresholdMet: false,
      },
    };
  }
}

/**
 * Verify signatures against account signers
 */
function verifySignatures(transaction, signers, medThreshold, txHash, startTime) {
  // Build a lookup map: publicKey → weight for O(1) access
  const signerWeightMap = new Map(
    signers.map((s) => [s.key, s.weight])
  );

  // The transaction hash is the payload that was signed
  const txHashBytes = transaction.hash();

  let totalWeight = 0;
  let validSignatureCount = 0;
  const usedSigners = new Set(); // Prevent signature replay
  let replayAttemptsDetected = 0;

  for (const decoratedSig of transaction.signatures) {
    // hint is the last 4 bytes of the public key — use it to narrow candidates
    const hint = decoratedSig.hint();
    const sigBytes = decoratedSig.signature();

    for (const [publicKey, weight] of signerWeightMap) {
      if (usedSigners.has(publicKey)) {
        replayAttemptsDetected++;
        continue; // Skip already used signers - replay attempt
      }

      // Quick hint check before expensive crypto
      const keyPair = StellarSdk.Keypair.fromPublicKey(publicKey);
      const keyHint = keyPair.signatureHint();

      if (!hint.equals(keyHint)) continue;

      // Full Ed25519 signature verification
      try {
        const isValid = keyPair.verify(txHashBytes, sigBytes);
        if (isValid) {
          totalWeight += weight;
          validSignatureCount += 1;
          usedSigners.add(publicKey);
          break; // move to next signature
        }
      } catch {
        // Malformed signature bytes — skip
      }
    }
  }

  // Log replay attempts for security monitoring
  if (replayAttemptsDetected > 0) {
    signatureVerificationReplayDetected.inc();
    logger.warn(
      {
        txHash,
        replayAttemptsDetected,
        totalSignatures: transaction.signatures.length,
      },
      "verifyTransactionSignature: Signature replay attempts detected"
    );
  }

  // Check medium threshold — Payment operations require medium threshold authorisation
  const effectiveThreshold = medThreshold > 0 ? medThreshold : 1;
  const thresholdMet = totalWeight >= effectiveThreshold;

  if (!thresholdMet) {
    logger.warn(
      {
        txHash,
        totalWeight,
        requiredThreshold: effectiveThreshold,
        signatureCount: transaction.signatures.length,
        validSignatureCount,
      },
      "verifyTransactionSignature: Insufficient signing weight"
    );
    
    return {
      valid: false,
      reason: `Insufficient signing weight: accumulated ${totalWeight}, required ${effectiveThreshold} (medium threshold)`,
      thresholdMet: false,
    };
  }

  logger.info(
    {
      txHash,
      totalWeight,
      threshold: effectiveThreshold,
      signatureCount: transaction.signatures.length,
      validSignatureCount,
      durationMs: Date.now() - startTime,
    },
    "verifyTransactionSignature: Successfully verified"
  );

  return {
    valid: true,
    reason: `Signature verification passed: weight ${totalWeight} >= threshold ${effectiveThreshold}`,
    thresholdMet: true,
  };
}