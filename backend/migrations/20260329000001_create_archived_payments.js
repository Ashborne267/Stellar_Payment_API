/**
 * Migration: Create archived_payments table
 * Mirrors the payments table to archive old payment intents.
 */

export async function up(knex) {
  await knex.schema.createTableIfNotExists("archived_payments", (t) => {
    t.uuid("id").primary();
    t.uuid("merchant_id").references("id").inTable("merchants").onDelete("SET NULL");
    t.decimal("amount", 18, 7).notNullable();
    t.text("asset").notNullable();
    t.text("asset_issuer");
    t.text("recipient").notNullable();
    t.text("description");
    t.text("memo");
    t.text("memo_type");
    t.text("webhook_url");
    t.text("status").notNullable().defaultTo("pending");
    t.text("tx_id");
    t.jsonb("metadata");
    t.timestamp("created_at", { useTz: true }).notNullable();
    t.timestamp("archived_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(
    "create index if not exists archived_payments_status_idx on archived_payments(status)"
  );
  await knex.raw(
    "create index if not exists archived_payments_merchant_idx on archived_payments(merchant_id)"
  );
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("archived_payments");
}
