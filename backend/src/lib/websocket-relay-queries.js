/**
 * websocket-relay-queries.js
 *
 * Optimized SQL query helpers for the WebSocket relay event store.
 *
 * Index recommendations (run once against your database):
 *
 *   -- Covering index for paginated relay event reads, ordered by creation time
 *   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relay_events_created_at
 *     ON relay_events (created_at DESC);
 *
 *   -- Composite index for queue dequeue queries (status + created_at)
 *   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relay_events_status_created
 *     ON relay_events (status, created_at ASC)
 *     WHERE status = 'pending';
 *
 *   -- Index for payment-scoped event lookups
 *   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_relay_events_payment_id
 *     ON relay_events (payment_id, created_at DESC);
 *
 * These partial/covering indexes keep relay reads fast even when the table
 * grows into the millions of rows.
 */

/**
 * Fetch the most recent relay events in descending creation order.
 *
 * Uses a paginated query so callers never pull unbounded result sets.
 * The covering index on (created_at DESC) ensures an index-only scan
 * on databases that support it.
 *
 * @param {object} db   - pg Pool or pg Client with a .query() method
 * @param {number} limit  - Maximum rows to return (default 100, max 1000)
 * @param {number} offset - Row offset for pagination (default 0)
 * @returns {Promise<object[]>}
 */
async function getRecentEvents(db, limit = 100, offset = 0) {
  const parsedLimit = Number(limit);
  const safeLimit = Math.min(Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 100), 1000);
  const parsedOffset = Number(offset);
  const safeOffset = Math.max(0, Number.isFinite(parsedOffset) ? parsedOffset : 0);

  // SET statement_timeout guards against runaway read queries
  const { rows } = await db.query(
    `
    SET LOCAL statement_timeout = '5s';
    SELECT
      id,
      payment_id,
      event_type,
      payload,
      status,
      created_at
    FROM relay_events
    ORDER BY created_at DESC
    LIMIT $1
    OFFSET $2
    `,
    [safeLimit, safeOffset],
  );

  return rows;
}

/**
 * Batch-insert multiple relay events in a single round-trip.
 *
 * Building one multi-row VALUES clause is significantly faster than
 * issuing N sequential INSERT statements, especially when N > 10,
 * because it eliminates per-statement network and parse overhead.
 *
 * @param {object}   db     - pg Pool or pg Client
 * @param {object[]} events - Array of event objects with:
 *                              { payment_id, event_type, payload, status }
 * @returns {Promise<object[]>} Inserted rows
 */
async function batchInsertEvents(db, events) {
  if (!Array.isArray(events) || events.length === 0) {
    return [];
  }

  const values = [];
  const placeholders = events.map((event, i) => {
    const base = i * 4;
    values.push(
      event.payment_id,
      event.event_type,
      event.payload != null ? JSON.stringify(event.payload) : null,
      event.status || "pending",
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, NOW())`;
  });

  const sql = `
    SET LOCAL statement_timeout = '5s';
    INSERT INTO relay_events (payment_id, event_type, payload, status, created_at)
    VALUES ${placeholders.join(", ")}
    RETURNING id, payment_id, event_type, status, created_at
  `;

  const { rows } = await db.query(sql, values);
  return rows;
}

/**
 * Dequeue the next pending relay event using SELECT … FOR UPDATE SKIP LOCKED.
 *
 * SKIP LOCKED lets multiple consumers pull from the queue concurrently
 * without waiting on row locks held by other workers, which eliminates
 * the "thundering herd" lock contention common in naive queue designs.
 * The SET LOCAL statement_timeout prevents a worker from holding a lock
 * indefinitely when the database is slow.
 *
 * @param {object} db - pg Pool or pg Client
 * @returns {Promise<object|null>} The dequeued event row, or null if the queue is empty
 */
async function dequeueNextEvent(db) {
  const { rows } = await db.query(`
    SET LOCAL statement_timeout = '5s';
    WITH next_event AS (
      SELECT id
      FROM relay_events
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE relay_events
    SET status = 'processing'
    FROM next_event
    WHERE relay_events.id = next_event.id
    RETURNING relay_events.id, relay_events.payment_id, relay_events.event_type, relay_events.payload, relay_events.created_at
  `);

  return rows[0] || null;
}

export { getRecentEvents, batchInsertEvents, dequeueNextEvent };
