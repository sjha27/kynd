'use strict';

const { query } = require('../pool');

async function findUserById(id) {
  const { rows } = await query(
    `SELECT id, display_name, avatar_url, bio, city, state, created_at
     FROM users
     WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function findUserCauses(userId) {
  const { rows } = await query(
    `SELECT c.id, c.name
     FROM user_causes uc
     JOIN causes c ON c.id = uc.cause_id
     WHERE uc.user_id = $1
     ORDER BY c.sort_order`,
    [userId]
  );
  return rows;
}

async function countFollowers(userId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count FROM user_follows WHERE followed_user_id = $1`,
    [userId]
  );
  return rows[0].count;
}

async function countFollowing(userId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count FROM user_follows WHERE follower_user_id = $1`,
    [userId]
  );
  return rows[0].count;
}

// Hours = SUM(activities.hours) for the user.
// Activities = COUNT of the user's activity rows.
async function getActivityMetrics(userId) {
  const { rows } = await query(
    `SELECT
       COALESCE(SUM(a.hours), 0) AS hours,
       COUNT(*)::int AS activities
     FROM activities a
     WHERE a.user_id = $1`,
    [userId]
  );
  return rows[0];
}

// Organizations = distinct Kynd-linked organizations (via org-hosted
// registrations, or a manual activity explicitly linked to a real
// organization) plus distinct external manual organization names that
// have no Kynd organization link.
async function countProfileOrganizations(userId) {
  const { rows } = await query(
    `SELECT COUNT(DISTINCT org_key)::int AS count
     FROM (
       SELECT o.host_organization_id::text AS org_key
       FROM activities a
       JOIN registrations r ON a.registration_id = r.id
       JOIN opportunities o ON r.opportunity_id = o.id
       WHERE a.user_id = $1 AND o.host_organization_id IS NOT NULL

       UNION

       SELECT a.manual_organization_id::text AS org_key
       FROM activities a
       WHERE a.user_id = $1 AND a.manual_organization_id IS NOT NULL

       UNION

       SELECT 'external:' || a.manual_organization_name AS org_key
       FROM activities a
       WHERE a.user_id = $1
         AND a.manual_organization_id IS NULL
         AND a.manual_organization_name IS NOT NULL
     ) profile_organizations`,
    [userId]
  );
  return rows[0].count;
}

// Amount Raised = SUM(fundraiser_supports.amount_cents) for fundraisers
// where creator_user_id is the profile user.
async function getAmountRaisedCents(userId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(fs.amount_cents), 0)::bigint AS amount_cents
     FROM fundraiser_supports fs
     JOIN fundraisers f ON f.id = fs.fundraiser_id
     WHERE f.creator_user_id = $1`,
    [userId]
  );
  return rows[0].amount_cents;
}

module.exports = {
  findUserById,
  findUserCauses,
  countFollowers,
  countFollowing,
  getActivityMetrics,
  countProfileOrganizations,
  getAmountRaisedCents,
};
