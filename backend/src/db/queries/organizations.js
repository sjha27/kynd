'use strict';

const { query } = require('../pool');

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

async function countFollowers(organizationId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count
     FROM organization_follows
     WHERE organization_id = $1`,
    [organizationId]
  );
  return rows[0].count;
}

async function findUpcomingOpportunities(organizationId, limit = 5) {
  const { rows } = await query(
    `SELECT
       o.id, o.title, o.opportunity_type, o.starts_at, o.capacity,
       (
         SELECT COUNT(*)::int
         FROM registrations r
         WHERE r.opportunity_id = o.id AND r.status = 'joined'
       ) AS joined_count
     FROM opportunities o
     WHERE o.host_organization_id = $1
       AND o.status = 'published'
       AND o.starts_at > now()
     ORDER BY o.starts_at ASC
     LIMIT $2`,
    [organizationId, limit]
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
