/**
 * Migration: Add API key expiry and rotation support
 * Adds columns for API key expiration and old key overlap period during rotation.
 */

export async function up(knex) {
  // Add API key expiry timestamp
  await knex.schema.alterTable("merchants", (t) => {
    t.timestamp("api_key_expires_at", { useTz: true });
    // Old API key for rotation overlap period (typically 24-48 hours)
    t.text("api_key_old");
    t.timestamp("api_key_old_expires_at", { useTz: true });
  });

  // Create index for faster lookups
  await knex.raw(
    "create index if not exists merchants_api_key_expires_at_idx on merchants(api_key_expires_at)"
  );
}

export async function down(knex) {
  await knex.schema.alterTable("merchants", (t) => {
    t.dropColumn("api_key_old_expires_at");
    t.dropColumn("api_key_old");
    t.dropColumn("api_key_expires_at");
  });

  await knex.raw(
    "drop index if exists merchants_api_key_expires_at_idx"
  );
}
