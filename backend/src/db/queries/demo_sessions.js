'use strict';

const { pool, query } = require('../pool');

/*
 * Demo-session data access.
 *
 * Session timestamps are REAL infrastructure time — every expiry comparison
 * uses PostgreSQL's now(), never the synthetic WORLD_REFERENCE_DATE. The
 * seeded fictional calendar governs the seeded world only.
 *
 * Seeded users have demo_session_id IS NULL and are never touched here:
 * temporary users are only ever created with a session id, and expired
 * sessions remove their temporary user through the schema's ON DELETE
 * CASCADE rather than through any DELETE against users.
 */

const SESSION_LIFETIME = '24 hours';

/*
 * Opportunistic cleanup. V7 chose this over a worker/cron deliberately: the
 * cost is one indexed DELETE on the rare path where a visitor arrives without
 * a session, and it needs no scheduler.
 *
 * Bounded so a large backlog can never turn one visitor's first request into
 * an unbounded delete.
 */
async function deleteExpiredSessions(client = { query }, limit = 100) {
  const { rowCount } = await client.query(
    `DELETE FROM demo_sessions
     WHERE id IN (
       SELECT id FROM demo_sessions WHERE expires_at < now() LIMIT $1
     )`,
    [limit]
  );
  return rowCount;
}

/*
 * Creates the session and its temporary user atomically.
 *
 * The pair must exist together or not at all — a session without its user
 * would resolve to a visitor with no identity on every later request. Any
 * failure after BEGIN rolls the whole thing back.
 */
async function createSessionWithUser({ sessionId, userId, displayName, city, state }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Cheap housekeeping while we already hold a transaction.
    await deleteExpiredSessions(client);

    const session = await client.query(
      `INSERT INTO demo_sessions (id, expires_at)
       VALUES ($1, now() + interval '${SESSION_LIFETIME}')
       RETURNING id, created_at, last_seen_at, expires_at`,
      [sessionId]
    );

    const user = await client.query(
      `INSERT INTO users (id, demo_session_id, display_name, city, state)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, display_name, city, state, created_at`,
      [userId, sessionId, displayName, city, state]
    );

    await client.query('COMMIT');
    return { session: session.rows[0], user: user.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/*
 * Resolves a session id to its session and temporary user in one round trip.
 *
 * The join is inner: a session whose user is somehow missing resolves to
 * nothing rather than to a half-identity. Expiry is evaluated in SQL against
 * now() so the database clock is authoritative.
 */
async function findActiveSession(sessionId) {
  const { rows } = await query(
    `SELECT
       s.id            AS session_id,
       s.created_at    AS session_created_at,
       s.expires_at    AS session_expires_at,
       u.id            AS user_id,
       u.display_name  AS user_display_name,
       u.city          AS user_city,
       u.state         AS user_state
     FROM demo_sessions s
     JOIN users u ON u.demo_session_id = s.id
     WHERE s.id = $1 AND s.expires_at > now()`,
    [sessionId]
  );
  return rows[0] || null;
}

module.exports = {
  SESSION_LIFETIME,
  createSessionWithUser,
  findActiveSession,
  deleteExpiredSessions,
};
