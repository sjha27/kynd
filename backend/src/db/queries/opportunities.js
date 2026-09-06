'use strict';

const crypto = require('node:crypto');

const { pool, query } = require('../pool');
const {
  LOCAL_TIMEZONE,
  COMMITMENT_BANDS,
} = require('../../lib/discovery');
const {
  visibleUserPredicate,
  visibleOpportunityPredicate,
  visibleJoinedCountSql,
} = require('../visibility');

/*
 * All opportunity reads are session-scoped.
 *
 * `$1` is always the current demo session id, or NULL for an anonymous read.
 * Binding it unconditionally keeps one query shape for both cases (see
 * db/visibility.js), so filter parameters always start at $2.
 */
const SESSION_PARAM = '$1';

const OPPORTUNITY_SELECT = `
  SELECT
    o.id,
    o.title,
    o.opportunity_type,
    o.status,
    o.description,
    o.what_youll_do,
    o.requirements,
    o.starts_at,
    o.ends_at,
    o.is_online,
    o.location_name,
    o.city,
    o.state,
    o.capacity,
    o.image_url,
    c.id AS cause_id,
    c.name AS cause_name,
    hu.id AS host_user_id,
    hu.display_name AS host_user_name,
    hu.avatar_url AS host_user_avatar_url,
    ho.id AS host_organization_id,
    ho.name AS host_organization_name,
    ho.logo_url AS host_organization_logo_url,
    ho.is_verified_demo AS host_organization_verified,
    ${visibleJoinedCountSql('o.id', SESSION_PARAM)} AS joined_count,
    -- Whether THIS viewer is joined. Derived on the server, which knows the
    -- session user; the browser must never infer it from participant counts.
    EXISTS (
      SELECT 1
      FROM registrations vrr
      JOIN users vru ON vru.id = vrr.user_id
      WHERE vrr.opportunity_id = o.id
        AND vrr.status = 'joined'
        AND vru.demo_session_id = ${SESSION_PARAM}
    ) AS viewer_joined,
    -- Whether THIS viewer saved it. Same server-derived rule as
    -- viewer_joined; another visitor's save is never visible here.
    EXISTS (
      SELECT 1
      FROM saved_opportunities vs
      JOIN users vsu ON vsu.id = vs.user_id
      WHERE vs.opportunity_id = o.id
        AND vsu.demo_session_id = ${SESSION_PARAM}
    ) AS viewer_saved
  FROM opportunities o
  JOIN causes c ON c.id = o.cause_id
  LEFT JOIN users hu ON hu.id = o.host_user_id
  LEFT JOIN organizations ho ON ho.id = o.host_organization_id
`;

/*
 * Applied by every caller of OPPORTUNITY_SELECT. An opportunity created by
 * another visitor's temporary user is not addressable here — indistinguishable
 * from an id that never existed, the same way another session's temporary
 * user is on the profile route.
 */
const VISIBLE_OPPORTUNITY = visibleOpportunityPredicate('o', 'hu', SESSION_PARAM);

/*
 * Builds the WHERE fragment for Discover browsing.
 *
 * Every visitor-supplied value becomes a bound parameter — no filter value
 * is ever interpolated into SQL. `params` is mutated and returned alongside
 * the clause list so callers can keep appending (LIMIT/OFFSET) afterwards.
 */
