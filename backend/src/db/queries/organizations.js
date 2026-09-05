'use strict';

const { query } = require('../pool');
const { visibleOrganizationFollowerCountSql, visibleJoinedCountSql } = require('../visibility');

async function findOrganizationById(id) {
  const { rows } = await query(
    `SELECT id, name, mission, logo_url, city, state, is_verified_demo, created_at
     FROM organizations
     WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function findOrganizationCauses(organizationId) {
  const { rows } = await query(
    `SELECT c.id, c.name
     FROM organization_causes oc
     JOIN causes c ON c.id = oc.cause_id
     WHERE oc.organization_id = $1
     ORDER BY c.sort_order`,
    [organizationId]
  );
  return rows;
}

// Seeded followers of this organization, plus the current viewer's own
// temporary user if they follow it — organizations are always seeded, so
// only the follower (user) side can ever be a temporary visitor.
async function countFollowers(organizationId, sessionId = null) {
  const { rows } = await query(
    `SELECT ${visibleOrganizationFollowerCountSql('$1', '$2')} AS count`,
    [organizationId, sessionId]
  );
  return rows[0].count;
}

// joined_count was previously a raw COUNT(*) over registrations with no join
// to users and no session scoping — exactly the leak visibility.js exists to
// prevent, just never applied on this surface. Every visitor (including
// anonymous) was seeing every other visitor's temporary joins inflate this
// number. Fixed to reuse visibleJoinedCountSql, same as the main opportunity
// query and Join's own response.
async function findUpcomingOpportunities(organizationId, sessionId, limit = 5) {
  const { rows } = await query(
    `SELECT
       o.id, o.title, o.opportunity_type, o.starts_at, o.capacity,
       ${visibleJoinedCountSql('o.id', '$2')} AS joined_count
     FROM opportunities o
     WHERE o.host_organization_id = $1
       AND o.status = 'published'
       AND o.starts_at > now()
     ORDER BY o.starts_at ASC
     LIMIT $3`,
    [organizationId, sessionId, limit]
  );
  return rows;
}

async function findActiveFundraisers(organizationId, limit = 5) {
  const { rows } = await query(
    `SELECT
       f.id, f.title, f.goal_amount_cents, f.end_date,
       (
         SELECT COALESCE(SUM(fs.amount_cents), 0)::bigint
         FROM fundraiser_supports fs
         WHERE fs.fundraiser_id = f.id
       ) AS raised_cents,
       (
         SELECT COUNT(*)::int
         FROM fundraiser_supports fs
         WHERE fs.fundraiser_id = f.id
       ) AS supporter_count
     FROM fundraisers f
     WHERE f.creator_organization_id = $1 AND f.status = 'active'
     ORDER BY f.end_date ASC
     LIMIT $2`,
    [organizationId, limit]
  );
  return rows;
}

module.exports = {
  findOrganizationById,
  findOrganizationCauses,
  countFollowers,
  findUpcomingOpportunities,
  findActiveFundraisers,
};
