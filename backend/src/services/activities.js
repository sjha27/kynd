'use strict';

const crypto = require('node:crypto');

const activitiesQueries = require('../db/queries/activities');
const { NotFoundError, ConflictError, ValidationError } = require('../errors');
const { DEMO_COMPLETABLE_OPPORTUNITY_IDS } = require('../config/demo_completion');

function toProductActivity(row) {
  const host = row.host_organization_id
    ? { type: 'organization', id: row.host_organization_id, name: row.host_organization_name }
    : row.host_user_id
      ? { type: 'user', id: row.host_user_id, name: row.host_user_name }
      : null;

  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    title: row.title,
    host,
    cause: { name: row.cause_name },
    occurredOn: row.occurred_on,
    hours: Number(row.hours),
    story: row.story || null,
    imageUrl: row.image_url || row.opportunity_image_url || null,
  };
}

/*
 * Completion, as a product operation.
 *
 * The acting user always comes from the resolved session (never the
 * request body) — same rule Join uses. Only `hours` and `story` are ever
 * read from the body, because those are genuinely the visitor's own input
 * about their own participation, not a way to act as someone else.
 */
async function completeOpportunity({ opportunityId, userId, hours, story }) {
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new ValidationError('Hours must be a positive number.');
  }

  const registration = await activitiesQueries.findRegistrationForCompletion(userId, opportunityId);
  if (!registration || registration.status !== 'joined') {
    // A well-formed opportunity id, but this visitor never joined it (or
    // cancelled) — same "not found" framing Follow uses for a target that
    // exists but isn't addressable in the current context.
    throw new NotFoundError('You have not joined this opportunity.');
  }

  if (registration.already_completed) {
    throw new ConflictError('This opportunity has already been completed.', 'activity_already_completed');
  }

  const isDemoEarlyCompletion = !registration.has_ended;
  if (isDemoEarlyCompletion && !DEMO_COMPLETABLE_OPPORTUNITY_IDS.includes(opportunityId)) {
    throw new ConflictError(
      'This opportunity can be completed once it has ended.',
      'opportunity_not_completable'
    );
  }

  // Normal completion dates the activity to when the opportunity actually
  // ended. The demo-only early path dates it to the real current Atlanta
  // calendar date — never a fabricated future date, and never routed
  // through the synthetic seeded-world clock.
  const occurredOn = isDemoEarlyCompletion ? registration.today_date : registration.ends_on_date;

  await activitiesQueries.insertActivity({
    id: crypto.randomUUID(),
    userId,
    registrationId: registration.registration_id,
    occurredOn,
    hours,
    story: story || null,
  });

  return { completed: true };
}

async function listCompletedForSession(sessionId) {
  const rows = await activitiesQueries.findCompletedForSession(sessionId);
  return rows.map(toProductActivity);
}

module.exports = { completeOpportunity, listCompletedForSession };