function buildFilters(filters, params) {
  const clauses = [`o.status = 'published'`, VISIBLE_OPPORTUNITY];

  const bind = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  // Browsing only ever surfaces opportunities you could still join.
  if (filters.upcomingOnly !== false) {
    clauses.push(`o.starts_at > now()`);
  }

  if (filters.q) {
    // Matched across the opportunity itself plus the names of its cause and
    // whichever host it has, so typing an organization or cause name finds
    // that host's opportunities.
    const p = bind(`%${filters.q}%`);
    clauses.push(`(
      o.title ILIKE ${p}
      OR o.description ILIKE ${p}
      OR c.name ILIKE ${p}
      OR ho.name ILIKE ${p}
      OR hu.display_name ILIKE ${p}
    )`);
  }

  if (filters.type) {
    clauses.push(`o.opportunity_type = ${bind(filters.type)}`);
  }

  if (filters.host === 'organization') {
    clauses.push(`o.host_organization_id IS NOT NULL`);
  } else if (filters.host === 'community') {
    clauses.push(`o.host_user_id IS NOT NULL`);
  }

  if (filters.mode === 'online') {
    clauses.push(`o.is_online = true`);
  } else if (filters.mode === 'atlanta') {
    clauses.push(`o.is_online = false`);
  }

  if (filters.cause) {
    clauses.push(`c.name = ${bind(filters.cause)}`);
  }

  // Timing is evaluated against the Atlanta-local calendar.
  if (filters.timing === 'today') {
    const tz = bind(LOCAL_TIMEZONE);
    clauses.push(
      `(o.starts_at AT TIME ZONE ${tz})::date = (now() AT TIME ZONE ${tz})::date`
    );
  } else if (filters.timing === 'weekend') {
    // The coming Saturday and Sunday. During a weekend, that weekend.
    const tz = bind(LOCAL_TIMEZONE);
    clauses.push(`
      (o.starts_at AT TIME ZONE ${tz})::date BETWEEN
        ((now() AT TIME ZONE ${tz})::date
          + ((6 - EXTRACT(ISODOW FROM (now() AT TIME ZONE ${tz})::date)::int + 7) % 7))
        AND
        ((now() AT TIME ZONE ${tz})::date
          + ((6 - EXTRACT(ISODOW FROM (now() AT TIME ZONE ${tz})::date)::int + 7) % 7) + 1)
    `);
  } else if (filters.timing === 'next7') {
    clauses.push(`o.starts_at <= now() + interval '7 days'`);
  }

  if (filters.commitment && COMMITMENT_BANDS[filters.commitment]) {
    const band = COMMITMENT_BANDS[filters.commitment];
    const minutes = `(EXTRACT(EPOCH FROM (o.ends_at - o.starts_at)) / 60)`;
    if (band.minMinutes !== null) {
      clauses.push(`${minutes} ${band.exclusiveMin ? '>' : '>='} ${bind(band.minMinutes)}`);
    }
    if (band.maxMinutes !== null) {
      clauses.push(`${minutes} ${band.exclusiveMax ? '<' : '<='} ${bind(band.maxMinutes)}`);
    }
  }

  return clauses;
}

/*
 * Deterministic ordering.
 *
 * 'popular' is intentionally explainable rather than a hidden score: most
 * joined participants first, then the soonest, then a stable id tiebreak so
 * the same query always returns the same order.
 *
 * Column names are unqualified because this ORDER BY is applied to the
 * wrapping SELECT, where the inner table aliases are no longer in scope.
 */
function buildOrderBy(sort) {
  if (sort === 'popular') {
    return `ORDER BY joined_count DESC, starts_at ASC, id ASC`;
  }
  return `ORDER BY starts_at ASC, id ASC`;
}

