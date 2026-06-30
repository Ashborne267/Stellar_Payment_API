/**
 * Migration 008: Add composite indexes for payments table
 * Improves query performance for frequently filtered columns
 */

export async function up(knex) {
  // Add composite index on (merchant_id, status) for filtering payments by merchant and status
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS payments_merchant_status_idx ON payments(merchant_id, status) WHERE deleted_at IS NULL",
  );

  // Add composite index on (merchant_id, created_at) for time-based queries
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS payments_merchant_created_idx ON payments(merchant_id, created_at DESC) WHERE deleted_at IS NULL",
  );

  console.log("✓ Added composite indexes on payments table");
  console.log("  - payments_merchant_status_idx: (merchant_id, status)");
  console.log(
    "  - payments_merchant_created_idx: (merchant_id, created_at DESC)",
  );
}

export async function down(knex) {
  await knex.raw("DROP INDEX IF EXISTS payments_merchant_status_idx");
  await knex.raw("DROP INDEX IF EXISTS payments_merchant_created_idx");
  console.log("✓ Removed composite indexes from payments table");
}
