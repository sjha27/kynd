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
 * Everything a manual log needs resolved against the database in one round
 * trip:
 *
 *   cause_id          — the seeded cause the visitor picked, by exact name.
 *                       NULL means they sent something outside the seeded
 *                       set, which the service rejects. Causes are never
 *                       free text.
 *   organization_*    — the Kynd organization whose name the visitor typed,
 *                       if one matches. NULL simply means the organization
 *                       is external to Kynd, which is a valid manual source.
 *   is_future         — the date check, done in SQL against the real
 *                       database clock in Atlanta time. Never the synthetic
 *                       WORLD_REFERENCE_DATE: a manual log records something
 *                       that happened in the real world.
 *
 * `occurredOn` is a validated YYYY-MM-DD string by the time it gets here, so
 * the ::date cast cannot fail on malformed input.
 */
async function resolveManualActivityInputs({ causeName, organizationName, occurredOn }) {
  const { rows } = await query(
    `SELECT
       (SELECT c.id FROM causes c WHERE c.name = $1) AS cause_id,
       org.id AS organization_id,
       org.name AS organization_name,
       ($3::date > (now() AT TIME ZONE $4)::date) AS is_future
     FROM (SELECT 1) AS anchor
     LEFT JOIN LATERAL (
       SELECT o.id, o.name
       FROM organizations o
       WHERE lower(o.name) = lower($2)
       ORDER BY o.name
       LIMIT 1
     ) AS org ON true`,
    [causeName, organizationName, occurredOn, LOCAL_TIMEZONE]
  );
  return rows[0];
}

/*
 * A contribution that happened outside Kynd. registration_id stays NULL and
 * the manual_* columns carry the source instead — the shape the schema's
 * chk_activities_source_shape constraint requires. manual_organization_name
 * is always written (the constraint requires it even when the organization
 * is also linked by id); manual_organization_id is set only when the typed
 * name matched a real Kynd organization.
 */
async function insertManualActivity({
  id,
  userId,
  occurredOn,
  hours,
  title,
  causeId,
  organizationId,
  organizationName,
  story,
}) {
  await query(
    `INSERT INTO activities
       (id, user_id, registration_id, occurred_on, hours,
        manual_title, manual_cause_id, manual_organization_id, manual_organization_name, story)
     VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9)`,
    [id, userId, occurredOn, hours, title, causeId, organizationId, organizationName, story]
  );
}

/*
 * The current visitor's completed activities, scoped by session rather
 * than by user id alone — same rule findUpcomingForSession uses, so a
 * caller cannot pass another visitor's user id and read their history.
 *
 * Both sources land here. A Kynd-originated activity resolves its title,
 * cause and host through registration -> opportunity; a manually logged one
 * carries them in its own manual_* columns and has no registration at all.
 * The joins are therefore all LEFT, and the session scope moves onto
 * activities.user_id, which the schema's composite FK already guarantees
 * matches the registration's user when there is one.
 *
 * Same-day ordering falls back to created_at so a just-logged activity
 * appears above older entries for that date, and finally to id so the order
 * is fully deterministic.
 */
async function findCompletedForSession(sessionId, limit = 50) {
  const { rows } = await query(
    `SELECT
       a.id,
       -- occurred_on is a calendar date, not an instant. Emitted as text so
       -- it crosses the API boundary as a plain 'YYYY-MM-DD': pg would
       -- otherwise parse it into a JS Date at the Node process's local
       -- midnight, which serializes to a timestamp and renders as the
       -- previous day wherever the server runs behind the display timezone
       -- (Render is UTC, the product displays Atlanta time).
       to_char(a.occurred_on, 'YYYY-MM-DD') AS occurred_on,
       a.hours,
       a.story,
       a.image_url,
       a.manual_title,
       a.manual_organization_name,
       o.id AS opportunity_id,
       o.title,
       o.image_url AS opportunity_image_url,
       COALESCE(c.name, mc.name) AS cause_name,
       ho.id AS host_organization_id,
       ho.name AS host_organization_name,
       hu.id AS host_user_id,
       hu.display_name AS host_user_name,
       mo.id AS manual_organization_id,
       mo.name AS manual_organization_linked_name
     FROM activities a
     JOIN users au ON au.id = a.user_id AND au.demo_session_id = $1
     LEFT JOIN registrations r ON r.id = a.registration_id
     LEFT JOIN opportunities o ON o.id = r.opportunity_id
     LEFT JOIN causes c ON c.id = o.cause_id
     LEFT JOIN causes mc ON mc.id = a.manual_cause_id
     LEFT JOIN organizations ho ON ho.id = o.host_organization_id
     LEFT JOIN users hu ON hu.id = o.host_user_id
     LEFT JOIN organizations mo ON mo.id = a.manual_organization_id
     ORDER BY a.occurred_on DESC, a.created_at DESC, a.id ASC
     LIMIT $2`,
    [sessionId, limit]
  );
  return rows;
}

module.exports = {
  findRegistrationForCompletion,
  insertActivity,
  resolveManualActivityInputs,
  insertManualActivity,
  findCompletedForSession,
};
