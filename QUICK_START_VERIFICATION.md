# Quick Start Verification Guide

## Overview
This guide provides quick commands to verify all three features are working correctly.

---

## 1. Verify Webhook Signatures (Issue #291)

### Check Implementation
```bash
# View webhook signing implementation
cat backend/src/lib/webhooks.js | grep -A 5 "export function signPayload"

# View webhook verification
cat backend/src/lib/webhooks.js | grep -A 10 "export function verifyWebhook"
```

### Test Webhook Signatures
```bash
cd backend
node test-features-standalone.js | grep -A 20 "Test 1: Webhook"
```

**Expected Output**:
```
✓ Signature generated: sha256=...
✓ Signature verified: PASS
✓ Timestamp verification: PASS
✓ Invalid signature rejected: PASS
✓ Secret rotation (old secret accepted): PASS
✅ Webhook Signature Tests: PASSED
```

### Verify in Code
```bash
# Check sendWebhook function includes headers
grep -n "Stellar-Signature\|Stellar-Timestamp" backend/src/lib/webhooks.js

# Check webhook is sent with signature
grep -n "sendWebhook" backend/src/routes/payments.js
```

---

## 2. Verify Connection Pool Optimization (Issue #290)

### Check Pool Configuration
```bash
# View pool settings
grep -A 10 "const pool = new Pool" backend/src/lib/db.js

# Expected: max: 20, min: 2, idleTimeoutMillis: 30_000, etc.
```

### Check Prometheus Metrics
```bash
# View metrics definitions
grep -n "pg_pool_" backend/src/lib/metrics.js

# Expected: 4 new gauges for pool monitoring
```

### Check Metrics Integration
```bash
# View metrics update in monitoring
grep -n "updatePoolMetrics" backend/src/lib/db.js

# Expected: updatePoolMetrics() called in startPoolMonitoring()
```

### Test Pool Monitoring
```bash
cd backend
node test-features-standalone.js | grep -A 15 "Test 2: Connection"
```

**Expected Output**:
```
Pool Configuration (from db.js):
  max: 20 (optimized for concurrent traffic)
  min: 2 (maintain minimum connections)
  idleTimeoutMillis: 30000 (30 seconds)
  connectionTimeoutMillis: 5000 (5 seconds)
  statement_timeout: 30000 (30 seconds)
✓ Pool configuration: PASS

Prometheus Metrics Added:
  ✓ pg_pool_total_connections
  ✓ pg_pool_idle_connections
  ✓ pg_pool_waiting_requests
  ✓ pg_pool_utilization_percent
✅ Connection Pool Tests: PASSED
```

### Verify Metrics in Code
```bash
# Check metrics are registered
grep "register.registerMetric(pgPool" backend/src/lib/metrics.js

# Expected: 4 registerMetric calls for pool metrics
```

---

## 3. Verify SEP-0001 Generator (Issue #285)

### Check Implementation
```bash
# View TOML generation
grep -n "export function generateStellarToml" backend/src/lib/sep0001-generator.js

# View route handler
grep -n "/.well-known/stellar.toml" backend/src/routes/sep0001.js
```

### Test TOML Generation
```bash
cd backend
node test-features-standalone.js | grep -A 25 "Test 3: SEP-0001"
```

**Expected Output**:
```
✓ TOML generated successfully
✓ TOML validation: PASS
✓ Required fields:
  - NETWORK_PASSPHRASE: PASS
  - TRANSFER_SERVER: PASS
  - ACCOUNTS: PASS
  - [ORG] section: PASS

Generated TOML (first 500 chars):
────────────────────────────────────────────────────────────
NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"
TRANSFER_SERVER = "http://localhost:4000/api"
ACCOUNTS = ["GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQSTBE2BRUY4DQAT2B"]
...
✅ SEP-0001 Generator Tests: PASSED
```

### Verify Route
```bash
# Check route is registered
grep -n "sep0001Router" backend/src/app.js

# Expected: app.use("/", sep0001Router);
```

---

## 4. Run Complete Test Suite

```bash
cd backend
node test-features-standalone.js
```

