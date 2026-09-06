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
 * Creates the session, its temporary user, and that user's starter social
 * graph (causes + follows) atomically. All of it must exist together or not
 * at all — a session without its user would resolve to a visitor with no
 * identity, and a user with only some of its starter rows would leave a
 * partially-established persona. Any failure after BEGIN rolls the whole
 * thing back, including the session and user rows already inserted.
 *
 * causeIds/followedUserIds/followedOrganizationIds default to empty so this
 * still works as a plain session+user creation if ever called without a
 * starter state.
 */
async function createSessionWithUser({
  sessionId,
  userId,
  displayName,
  city,
  state,
  causeIds = [],
  followedUserIds = [],
  followedOrganizationIds = [],
}) {
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

    if (causeIds.length > 0) {
      await client.query(
        `INSERT INTO user_causes (user_id, cause_id)
         SELECT $1, unnest($2::uuid[])`,
        [userId, causeIds]
      );
    }

    if (followedUserIds.length > 0) {
      await client.query(
        `INSERT INTO user_follows (follower_user_id, followed_user_id)
         SELECT $1, unnest($2::uuid[])`,
        [userId, followedUserIds]
      );
    }

    if (followedOrganizationIds.length > 0) {
      await client.query(
        `INSERT INTO organization_follows (user_id, organization_id)
         SELECT $1, unnest($2::uuid[])`,
        [userId, followedOrganizationIds]
      );
    }

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

/*
 * Deletes one session and, through the schema, everything the visitor did.
 *
 * This single DELETE is the whole of Reset. demo_sessions -> users is
 * ON DELETE CASCADE, and every table a temporary visitor can write into
 * cascades from users: registrations, activities, user_causes, user_follows,
 * organization_follows, saved_opportunities, reactions, comments,
 * fundraiser_supports, and the opportunities and fundraisers they created.
 * There is deliberately no per-table cleanup list here — one would drift out
 * of date the moment a new writable table appeared, whereas the foreign keys
 * cannot.
 *
 * Seeded rows are untouched by construction: they have
 * demo_session_id IS NULL, so nothing links them to this session.
 */
async function deleteSession(sessionId) {
  const { rowCount } = await query(`DELETE FROM demo_sessions WHERE id = $1`, [sessionId]);
  return rowCount > 0;
}

module.exports = {
  SESSION_LIFETIME,
  createSessionWithUser,
  deleteSession,
  findActiveSession,
  deleteExpiredSessions,
};
