'use strict';

const { query } = require('../pool');
const { LOCAL_TIMEZONE } = require('../../lib/discovery');
const {
  visibleFundraiserPredicate,
  visibleRaisedCentsSql,
  visibleSupporterCountSql,
} = require('../visibility');

/*
 * All fundraiser reads are session-scoped, exactly like opportunity reads.
 * `$1` is always the current demo session id, or NULL for an anonymous read,
 * so one query shape serves both and filter parameters start at $2.
 */
const SESSION_PARAM = '$1';

/*
 * Progress is derived here and nowhere else.
 *
 * amount_raised_cents and supporter_count are computed from the
 * fundraiser_supports relationships on every read. The schema stores no
 * running total, and adding one would let the displayed progress drift away
 * from the relationships that actually produced it.
 *
 * is_ended compares the fundraiser's end_date against the real Atlanta
 * calendar date — the runtime clock, never WORLD_REFERENCE_DATE. end_date is
 * a calendar DATE, so it is emitted as 'YYYY-MM-DD' text for the same reason
 * activities.occurred_on is: crossing the API boundary as an instant would
 * render as the previous day wherever the server runs behind Atlanta.
 */
const FUNDRAISER_SELECT = `
  SELECT
    f.id,
    f.title,
    f.story,
    f.status,
    f.goal_amount_cents,
    to_char(f.end_date, 'YYYY-MM-DD') AS end_date,
    (f.end_date < (now() AT TIME ZONE '${LOCAL_TIMEZONE}')::date) AS is_ended,
    f.image_url,
    c.id AS cause_id,
    c.name AS cause_name,
    cu.id AS creator_user_id,
    cu.display_name AS creator_user_name,
    cu.avatar_url AS creator_user_avatar_url,
    co.id AS creator_organization_id,
    co.name AS creator_organization_name,
    co.is_verified_demo AS creator_organization_verified,
    f.beneficiary_name,
    bo.id AS beneficiary_organization_id,
    bo.name AS beneficiary_organization_name,
    ${visibleRaisedCentsSql('f.id', SESSION_PARAM)} AS amount_raised_cents,
    ${visibleSupporterCountSql('f.id', SESSION_PARAM)} AS supporter_count,
    -- Whether THIS viewer has already supported. Derived on the server from
    -- the session; the browser must never infer it from the totals.
    EXISTS (
      SELECT 1
      FROM fundraiser_supports vsr
      JOIN users vsu ON vsu.id = vsr.user_id
      WHERE vsr.fundraiser_id = f.id
        AND vsu.demo_session_id = ${SESSION_PARAM}
    ) AS viewer_supported
  FROM fundraisers f
  JOIN causes c ON c.id = f.cause_id
  LEFT JOIN users cu ON cu.id = f.creator_user_id
  LEFT JOIN organizations co ON co.id = f.creator_organization_id
  LEFT JOIN organizations bo ON bo.id = f.beneficiary_organization_id
`;

// A fundraiser created by another visitor's temporary user is not
// addressable here — indistinguishable from an id that never existed.
const VISIBLE_FUNDRAISER = visibleFundraiserPredicate('f', 'cu', SESSION_PARAM);

/*
 * Fundraisers open to support: active, and not past their end date.
 * Ordered deterministically — soonest deadline first, so what needs support
 * most urgently leads, with a stable id tiebreak.
 */
async function findOpenFundraisers({ limit = 12, sessionId = null } = {}) {
  const { rows } = await query(
    `${FUNDRAISER_SELECT}
     WHERE ${VISIBLE_FUNDRAISER}
       AND f.status = 'active'
       AND f.end_date >= (now() AT TIME ZONE $2)::date
     ORDER BY f.end_date ASC, f.id ASC
     LIMIT $3`,
    [sessionId, LOCAL_TIMEZONE, limit]
  );
  return rows;
}

async function findFundraiserById(id, sessionId = null) {
  const { rows } = await query(
    `${FUNDRAISER_SELECT} WHERE f.id = $2 AND ${VISIBLE_FUNDRAISER}`,
    [sessionId, id]
  );
  return rows[0] || null;
}

/*
 * Resolves and validates creation inputs in one round trip, before writing:
 * the seeded cause by exact name, the Kynd organization the beneficiary name
 * matches (if any), and whether the end date is genuinely in the future
 * against the real Atlanta calendar.
 *
 * `endDate` is already format-validated by the service, so the ::date cast
 * cannot fail on malformed input.
 */
async function resolveFundraiserInputs({ causeName, beneficiaryName, endDate }) {
  const { rows } = await query(
    `SELECT
       (SELECT c.id FROM causes c WHERE c.name = $1) AS cause_id,
       org.id AS beneficiary_organization_id,
       org.name AS beneficiary_organization_name,
       ($3::date <= (now() AT TIME ZONE $4)::date) AS ends_today_or_earlier
     FROM (SELECT 1) AS anchor
     LEFT JOIN LATERAL (
       SELECT o.id, o.name
       FROM organizations o
       WHERE lower(o.name) = lower($2)
       ORDER BY o.name
       LIMIT 1
     ) AS org ON true`,
    [causeName, beneficiaryName, endDate, LOCAL_TIMEZONE]
  );
  return rows[0];
}

/*
 * A fundraiser started by a person rather than an organization.
 *
 * creator_user_id is always the resolved session's temporary user and
 * creator_organization_id is always NULL — the shape
 * chk_fundraisers_exactly_one_creator requires, and the reason there is no
 * organization-admin creation path.
 *
 * image_url stays NULL: no upload infrastructure exists, and the frontend
 * resolves fundraiser media deterministically from the id and cause.
 */
async function insertFundraiser({
  id,
  creatorUserId,
  title,
  story,
  causeId,
  beneficiaryOrganizationId,
  beneficiaryName,
  goalAmountCents,
  endDate,
}) {
  await query(
    `INSERT INTO fundraisers (
       id, title, story, cause_id,
       creator_user_id, creator_organization_id,
       beneficiary_organization_id, beneficiary_name,
       goal_amount_cents, end_date, image_url, status
     )
     VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, NULL, 'active')`,
    [
      id,
      title,
      story,
      causeId,
      creatorUserId,
      beneficiaryOrganizationId,
      beneficiaryName,
      goalAmountCents,
      endDate,
    ]
  );
}

/*
 * Simulated support, as a single statement.
 *
 * The schema's UNIQUE (user_id, fundraiser_id) is the rule that makes
 * support one-time rather than additive, so ON CONFLICT DO NOTHING lets the
 * database itself decide: rowCount 0 means this visitor already supported
 * this fundraiser, which the service turns into a clean conflict rather than
 * a raw constraint error. No SELECT-then-INSERT race exists.
 */
async function insertSupport({ id, userId, fundraiserId, amountCents }) {
  const { rowCount } = await query(
    `INSERT INTO fundraiser_supports (id, user_id, fundraiser_id, amount_cents)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, fundraiser_id) DO NOTHING`,
    [id, userId, fundraiserId, amountCents]
  );
  return rowCount === 1;
}

module.exports = {
  findOpenFundraisers,
  findFundraiserById,
  resolveFundraiserInputs,
  insertFundraiser,
  insertSupport,
};
