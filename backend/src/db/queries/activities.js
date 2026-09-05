'use strict';

const { query } = require('../pool');
const { LOCAL_TIMEZONE } = require('../../lib/discovery');

/*
 * The registration a completion acts on, plus everything needed to decide
 * eligibility and the activity's date — all computed in SQL against the
 * real database clock, never the synthetic WORLD_REFERENCE_DATE:
 *
 *   has_ended       — the normal completion rule
 *   ends_on_date    — occurred_on for a normal (already-ended) completion
 *   today_date      — occurred_on for the demo-only early flagship path
 *   already_completed — this registration already has an activity
 *
 * Scoped by user_id so a caller can only ever complete their own
 * registration — mirrors Join's rule that the acting user always comes
 * from the resolved session, never from client input.
 */
async function findRegistrationForCompletion(userId, opportunityId) {
  const { rows } = await query(
    `SELECT
       r.id AS registration_id,
       r.status,
       (o.ends_at < now()) AS has_ended,
       (o.ends_at AT TIME ZONE $3)::date AS ends_on_date,
       (now() AT TIME ZONE $3)::date AS today_date,
       (SELECT 1 FROM activities a WHERE a.registration_id = r.id) IS NOT NULL AS already_completed
     FROM registrations r
     JOIN opportunities o ON o.id = r.opportunity_id
     WHERE r.user_id = $1 AND r.opportunity_id = $2`,
    [userId, opportunityId, LOCAL_TIMEZONE]
  );
  return rows[0] || null;
}

async function insertActivity({ id, userId, registrationId, occurredOn, hours, story }) {
  await query(
    `INSERT INTO activities (id, user_id, registration_id, occurred_on, hours, story)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, registrationId, occurredOn, hours, story]
  );
}

/*
 * The current visitor's completed activities, scoped by session rather
 * than by user id alone — same rule findUpcomingForSession uses, so a
 * caller cannot pass another visitor's user id and read their history.
 * Only Kynd-originated activities exist today (no manual logging yet), so
 * this always joins through registrations/opportunities.
 */
async function findCompletedForSession(sessionId, limit = 50) {
  const { rows } = await query(
    `SELECT
       a.id,
       a.occurred_on,
       a.hours,
       a.story,
       a.image_url,
       o.id AS opportunity_id,
       o.title,
       o.image_url AS opportunity_image_url,
       c.name AS cause_name,
       ho.id AS host_organization_id,
       ho.name AS host_organization_name,
       hu.id AS host_user_id,
       hu.display_name AS host_user_name
     FROM activities a
     JOIN registrations r ON r.id = a.registration_id
     JOIN users ru ON ru.id = r.user_id AND ru.demo_session_id = $1
     JOIN opportunities o ON o.id = r.opportunity_id
     JOIN causes c ON c.id = o.cause_id
     LEFT JOIN organizations ho ON ho.id = o.host_organization_id
     LEFT JOIN users hu ON hu.id = o.host_user_id
     ORDER BY a.occurred_on DESC, a.id ASC
     LIMIT $2`,
    [sessionId, limit]
  );
  return rows;
}

module.exports = {
  findRegistrationForCompletion,
  insertActivity,
  findCompletedForSession,
};
