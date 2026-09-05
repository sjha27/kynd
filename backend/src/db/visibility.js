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

module.exports = { visibleUserPredicate, visibleJoinedCountSql };
