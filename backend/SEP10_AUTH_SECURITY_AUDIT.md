# SEP-10 Authentication Security Audit

**Module:** `backend/src/lib/sep10-auth.js`, `backend/src/routes/auth.js`  
**Issues:** #588 (audit), #587 (error recovery), #733 (rate limiting)  
**Date:** 2026-06-23

## Scope

This audit covers the SEP-0010 Web Authentication flow: challenge generation, signed transaction verification, merchant lookup, and session token issuance.

## Threat Model

| Threat | Mitigation | Status |
|--------|------------|--------|
| Challenge replay | In-memory nonce cache rejects reused nonces | ✅ Implemented |
| Oversized/malformed XDR | `validateChallengeXdr` enforces size (8 KB) and base64 charset | ✅ Implemented |
| Home-domain spoofing | Challenge and verify both use `getHomeDomain()`; mismatch returns `HOME_DOMAIN_MISMATCH` | ✅ Fixed |
| Missing server/client signatures | Both signatures verified against transaction hash | ✅ Implemented |
| Expired challenges | Time bounds checked against server clock | ✅ Implemented |
| Brute-force challenge/verify | Per-account+IP challenge limits; per-IP verify limits (#733) | ✅ Implemented |
| JWT secret fallback | `JWT_SECRET` required at runtime; no default secret | ✅ Implemented |
| Store outage during verify | Transient Supabase errors retried; retryable 503 returned (#587) | ✅ Implemented |
| Information leakage via errors | Generic `AUTHENTICATION_FAILED` for parse failures; structured codes for known cases | ✅ Implemented |

## Findings & Remediation

### High — Home domain inconsistency (fixed)

**Issue:** Challenge generation defaulted to `localhost` while verification used `process.env.HOME_DOMAIN`, allowing valid-looking challenges to fail verification in production.

**Fix:** Centralized domain resolution in `getHomeDomain()` and used it in both `generateChallenge` and `verifyChallenge`.

### Medium — Missing XDR size guard (fixed)

**Issue:** Unbounded XDR input could be used for DoS via expensive parsing.

**Fix:** `MAX_CHALLENGE_XDR_BYTES` (8192) enforced before Stellar SDK parsing.

### Medium — No structured error recovery on merchant lookup (fixed)

**Issue:** Transient database errors surfaced as opaque 500 responses.

**Fix:** `lookupMerchantByStellarAddress` wraps Supabase calls with `withSep10StoreRecovery`, returning retryable `503 SERVICE_UNAVAILABLE`.

### Low — Generic catch in verifyChallenge (accepted)

**Issue:** Unexpected parse errors return a generic message without leaking SDK internals.

**Status:** Accepted — intentional fail-closed behavior.

## Rate Limiting (#733)

| Endpoint | Key | Default window | Default max |
|----------|-----|----------------|-------------|
| `POST /api/auth/challenge` | `sep10:challenge:{account}:{ip}` | 60s | 20 |
| `POST /api/auth/verify` | `sep10:verify:{ip}` | 60s | 10 |

Redis-backed store (`rl:sep10:` prefix) is used when `REDIS_URL` is available; in-memory fallback otherwise.

### Environment variables

```
SEP10_CHALLENGE_RATE_LIMIT_WINDOW_MS=60000
SEP10_CHALLENGE_RATE_LIMIT_MAX=20
SEP10_VERIFY_RATE_LIMIT_WINDOW_MS=60000
SEP10_VERIFY_RATE_LIMIT_MAX=10
```

## Recommendations (future work)

1. **Distributed nonce store:** Replace in-process nonce cache with Redis for multi-instance deployments.
2. **Audit logging:** Include SEP-10 error codes in login audit events for security monitoring.
3. **Challenge binding:** Optionally bind challenges to a client-supplied `client_domain` query param per SEP-10 spec.

## Test Coverage

- `backend/src/lib/sep10-auth.test.js` — nonce replay, home domain, XDR validation, store recovery
- `backend/src/routes/auth.routes.test.js` — rate limits, retryable 503 on store failure
- `backend/src/lib/rate-limit.test.js` — SEP-10 key generation and limiter factories

## Security Assumptions

- `SEP10_SERVER_SIGNING_KEY` and `JWT_SECRET` are stored securely and rotated periodically.
- `HOME_DOMAIN` matches the domain published in `stellar.toml`.
- Redis (when used) is network-isolated and authenticated.
