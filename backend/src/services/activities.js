'use strict';

const crypto = require('node:crypto');

const activitiesQueries = require('../db/queries/activities');
const { NotFoundError, ConflictError, ValidationError } = require('../errors');
const { DEMO_COMPLETABLE_OPPORTUNITY_IDS } = require('../config/demo_completion');

/*
 * One shape for both kinds of completed activity.
 *
 * A Kynd-originated activity gets its title/host/cause from the opportunity
 * it came from; a manually logged one from its own manual_* columns. The
 * host of a manual activity is a real Kynd organization when the name the
 * visitor typed matched one (so it can link like any other host), and an
 * unlinked `external` host when it did not — the product deliberately
 * remembers contribution to organizations that aren't on Kynd.
 */
function toProductActivity(row) {
  const host = row.host_organization_id
    ? { type: 'organization', id: row.host_organization_id, name: row.host_organization_name }
    : row.host_user_id
      ? { type: 'user', id: row.host_user_id, name: row.host_user_name }
      : row.manual_organization_id
        ? {
            type: 'organization',
            id: row.manual_organization_id,
            name: row.manual_organization_linked_name,
          }
        : row.manual_organization_name
          ? { type: 'external', id: null, name: row.manual_organization_name }
          : null;

  return {
    id: row.id,
    // `manual` is contribution that happened outside Kynd. The UI uses this
    // to be honest about where a history entry came from rather than
    // presenting a self-reported entry as a Kynd-hosted one.
    source: row.opportunity_id ? 'kynd' : 'manual',
    opportunityId: row.opportunity_id || null,
    title: row.title || row.manual_title,
    host,
    cause: row.cause_name ? { name: row.cause_name } : null,
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

  return {
    completed: true,
    // Stripped by the route. is_demo_path is what lets the flagship's early
    // completion shortcut be excluded from an honest completion rate.
    analytics: {
      cause: registration.cause_name,
      hours,
      has_story: Boolean(story),
      is_demo_path: isDemoEarlyCompletion,
    },
  };
}

// Free-text fields go into unbounded TEXT columns, so they get sane
// product-level limits here rather than accepting arbitrarily large input.
const MAX_TITLE_LENGTH = 120;
const MAX_ORGANIZATION_NAME_LENGTH = 120;
const MAX_STORY_LENGTH = 1000;

// A single day's contribution. Not hour verification — just a bound that
// keeps an obvious typo out of a metric the profile displays.
const MAX_HOURS = 24;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requiredText(value, label, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new ValidationError(`${label} is required.`);
  }
  if (text.length > maxLength) {
    throw new ValidationError(`${label} must be ${maxLength} characters or fewer.`);
  }
  return text;
}

/*
 * Strict YYYY-MM-DD only. The round-trip check rejects dates that parse but
 * don't exist (2026-02-31), which Postgres would otherwise reject as a raw
 * database error rather than a clean 400.
 */
function parseCalendarDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value.trim())) {
    throw new ValidationError('Date must be a valid date in YYYY-MM-DD format.');
  }
  const date = value.trim();
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new ValidationError('Date must be a valid date in YYYY-MM-DD format.');
  }
  return date;
}

/*
 * Manual activity logging: contribution that happened outside Kynd.
 *
 * The acting user always comes from the resolved session, same rule Join and
 * Completion use. Everything else is the visitor's own account of their own
 * participation — except the cause, which must be one of the seeded set, and
 * the organization link, which the backend derives rather than accepting as
 * an id from the client.
 *
 * The result is a real activities row with registration_id NULL, so it flows
 * through the same Activity -> Completed and Profile surfaces Completion
 * already built. Nothing about profile metrics is duplicated here.
 */
async function logManualActivity({ userId, title, causeName, organizationName, occurredOn, hours, story }) {
  const cleanTitle = requiredText(title, 'Activity title', MAX_TITLE_LENGTH);
  const cleanOrganization = requiredText(
    organizationName,
    'Organization',
    MAX_ORGANIZATION_NAME_LENGTH
  );
  const cleanCauseName = requiredText(causeName, 'Cause', MAX_ORGANIZATION_NAME_LENGTH);
  const date = parseCalendarDate(occurredOn);

  if (!Number.isFinite(hours) || hours <= 0) {
    throw new ValidationError('Hours must be a positive number.');
  }
  if (hours > MAX_HOURS) {
    throw new ValidationError(`Hours must be ${MAX_HOURS} or fewer.`);
  }

  if (typeof story === 'string' && story.trim().length > MAX_STORY_LENGTH) {
    throw new ValidationError(`Story must be ${MAX_STORY_LENGTH} characters or fewer.`);
  }

  const resolved = await activitiesQueries.resolveManualActivityInputs({
    causeName: cleanCauseName,
    organizationName: cleanOrganization,
    occurredOn: date,
  });

  if (!resolved.cause_id) {
    throw new ValidationError('Cause must be one of the causes on Kynd.');
  }
  if (resolved.is_future) {
    throw new ValidationError('Date cannot be in the future.');
  }

  const id = crypto.randomUUID();
  await activitiesQueries.insertManualActivity({
    id,
    userId,
    occurredOn: date,
    hours,
    title: cleanTitle,
    causeId: resolved.cause_id,
    // Linked when the typed name matched a Kynd organization; the stored
    // name is then that organization's canonical one rather than whatever
    // casing the visitor typed.
    organizationId: resolved.organization_id || null,
    organizationName: resolved.organization_name || cleanOrganization,
    story: (typeof story === 'string' && story.trim()) || null,
  });

  return {
    logged: true,
    activityId: id,
    // Only shapes, never the visitor's words: no title, no story text, and
    // no externally-typed organization name.
    analytics: {
      cause: cleanCauseName,
      hours,
      org_is_kynd: Boolean(resolved.organization_id),
      has_story: Boolean(typeof story === 'string' && story.trim()),
    },
  };
}

async function listCompletedForSession(sessionId) {
  const rows = await activitiesQueries.findCompletedForSession(sessionId);
  return rows.map(toProductActivity);
}

/*
 * One person's contribution history for their profile — the same product
 * shape Activity -> Completed uses, so the same card renders both.
 * Addressability of the profile itself is the caller's job.
 */
async function listActivitiesForUser(userId) {
  const rows = await activitiesQueries.findActivitiesForUser(userId);
  return rows.map(toProductActivity);
}

module.exports = {
  completeOpportunity,
  logManualActivity,
  listCompletedForSession,
  listActivitiesForUser,
};
