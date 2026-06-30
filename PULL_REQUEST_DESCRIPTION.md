# Pull Request Description

## Title
`feat(backend): add cryptographic signature verification to Audit Logger`

## Overview
This PR implements cryptographic signature verification and payload integrity checks for the Audit Logger module during log retrieval. It enhances the platform's security posture and tamper-evidence guarantees, fulfilling the backend system optimization requirements.

## Detailed Changes

### 1. Database Query Enhancements (`backend/src/services/auditService.js`)
* Updated the SQL SELECT query in `getAuditLogs` to retrieve necessary integrity fields: `merchant_id`, `status`, `payload_hash`, and `signature`.
* Preserved index utilization by ordering by `timestamp DESC` and filtering on `merchant_id` to prevent performance degradation on large tables.

### 2. Dual-Layer Log Integrity Verification (`backend/src/services/auditService.js`)
* Implemented payload reconstruction logic distinguishing between login attempt events and regular administrative events.
* Added deterministic SHA-256 hash comparison against the stored `payload_hash` to detect any field tampering.
* Implemented HMAC-SHA256 signature verification via `verifyAuditSignature` using constant-time comparison to guard against timing attacks.
* Exposes `hash_verified` and `signature_verified` flags for each log entry.
* Logs warnings/errors if any tampering is detected (e.g. hash or signature mismatch).

### 3. Comprehensive Unit Testing (`backend/src/services/auditService.test.js`)
* Added unit tests covering:
  - Verification of matching payload hashes and signatures.
  - Tamper detection with mismatching hashes and signatures.
  - Graceful handling of legacy unsigned logs or missing environment secrets.

---

## Linked Issues
Closes #769
