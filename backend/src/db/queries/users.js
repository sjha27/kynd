'use strict';

const { query } = require('../pool');
const { visibleUserPredicate, visibleFollowerCountSql } = require('../visibility');

/*
 * A user is addressable by a viewer only if they are seeded, or they are the
 * viewer's own temporary user. This is the same rule Join and Discover use
 * for participant visibility, applied here to the target of a profile read
 * (or a follow) rather than to aggregation. Another session's temporary
 * user simply does not match this query — indistinguishable from an id that
 * never existed, by design.
 */
async function findUserById(id, sessionId = null) {
  const { rows } = await query(
    `SELECT u.id, u.display_name, u.avatar_url, u.bio, u.city, u.state, u.created_at
     FROM users u
     WHERE u.id = $1 AND ${visibleUserPredicate('u', '$2')}`,
    [id, sessionId]
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

// Seeded followers of this user, plus the current viewer's own temporary
// user if they follow this profile — never another visitor's temporary
// follow. Same rule as visibleJoinedCountSql, applied to user_follows.
async function countFollowers(userId, sessionId = null) {
  const { rows } = await query(
    `SELECT ${visibleFollowerCountSql('$1', '$2')} AS count`,
    [userId, sessionId]
  );
  return rows[0].count;
}

// A seeded profile's outgoing follows are always seeded->seeded (temporary
// users didn't exist when the world was seeded), so this count cannot
// structurally contain another visitor's edge. The predicate is still
// applied on the followed side for defense in depth, reusing the existing
// rule rather than assuming the invariant holds forever.
async function countFollowing(userId, sessionId = null) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count
     FROM user_follows f
     JOIN users vu ON vu.id = f.followed_user_id
     WHERE f.follower_user_id = $1 AND ${visibleUserPredicate('vu', '$2')}`,
    [userId, sessionId]
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
