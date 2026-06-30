-- Query Plan Analysis for Composite Indexes on Payments Table
-- Run this script to compare query performance before and after adding indexes

-- ============================================================================
-- BEFORE: Query plans without composite indexes
-- ============================================================================

-- Query 1: Filter payments by merchant and status
EXPLAIN ANALYZE
SELECT id, amount, asset, status, created_at
FROM payments
WHERE merchant_id = 'example-merchant-uuid'
  AND status = 'pending'
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 50;

-- Expected: Sequential scan or single-column index scan on merchant_id
-- Cost: Higher due to filtering status after index lookup

-- Query 2: Get recent payments for a merchant
EXPLAIN ANALYZE
SELECT id, amount, asset, status, created_at
FROM payments
WHERE merchant_id = 'example-merchant-uuid'
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 50;

-- Expected: Index scan on merchant_id, then sort by created_at
-- Cost: Sort operation required after index scan

-- Query 3: Count payments by status for a merchant
EXPLAIN ANALYZE
SELECT status, COUNT(*) as count
FROM payments
WHERE merchant_id = 'example-merchant-uuid'
  AND deleted_at IS NULL
GROUP BY status;

-- Expected: Sequential scan or single-column index scan
-- Cost: Full scan of merchant's payments

-- ============================================================================
-- AFTER: Apply the composite indexes
-- ============================================================================

-- Run the migration:
-- CREATE INDEX IF NOT EXISTS payments_merchant_status_idx 
--   ON payments(merchant_id, status) WHERE deleted_at IS NULL;
-- CREATE INDEX IF NOT EXISTS payments_merchant_created_idx 
--   ON payments(merchant_id, created_at DESC) WHERE deleted_at IS NULL;

-- ============================================================================
-- AFTER: Query plans with composite indexes
-- ============================================================================

-- Query 1: Filter payments by merchant and status (IMPROVED)
EXPLAIN ANALYZE
SELECT id, amount, asset, status, created_at
FROM payments
WHERE merchant_id = 'example-merchant-uuid'
  AND status = 'pending'
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 50;

-- Expected: Index scan on payments_merchant_status_idx
-- Improvement: Direct lookup using composite index, no additional filtering

-- Query 2: Get recent payments for a merchant (IMPROVED)
EXPLAIN ANALYZE
SELECT id, amount, asset, status, created_at
FROM payments
WHERE merchant_id = 'example-merchant-uuid'
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 50;

-- Expected: Index scan on payments_merchant_created_idx
-- Improvement: No sort operation needed, index already ordered by created_at DESC

-- Query 3: Count payments by status for a merchant (IMPROVED)
EXPLAIN ANALYZE
SELECT status, COUNT(*) as count
FROM payments
WHERE merchant_id = 'example-merchant-uuid'
  AND deleted_at IS NULL
GROUP BY status;

-- Expected: Index scan on payments_merchant_status_idx
-- Improvement: Faster grouping using composite index

-- ============================================================================
-- Performance Metrics to Compare
-- ============================================================================

-- 1. Execution Time: Should decrease significantly (50-90% improvement expected)
-- 2. Planning Time: May increase slightly due to more index options
-- 3. Rows Scanned: Should decrease dramatically with composite indexes
-- 4. Index Usage: Check that new indexes are being used in query plans

-- ============================================================================
-- Index Statistics
-- ============================================================================

-- Check index sizes
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE tablename = 'payments'
ORDER BY indexname;

-- Check index usage statistics
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS index_scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename = 'payments'
ORDER BY idx_scan DESC;

-- ============================================================================
-- Recommendations
-- ============================================================================

-- 1. Monitor index usage over time using pg_stat_user_indexes
-- 2. Consider VACUUM ANALYZE after creating indexes to update statistics
-- 3. If queries still slow, check for missing WHERE deleted_at IS NULL conditions
-- 4. For very large tables (>1M rows), consider partitioning by created_at
