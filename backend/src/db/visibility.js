'use strict';

/*
 * The frozen Kynd visibility rule, in one place.
 *
 *   Visible actors/state = seeded users (demo_session_id IS NULL)
 *                        + the current temporary user
 *
 * Every temporary visitor gets their own consistent world: they see the
 * seeded community plus their own actions, and never another visitor's. If
 * two visitors both join the flagship, each sees 6/19 — never 7/18.
 *
 * Expressed as a predicate over a users alias so participant counts, attendee
 * previews, capacity checks and the Join response all share one definition
 * rather than three subtly different ones.
 *
 * The session parameter is ALWAYS bound, even when absent. Passing NULL makes
 * `demo_session_id = NULL` unknown (never true), so the predicate collapses to
 * "seeded only" with no branching and no separate anonymous query path.
 */
function visibleUserPredicate(usersAlias, sessionParam) {
  return `(${usersAlias}.demo_session_id IS NULL OR ${usersAlias}.demo_session_id = ${sessionParam})`;
}

/*
 * Whether an opportunity itself is addressable by this viewer.
 *
 * Every seeded opportunity is hosted either by an organization or by a
 * seeded user, so this is always true for the seeded world. It starts to
 * matter the moment temporary visitors can create opportunities: an
 * opportunity hosted by ANOTHER session's temporary user must be invisible,
 * or Session A's creation would surface in Session B's Discover, detail
 * route and Home — exactly the leak the frozen visibility rule forbids.
 *
 * Expects the opportunity's host user to be LEFT JOINed as `hostUserAlias`.
 * The host_user_id IS NULL branch is written out rather than relying on the
 * unmatched-join columns being NULL, so the organization-hosted case is
 * explicit instead of accidental.
 */
function visibleOpportunityPredicate(opportunityAlias, hostUserAlias, sessionParam) {
  return `(${opportunityAlias}.host_user_id IS NULL OR ${visibleUserPredicate(hostUserAlias, sessionParam)})`;
}

/*
 * Count of participants an opportunity should appear to have for this viewer.
 * Joins through users so unrelated temporary visitors are excluded — counting
 * registrations alone would leak every other session's joins.
 */
function visibleJoinedCountSql(opportunityRef, sessionParam) {
  return `(
    SELECT COUNT(*)::int
    FROM registrations vr
    JOIN users vu ON vu.id = vr.user_id
    WHERE vr.opportunity_id = ${opportunityRef}
      AND vr.status = 'joined'
      AND ${visibleUserPredicate('vu', sessionParam)}
  )`;
}

/*
 * Count of followers a user should appear to have for this viewer. Same
 * shape as visibleJoinedCountSql: joins through users so another visitor's
 * temporary follow can never inflate what this viewer sees.
 */
function visibleFollowerCountSql(followedUserRef, sessionParam) {
  return `(
    SELECT COUNT(*)::int
    FROM user_follows vf
    JOIN users vu ON vu.id = vf.follower_user_id
    WHERE vf.followed_user_id = ${followedUserRef}
      AND ${visibleUserPredicate('vu', sessionParam)}
  )`;
}

/*
 * Count of followers an organization should appear to have for this viewer.
 * Organizations themselves are always seeded; only the follower side (a user)
 * can ever be a temporary visitor, so only that side needs the predicate.
 */
function visibleOrganizationFollowerCountSql(organizationRef, sessionParam) {
  return `(
    SELECT COUNT(*)::int
    FROM organization_follows vf
    JOIN users vu ON vu.id = vf.user_id
    WHERE vf.organization_id = ${organizationRef}
      AND ${visibleUserPredicate('vu', sessionParam)}
  )`;
}

module.exports = {
  visibleUserPredicate,
  visibleOpportunityPredicate,
  visibleJoinedCountSql,
  visibleFollowerCountSql,
  visibleOrganizationFollowerCountSql,
};