**Expected Output**:
```
=== Testing Stellar Payment API Features ===

📋 Test 1: Webhook Signature Header (HMAC-SHA256)
────────────────────────────────────────────────────────────
✓ Signature generated: sha256=...
✓ Signature verified: PASS
✓ Timestamp verification: PASS
✓ Invalid signature rejected: PASS
✓ Secret rotation (old secret accepted): PASS

✅ Webhook Signature Tests: PASSED

📋 Test 2: Connection Pool Optimization
────────────────────────────────────────────────────────────
Pool Configuration (from db.js):
  max: 20 (optimized for concurrent traffic)
  min: 2 (maintain minimum connections)
  idleTimeoutMillis: 30000 (30 seconds)
  connectionTimeoutMillis: 5000 (5 seconds)
  statement_timeout: 30000 (30 seconds)
✓ Pool configuration: PASS

Prometheus Metrics Added:
  ✓ pg_pool_total_connections
  ✓ pg_pool_idle_connections
  ✓ pg_pool_waiting_requests
  ✓ pg_pool_utilization_percent

✅ Connection Pool Tests: PASSED

📋 Test 3: SEP-0001 stellar.toml Generator
────────────────────────────────────────────────────────────
✓ TOML generated successfully
✓ TOML validation: PASS
✓ Required fields:
  - NETWORK_PASSPHRASE: PASS
  - TRANSFER_SERVER: PASS
  - ACCOUNTS: PASS
  - [ORG] section: PASS

Generated TOML (first 500 chars):
────────────────────────────────────────────────────────────
NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"
...
✅ SEP-0001 Generator Tests: PASSED

============================================================
✅ ALL TESTS PASSED
============================================================

Features verified:
  ✓ Issue #291: Webhook Signature Header (HMAC-SHA256)
  ✓ Issue #290: Connection Pool Optimization
  ✓ Issue #285: SEP-0001 stellar.toml Generator
```

---

## 5. Verify Git Commits

```bash
cd backend

# View all commits on feature branch
git log --oneline feature/webhook-signing-db-optimization-sep0001 | head -5

# Expected output:
# dc20795 perf: integrate Prometheus metrics into pool monitoring
# 100b588 feat: add Prometheus metrics for database connection pool
# fc8ebc4 feat: implement SEP-0001 stellar.toml generator
# cfb64a7 perf: optimize PostgreSQL connection pooling settings
# e86c5dc feat: implement HMAC-SHA256 webhook signatures with timestamp validation

# View specific commits
git show 100b588 --stat  # Metrics commit
git show dc20795 --stat  # Integration commit
```

---

## 6. Verify Code Quality

```bash
cd backend

# Check for syntax errors
node -c src/lib/metrics.js
node -c src/lib/db.js

# Expected: No output (success)
```

---

## 7. Verify Documentation

```bash
# Check all documentation files exist
ls -la backend/WEBHOOK_SIGNATURE_GUIDE.md
ls -la backend/DB_POOL_OPTIMIZATION_GUIDE.md
ls -la backend/SEP0001_GENERATOR_GUIDE.md
ls -la backend/PR_DESCRIPTION.md
ls -la CONTRIBUTION_SUMMARY.md
ls -la VERIFICATION_CHECKLIST.md
```

---

## 8. Integration Testing (Optional)

### Start the API with pool monitoring enabled
```bash
cd backend
POOL_MONITORING_ENABLED=true npm start
```

### In another terminal, check metrics
```bash
# Wait 60 seconds for first monitoring interval
sleep 60

# Check pool metrics
curl http://localhost:4000/metrics | grep pg_pool

# Expected output:
# pg_pool_total_connections 2
# pg_pool_idle_connections 2
# pg_pool_waiting_requests 0
# pg_pool_utilization_percent 0
```

### Test SEP-0001 endpoint
```bash
# Get stellar.toml (requires merchant_id)
curl "http://localhost:4000/.well-known/stellar.toml?merchant_id=<uuid>"

# Expected: TOML content with proper headers
# Content-Type: text/plain; charset=utf-8
# Cache-Control: public, max-age=3600
```

---

## 9. Troubleshooting

### If tests fail
```bash
# Check Node.js version (should be 18+)
node --version

# Check dependencies are installed
npm list crypto  # Should be built-in

# Run with verbose output
node test-features-standalone.js 2>&1 | head -50
```

### If metrics don't appear
```bash
# Check metrics are exported
grep "export const pgPool" backend/src/lib/metrics.js

# Check metrics are registered
grep "register.registerMetric(pgPool" backend/src/lib/metrics.js

# Check db.js imports metrics
grep "import.*metrics" backend/src/lib/db.js
```

### If SEP-0001 endpoint fails
```bash
# Check route is registered
grep "sep0001Router" backend/src/app.js

# Check route file exists
ls -la backend/src/routes/sep0001.js

# Check generator exists
ls -la backend/src/lib/sep0001-generator.js
```

---

## Summary

All three features can be verified with:

```bash
cd backend
node test-features-standalone.js
```

If all tests pass, the implementation is complete and ready for review.

---

**Last Updated**: March 28, 2026
**Status**: ✅ All Features Verified
