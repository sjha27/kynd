'use strict';

const { query } = require('../pool');

/*
 * Home's candidate-discovery queries. Each returns just enough to rank and
 * de-duplicate within its own content family — full truthful opportunity
 * data (participants, viewerJoined, images, ...) is fetched afterward via
 * the existing session-aware opportunity lookup, not recomputed here.
 */

async function findFollowedUserIds(userId) {
  const { rows } = await query(
    `SELECT followed_user_id FROM user_follows WHERE follower_user_id = $1`,
    [userId]
  );
  return rows.map((r) => r.followed_user_id);
}

async function findFollowedOrganizationIds(userId) {
  const { rows } = await query(
    `SELECT organization_id FROM organization_follows WHERE user_id = $1`,
    [userId]
  );
  return rows.map((r) => r.organization_id);
}

async function findCauseIds(userId) {
  const { rows } = await query(`SELECT cause_id FROM user_causes WHERE user_id = $1`, [userId]);
  return rows.map((r) => r.cause_id);
}

/*
 * One row per upcoming opportunity a followed person has joined, with the
 * full set of followed participants (deduplicated by the DISTINCT jsonb
 * object) and whether a followed organization/cause also matches — the
 * additional-signal inputs the service layer uses to rank within this
 * family. org_match/cause_match are aggregated with bool_or purely because
 * they must appear inside a GROUP BY query; the underlying value is a single
 * constant per opportunity.
 */
async function findFollowedPersonUpcoming(followedUserIds, followedOrgIds, causeIds) {
  if (followedUserIds.length === 0) return [];
  const { rows } = await query(
    `SELECT
       o.id,
       o.starts_at,
       jsonb_agg(DISTINCT jsonb_build_object('id', u.id, 'name', u.display_name)) AS people,
       bool_or(o.host_organization_id = ANY($2::uuid[])) AS org_match,
       bool_or(o.cause_id = ANY($3::uuid[])) AS cause_match
     FROM registrations r
     JOIN users u ON u.id = r.user_id
     JOIN opportunities o ON o.id = r.opportunity_id
     WHERE r.user_id = ANY($1::uuid[])
       AND r.status = 'joined'
       AND o.status = 'published'
       AND o.starts_at > now()
     GROUP BY o.id, o.starts_at`,
    [followedUserIds, followedOrgIds, causeIds]
  );
  return rows;
}

/*
 * A followed person's own recent activity, Kynd-originated or manual. Kept
 * as raw rows (not the product opportunity shape) since an activity is a
 * distinct object from an opportunity — the feed renders it directly from
 * these columns, never fabricating a field that isn't here.
 */
async function findFollowedPersonActivities(followedUserIds) {
  if (followedUserIds.length === 0) return [];
  const { rows } = await query(
    `SELECT
       a.id,
       a.user_id,
       u.display_name AS person_name,
       a.occurred_on,
       a.hours,
       a.story,
       a.image_url,
       a.manual_title,
       a.manual_organization_name,
       o.id AS opportunity_id,
       o.title AS opportunity_title,
       ho.name AS opportunity_org_name,
       oc.name AS opportunity_cause_name,
       mc.name AS manual_cause_name
     FROM activities a
     JOIN users u ON u.id = a.user_id
     LEFT JOIN registrations r ON r.id = a.registration_id
     LEFT JOIN opportunities o ON o.id = r.opportunity_id
     LEFT JOIN organizations ho ON ho.id = o.host_organization_id
     LEFT JOIN causes oc ON oc.id = o.cause_id
     LEFT JOIN causes mc ON mc.id = a.manual_cause_id
     WHERE a.user_id = ANY($1::uuid[])
     ORDER BY a.occurred_on DESC, a.id ASC
     LIMIT 50`,
    [followedUserIds]
  );
  return rows;
}

async function findFollowedOrganizationOpportunities(followedOrgIds) {
  if (followedOrgIds.length === 0) return [];
  const { rows } = await query(
    `SELECT o.id, o.starts_at, o.host_organization_id, ho.name AS org_name
     FROM opportunities o
     JOIN organizations ho ON ho.id = o.host_organization_id
     WHERE o.host_organization_id = ANY($1::uuid[])
       AND o.status = 'published'
       AND o.starts_at > now()
     ORDER BY o.starts_at ASC, o.id ASC
     LIMIT 50`,
    [followedOrgIds]
  );
  return rows;
}

/*
 * outside_graph is computed and ordered in SQL so "prefer content outside
 * Frank's existing follow graph" doesn't need its own ranking pass — a
 * plain boolean DESC does it (Postgres sorts true before false descending).
 */
async function findCauseDiscoveryOpportunities(causeIds, followedUserIds, followedOrgIds) {
  if (causeIds.length === 0) return [];
  const { rows } = await query(
    `SELECT
       o.id,
       o.starts_at,
       o.host_organization_id,
       o.host_user_id,
       c.name AS cause_name,
       NOT (
         (o.host_organization_id IS NOT NULL AND o.host_organization_id = ANY($2::uuid[]))
         OR (o.host_user_id IS NOT NULL AND o.host_user_id = ANY($3::uuid[]))
       ) AS outside_graph
     FROM opportunities o
     JOIN causes c ON c.id = o.cause_id
     WHERE o.cause_id = ANY($1::uuid[])
       AND o.status = 'published'
       AND o.starts_at > now()
     ORDER BY outside_graph DESC, o.starts_at ASC, o.id ASC
     LIMIT 100`,
    [causeIds, followedOrgIds, followedUserIds]
  );
  return rows;
}

module.exports = {
  findFollowedUserIds,
  findFollowedOrganizationIds,
  findCauseIds,
  findFollowedPersonUpcoming,
  findFollowedPersonActivities,
  findFollowedOrganizationOpportunities,
  findCauseDiscoveryOpportunities,
};