async function searchOpportunities({ limit, offset, sessionId = null, ...filters }) {
  // Session id is always $1 (see SESSION_PARAM); filters bind from $2.
  const params = [sessionId];
  const clauses = buildFilters(filters, params);

  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  // COUNT(*) OVER() gives an exact total for the filtered set in the same
  // pass, so the UI can show a real result count without a second query.
  const { rows } = await query(
    `SELECT *, COUNT(*) OVER()::int AS total_count FROM (
       ${OPPORTUNITY_SELECT}
       WHERE ${clauses.join(' AND ')}
     ) AS matched
     ${buildOrderBy(filters.sort)}
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params
  );

  return {
    rows,
    total: rows.length > 0 ? rows[0].total_count : 0,
  };
}

async function findOpportunityById(id, sessionId = null) {
  const { rows } = await query(
    `${OPPORTUNITY_SELECT} WHERE o.id = $2 AND ${VISIBLE_OPPORTUNITY}`,
    [sessionId, id]
  );
  return rows[0] || null;
}

/*
 * A small preview of who is going, for social context on cards and detail.
 * Ordered deterministically so the same opportunity always previews the
 * same people.
 */
async function findAttendeePreview(opportunityId, previewLimit, sessionId = null) {
  const { rows } = await query(
    `SELECT u.id, u.display_name, u.avatar_url
     FROM registrations r
     JOIN users u ON u.id = r.user_id
     WHERE r.opportunity_id = $2
       AND r.status = 'joined'
       AND ${visibleUserPredicate('u', SESSION_PARAM)}
     ORDER BY u.display_name ASC, u.id ASC
     LIMIT $3`,
    [sessionId, opportunityId, previewLimit]
  );
  return rows;
}

async function findAttendeePreviewsFor(opportunityIds, previewLimit, sessionId = null) {
  if (opportunityIds.length === 0) return new Map();

  // One round trip for the whole page of cards: rank each opportunity's
  // attendees and keep the first few per opportunity.
  const { rows } = await query(
    `SELECT opportunity_id, id, display_name, avatar_url
     FROM (
       SELECT
         r.opportunity_id,
         u.id,
         u.display_name,
         u.avatar_url,
         ROW_NUMBER() OVER (
           PARTITION BY r.opportunity_id
           ORDER BY u.display_name ASC, u.id ASC
         ) AS rn
       FROM registrations r
       JOIN users u ON u.id = r.user_id
       WHERE r.opportunity_id = ANY($2::uuid[])
         AND r.status = 'joined'
         AND ${visibleUserPredicate('u', SESSION_PARAM)}
     ) ranked
     WHERE rn <= $3`,
    [sessionId, opportunityIds, previewLimit]
  );

  const byOpportunity = new Map();
  for (const row of rows) {
    if (!byOpportunity.has(row.opportunity_id)) {
      byOpportunity.set(row.opportunity_id, []);
    }
    byOpportunity.get(row.opportunity_id).push(row);
  }
  return byOpportunity;
}

/*
 * Joins an opportunity for one temporary user, inside a transaction.
 *
 * Concurrency is handled by the schema's UNIQUE (user_id, opportunity_id)
 * rather than by application locking: a single INSERT ... ON CONFLICT DO
 * UPDATE collapses all three cases into one atomic statement —
 *
 *   no registration       -> INSERT  status 'joined'
 *   cancelled registration-> UPDATE  reactivates the SAME row (no duplicate
 *                                    history), clearing cancelled_at
 *   already joined        -> UPDATE  that changes nothing meaningful
 *
 * The joined_at CASE preserves the original timestamp for an already-joined
 * row, so a double click or retry is genuinely idempotent instead of
 * silently resetting when the visitor joined.
 *
 * Capacity is re-checked inside the transaction against the viewer's VISIBLE
 * count, so the number the visitor was shown is the number enforced. The row
 * lock on the opportunity serializes concurrent joins from the same session.
 */
async function joinOpportunity({ opportunityId, userId, sessionId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    /*
     * Deliberately no SELECT ... FOR UPDATE here.
     *
     * Two reasons. Practically, row locking would require UPDATE privilege on
     * opportunities, which the restricted runtime role must never hold — the
     * role is read-only on the seeded marketplace.
     *
     * More importantly it is not needed. Capacity is evaluated per visitor,
     * and each visitor sees only the seeded world plus themselves, so one
     * session's join can never affect another's count. Within a single
     * session the UNIQUE (user_id, opportunity_id) constraint means a visitor
     * can hold at most one registration, so concurrent double-clicks converge
     * on the same row and cannot consume two spots. The uniqueness constraint
     * is the serialization point, not a lock.
     */
    // Scoped by the same visibility rule the reads use: an opportunity
    // hosted by another visitor's temporary user is not joinable even if its
    // id were somehow guessed, rather than relying on it being undiscoverable.
    const opportunity = await client.query(
      `SELECT o.id, o.capacity, o.status, o.starts_at
       FROM opportunities o
       LEFT JOIN users hu ON hu.id = o.host_user_id
       WHERE o.id = $1 AND ${visibleOpportunityPredicate('o', 'hu', '$2')}`,
      [opportunityId, sessionId]
    );
    if (opportunity.rowCount === 0) {
      await client.query('ROLLBACK');
      return { outcome: 'not_found' };
    }

    const row = opportunity.rows[0];
    if (row.status !== 'published') {
      await client.query('ROLLBACK');
      return { outcome: 'not_joinable' };
    }

    // Real wall-clock time — the synthetic WORLD_REFERENCE_DATE governs the
    // seeded world, never runtime behavior.
    const timing = await client.query(`SELECT $1::timestamptz > now() AS upcoming`, [row.starts_at]);
    if (!timing.rows[0].upcoming) {
      await client.query('ROLLBACK');
      return { outcome: 'not_joinable' };
    }

    const already = await client.query(
      `SELECT status FROM registrations WHERE user_id = $1 AND opportunity_id = $2`,
      [userId, opportunityId]
    );
    const alreadyJoined = already.rows[0]?.status === 'joined';

    // Only a genuinely new join consumes a spot; re-joining an existing
    // joined registration must never be blocked by a full opportunity.
    if (!alreadyJoined) {
      const visible = await client.query(
        `SELECT ${visibleJoinedCountSql('$1', '$2')} AS joined_count`,
        [opportunityId, sessionId]
      );
      if (visible.rows[0].joined_count >= row.capacity) {
        await client.query('ROLLBACK');
        return { outcome: 'full', capacity: row.capacity };
      }
    }

    await client.query(
      `INSERT INTO registrations (id, user_id, opportunity_id, status, joined_at, cancelled_at)
       VALUES ($1, $2, $3, 'joined', now(), NULL)
       ON CONFLICT (user_id, opportunity_id) DO UPDATE
         SET status = 'joined',
             cancelled_at = NULL,
             joined_at = CASE
               WHEN registrations.status = 'cancelled' THEN now()
               ELSE registrations.joined_at
             END`,
      [crypto.randomUUID(), userId, opportunityId]
    );

    const after = await client.query(
      `SELECT ${visibleJoinedCountSql('$1', '$2')} AS joined_count`,
      [opportunityId, sessionId]
    );

    await client.query('COMMIT');
    return {
      outcome: 'joined',
      capacity: row.capacity,
      joinedCount: after.rows[0].joined_count,
      alreadyJoined,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/*
 * Leaving an opportunity.
 *
 * The registration row is never deleted — its status becomes 'cancelled',
 * which is exactly the state Join already knows how to reactivate. That is
 * what keeps one person's participation in one opportunity a single
 * relationship with a history, rather than a pile of rows.
 *
 * A registration that already produced an activity is refused: the completed
 * contribution is real history, and cancelling the relationship beneath it
 * would leave an activity describing participation the registration denies.
 *
 * Same visibility rule as Join, and scoped to the acting user's own
 * registration, so a caller can only ever leave something they joined.
 */
async function leaveOpportunity({ opportunityId, userId, sessionId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const opportunity = await client.query(
      `SELECT o.id, o.capacity
       FROM opportunities o
       LEFT JOIN users hu ON hu.id = o.host_user_id
       WHERE o.id = $1 AND ${visibleOpportunityPredicate('o', 'hu', '$2')}`,
      [opportunityId, sessionId]
    );
    if (opportunity.rowCount === 0) {
      await client.query('ROLLBACK');
      return { outcome: 'not_found' };
    }
    const capacity = opportunity.rows[0].capacity;

    const registration = await client.query(
      `SELECT r.id, r.status,
              (SELECT 1 FROM activities a WHERE a.registration_id = r.id) IS NOT NULL AS completed
       FROM registrations r
       WHERE r.user_id = $1 AND r.opportunity_id = $2`,
      [userId, opportunityId]
    );

    if (registration.rowCount > 0 && registration.rows[0].completed) {
      await client.query('ROLLBACK');
      return { outcome: 'completed' };
    }

    // Idempotent: no registration, or one already cancelled, means the
    // visitor is already not participating — their intent is satisfied, so
    // this reports the current state rather than failing. Same reasoning as
    // Join being safe to repeat, and unsave being safe on an unsaved item.
    if (registration.rowCount > 0 && registration.rows[0].status === 'joined') {
      await client.query(
        `UPDATE registrations
         SET status = 'cancelled', cancelled_at = now()
         WHERE id = $1 AND status = 'joined'`,
        [registration.rows[0].id]
      );
    }

    const after = await client.query(
      `SELECT ${visibleJoinedCountSql('$1', '$2')} AS joined_count`,
      [opportunityId, sessionId]
    );

    await client.query('COMMIT');
    return { outcome: 'left', capacity, joinedCount: after.rows[0].joined_count };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/*
 * The current visitor's upcoming joined opportunities.
 *
 * Scoped by session rather than by user id alone, so a caller cannot pass
 * another visitor's user id and read their Activity.
 */
async function findUpcomingForSession(sessionId, limit = 50) {
  const { rows } = await query(
    `${OPPORTUNITY_SELECT}
     JOIN registrations r ON r.opportunity_id = o.id AND r.status = 'joined'
     JOIN users ru ON ru.id = r.user_id AND ru.demo_session_id = ${SESSION_PARAM}
     WHERE o.status = 'published' AND o.starts_at > now()
       AND ${VISIBLE_OPPORTUNITY}
       -- Once a registration has a completed activity, it moves to
       -- Completed and must stop appearing here — this is the only rule
       -- that matters for the demo-only early flagship completion, since
       -- its starts_at is still in the future.
       AND NOT EXISTS (SELECT 1 FROM activities a WHERE a.registration_id = r.id)
     ORDER BY o.starts_at ASC, o.id ASC
     LIMIT $2`,
    [sessionId, limit]
  );
  return rows;
}

/*
 * Joined opportunities whose real end has already passed but which have
 * not been completed yet — the "Did you participate?" state. Without this,
 * such a registration falls into a gap: findUpcomingForSession excludes it
 * (starts_at is no longer > now()) and Completed has nothing to show
 * (no activity exists yet). Scoped by session, same rule as
 * findUpcomingForSession.
 */
async function findAwaitingConfirmationForSession(sessionId, limit = 50) {
  const { rows } = await query(
    `${OPPORTUNITY_SELECT}
     JOIN registrations r ON r.opportunity_id = o.id AND r.status = 'joined'
     JOIN users ru ON ru.id = r.user_id AND ru.demo_session_id = ${SESSION_PARAM}
     WHERE o.ends_at <= now()
       AND ${VISIBLE_OPPORTUNITY}
       AND NOT EXISTS (SELECT 1 FROM activities a WHERE a.registration_id = r.id)
     ORDER BY o.ends_at DESC, o.id ASC
     LIMIT $2`,
    [sessionId, limit]
  );
  return rows;
}

/*
 * Resolves and validates everything a creation needs against the database in
 * one round trip, before anything is written:
 *
 *   cause_id           — the seeded cause, by exact name. NULL is rejected.
 *   starts_at/ends_at  — the visitor entered an Atlanta wall-clock date and
 *                        time. Composing them as a local timestamp and
 *                        applying the zone in SQL converts to a correct
 *                        instant across DST, which naive JS date maths does
 *                        not.
 *   starts_in_past     — checked against now(), the real runtime clock. The
 *                        synthetic WORLD_REFERENCE_DATE governs the seeded
 *                        world only and must never reach this path.
 *
 * `date`, `startTime` and `endTime` are already format-validated by the
 * service, so the casts here cannot fail on malformed input.
 */
async function resolveOpportunityInputs({ causeName, date, startTime, endTime }) {
  const { rows } = await query(
    `SELECT
       (SELECT c.id FROM causes c WHERE c.name = $1) AS cause_id,
       s.ts AS starts_at,
       e.ts AS ends_at,
       (s.ts <= now()) AS starts_in_past,
       (e.ts <= s.ts) AS ends_before_start
     FROM (SELECT ($2 || ' ' || $3)::timestamp AT TIME ZONE $5 AS ts) s,
          (SELECT ($2 || ' ' || $4)::timestamp AT TIME ZONE $5 AS ts) e`,
    [causeName, date, startTime, endTime, LOCAL_TIMEZONE]
  );
  return rows[0];
}

/*
 * An opportunity hosted by a person rather than an organization.
 *
 * host_user_id is always the resolved session's temporary user and
 * host_organization_id is always NULL — the shape the schema's
 * chk_opportunities_exactly_one_host constraint requires, and the reason
 * there is no organization-admin creation path here.
 *
 * image_url stays NULL: no upload infrastructure exists, and the frontend's
 * deterministic cause-keyed media resolution already gives every opportunity
 * a real photograph from its id and cause.
 */
async function insertOpportunity({
  id,
  hostUserId,
  title,
  opportunityType,
  causeId,
  description,
  startsAt,
  endsAt,
  isOnline,
  locationName,
  city,
  state,
  capacity,
}) {
  await query(
    `INSERT INTO opportunities (
       id, title, opportunity_type, cause_id,
       host_user_id, host_organization_id,
       description, starts_at, ends_at,
       is_online, location_name, city, state,
       capacity, image_url, status
     )
     VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11, $12, $13, NULL, 'published')`,
    [
      id,
      title,
      opportunityType,
      causeId,
      hostUserId,
      description,
      startsAt,
      endsAt,
      isOnline,
      locationName,
      city,
      state,
      capacity,
    ]
  );
}

/*
 * The current visitor's saved opportunities. Scoped by session rather than
 * by user id alone, the same rule findUpcomingForSession uses.
 *
 * Unlike Upcoming, this deliberately does NOT filter to future
 * opportunities: Saved is a bookmark list the visitor curates, so an item
 * stays until they remove it.
 */
async function findSavedForSession(sessionId, limit = 50) {
  const { rows } = await query(
    `${OPPORTUNITY_SELECT}
     JOIN saved_opportunities s ON s.opportunity_id = o.id
     JOIN users su ON su.id = s.user_id AND su.demo_session_id = ${SESSION_PARAM}
     WHERE o.status = 'published' AND ${VISIBLE_OPPORTUNITY}
     ORDER BY s.saved_at DESC, o.id ASC
     LIMIT $2`,
    [sessionId, limit]
  );
  return rows;
}

module.exports = {
  searchOpportunities,
  findOpportunityById,
  findSavedForSession,
  leaveOpportunity,
  resolveOpportunityInputs,
  insertOpportunity,
  joinOpportunity,
  findUpcomingForSession,
  findAwaitingConfirmationForSession,
  findAttendeePreview,
  findAttendeePreviewsFor,
};
