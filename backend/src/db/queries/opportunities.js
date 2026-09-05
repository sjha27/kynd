'use strict';

const { query } = require('../pool');
const {
  LOCAL_TIMEZONE,
  COMMITMENT_BANDS,
} = require('../../lib/discovery');

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
    (
      SELECT COUNT(*)::int
      FROM registrations r
      WHERE r.opportunity_id = o.id AND r.status = 'joined'
    ) AS joined_count
  FROM opportunities o
  JOIN causes c ON c.id = o.cause_id
  LEFT JOIN users hu ON hu.id = o.host_user_id
  LEFT JOIN organizations ho ON ho.id = o.host_organization_id
`;

/*
 * Builds the WHERE fragment for Discover browsing.
 *
 * Every visitor-supplied value becomes a bound parameter — no filter value
 * is ever interpolated into SQL. `params` is mutated and returned alongside
 * the clause list so callers can keep appending (LIMIT/OFFSET) afterwards.
 */
function buildFilters(filters, params) {
  const clauses = [`o.status = 'published'`];

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

async function searchOpportunities({ limit, offset, ...filters }) {
  const params = [];
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

async function findOpportunityById(id) {
  const { rows } = await query(`${OPPORTUNITY_SELECT} WHERE o.id = $1`, [id]);
  return rows[0] || null;
}

/*
 * A small preview of who is going, for social context on cards and detail.
 * Ordered deterministically so the same opportunity always previews the
 * same people.
 */
async function findAttendeePreview(opportunityId, previewLimit) {
  const { rows } = await query(
    `SELECT u.id, u.display_name, u.avatar_url
     FROM registrations r
     JOIN users u ON u.id = r.user_id
     WHERE r.opportunity_id = $1
       AND r.status = 'joined'
       AND u.demo_session_id IS NULL
     ORDER BY u.display_name ASC, u.id ASC
     LIMIT $2`,
    [opportunityId, previewLimit]
  );
  return rows;
}

async function findAttendeePreviewsFor(opportunityIds, previewLimit) {
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
       WHERE r.opportunity_id = ANY($1::uuid[])
         AND r.status = 'joined'
         AND u.demo_session_id IS NULL
     ) ranked
     WHERE rn <= $2`,
    [opportunityIds, previewLimit]
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

module.exports = {
  searchOpportunities,
  findOpportunityById,
  findAttendeePreview,
  findAttendeePreviewsFor,
};
