'use strict';

const crypto = require('node:crypto');

const opportunitiesQueries = require('../db/queries/opportunities');
const { NotFoundError, ConflictError, ValidationError } = require('../errors');
const { COMMITMENT_BANDS, OPPORTUNITY_TYPES } = require('../lib/discovery');
const { DEMO_COMPLETABLE_OPPORTUNITY_IDS } = require('../config/demo_completion');

const CARD_ATTENDEE_PREVIEW = 3;
const DETAIL_ATTENDEE_PREVIEW = 8;

function durationMinutes(startsAt, endsAt) {
  return Math.round((new Date(endsAt) - new Date(startsAt)) / 60000);
}

// Maps a real duration onto the same bands the filter API exposes, so a
// card's "2 hours" label and the "1-3 hours" filter can never disagree.
function commitmentBand(minutes) {
  for (const [key, band] of Object.entries(COMMITMENT_BANDS)) {
    const aboveMin =
      band.minMinutes === null ||
      (band.exclusiveMin ? minutes > band.minMinutes : minutes >= band.minMinutes);
    const belowMax =
      band.maxMinutes === null ||
      (band.exclusiveMax ? minutes < band.maxMinutes : minutes <= band.maxMinutes);
    if (aboveMin && belowMax) return key;
  }
  return null;
}

function toAttendee(row) {
  return { id: row.id, name: row.display_name, avatarUrl: row.avatar_url };
}

function toProductOpportunity(row, { attendees = [] } = {}) {
  const host = row.host_user_id
    ? {
        type: 'user',
        id: row.host_user_id,
        name: row.host_user_name,
        avatarUrl: row.host_user_avatar_url,
      }
    : {
        type: 'organization',
        id: row.host_organization_id,
        name: row.host_organization_name,
        logoUrl: row.host_organization_logo_url,
        verified: row.host_organization_verified,
      };

  // Participant counts stay derived from registrations — never stored.
  const joined = row.joined_count;
  const available = Math.max(row.capacity - joined, 0);
  const minutes = durationMinutes(row.starts_at, row.ends_at);

  return {
    id: row.id,
    title: row.title,
    type: row.opportunity_type,
    status: row.status,
    cause: { id: row.cause_id, name: row.cause_name },
    host,
    description: row.description,
    whatYoullDo: row.what_youll_do,
    requirements: row.requirements,
    timing: {
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      durationMinutes: minutes,
      commitment: commitmentBand(minutes),
    },
    location: row.is_online
      ? { isOnline: true }
      : {
          isOnline: false,
          name: row.location_name,
          city: row.city,
          state: row.state,
        },
    capacity: row.capacity,
    // True only when THIS viewer holds a joined registration. Derived on the
    // server from the session; never inferred in the browser.
    viewerJoined: row.viewer_joined === true,
    // Same rule as viewerJoined: derived on the server from the session.
    viewerSaved: row.viewer_saved === true,
    // The single source of truth for "does this opportunity get the
    // early demo-completion path" — the allowlist itself lives only in
    // config/demo_completion.js. The frontend must read this field rather
    // than re-deriving or duplicating the allowlist.
    demoCompletionEligible: DEMO_COMPLETABLE_OPPORTUNITY_IDS.includes(row.id),
    participants: {
      joined,
      available,
      // Non-personalized social proof: who is actually registered. When the
      // social graph exists this same shape gains "followed by you" context
      // without the consumers of it changing.
      preview: attendees.map(toAttendee),
    },
    imageUrl: row.image_url,
  };
}

async function listOpportunities({ limit = 20, offset = 0, sessionId = null, ...filters } = {}) {
  const { rows, total } = await opportunitiesQueries.searchOpportunities({
    limit,
    offset,
    sessionId,
    ...filters,
  });

  const previews = await opportunitiesQueries.findAttendeePreviewsFor(
    rows.map((row) => row.id),
    CARD_ATTENDEE_PREVIEW,
    sessionId
  );

  return {
    opportunities: rows.map((row) =>
      toProductOpportunity(row, { attendees: previews.get(row.id) || [] })
    ),
    total,
  };
}

async function getOpportunityDetail(id, sessionId = null) {
  const row = await opportunitiesQueries.findOpportunityById(id, sessionId);
  if (!row) {
    throw new NotFoundError('Opportunity not found');
  }
  const attendees = await opportunitiesQueries.findAttendeePreview(
    id,
    DETAIL_ATTENDEE_PREVIEW,
    sessionId
  );
  return toProductOpportunity(row, { attendees });
}

/*
 * Join, as a product operation.
 *
 * The caller supplies only the opportunity; the acting user comes from the
 * resolved session, so a request can never join on someone else's behalf.
 */
async function joinOpportunity({ opportunityId, sessionId, userId }) {
  const result = await opportunitiesQueries.joinOpportunity({
    opportunityId,
    userId,
    sessionId,
  });

  if (result.outcome === 'not_found') {
    throw new NotFoundError('Opportunity not found');
  }
  if (result.outcome === 'not_joinable') {
    throw new ConflictError('This opportunity is no longer open to join.', 'opportunity_not_joinable');
  }
  if (result.outcome === 'full') {
    throw new ConflictError('This opportunity is full.', 'opportunity_full');
  }

  return {
    joined: true,
    capacity: result.capacity,
    participantCount: result.joinedCount,
    availableSpots: Math.max(result.capacity - result.joinedCount, 0),
    // Stripped by the route before the response — carried here only so the
    // funnel can be segmented by cause without a second query.
    analytics: { cause: result.causeName, was_rejoin: result.alreadyJoined === true },
  };
}

/*
 * Leave, as a product operation — the counterpart to Join.
 *
 * Returns the same derived participation shape Join does, so the caller can
 * apply one consistent update either way. Idempotent, so a double click or a
 * retry lands on the same state instead of an error.
 */
async function leaveOpportunity({ opportunityId, sessionId, userId }) {
  const result = await opportunitiesQueries.leaveOpportunity({
    opportunityId,
    userId,
    sessionId,
  });

  if (result.outcome === 'not_found') {
    throw new NotFoundError('Opportunity not found');
  }
  if (result.outcome === 'completed') {
    throw new ConflictError(
      'This is already part of your history and cannot be left.',
      'opportunity_already_completed'
    );
  }

  return {
    joined: false,
    capacity: result.capacity,
    participantCount: result.joinedCount,
    availableSpots: Math.max(result.capacity - result.joinedCount, 0),
    analytics: {
      cause: result.causeName,
      // How far ahead of the start someone dropped out — a marketplace
      // health signal. Rounded; the exact second carries no meaning.
      hours_before_start:
        result.hoursBeforeStart === null || result.hoursBeforeStart === undefined
          ? null
          : Math.round(Number(result.hoursBeforeStart)),
    },
  };
}

// The visitor's own upcoming joined opportunities, shaped like the cards
// Discover already renders so Activity can reuse them.
async function listUpcomingForSession(sessionId) {
  const rows = await opportunitiesQueries.findUpcomingForSession(sessionId);
  const previews = await opportunitiesQueries.findAttendeePreviewsFor(
    rows.map((row) => row.id),
    CARD_ATTENDEE_PREVIEW,
    sessionId
  );
  return rows.map((row) =>
    toProductOpportunity(row, { attendees: previews.get(row.id) || [] })
  );
}

// The visitor's own saved opportunities, shaped like the cards Discover
// already renders so Activity can reuse them.
async function listSavedForSession(sessionId) {
  const rows = await opportunitiesQueries.findSavedForSession(sessionId);
  const previews = await opportunitiesQueries.findAttendeePreviewsFor(
    rows.map((row) => row.id),
    CARD_ATTENDEE_PREVIEW,
    sessionId
  );
  return rows.map((row) => toProductOpportunity(row, { attendees: previews.get(row.id) || [] }));
}

// Joined, ended, not-yet-completed opportunities — the normal
// "Did you participate?" state, reachable independently of the demo-only
// early flagship path.
async function listAwaitingConfirmationForSession(sessionId) {
  const rows = await opportunitiesQueries.findAwaitingConfirmationForSession(sessionId);
  const previews = await opportunitiesQueries.findAttendeePreviewsFor(
    rows.map((row) => row.id),
    CARD_ATTENDEE_PREVIEW,
    sessionId
  );
  return rows.map((row) =>
    toProductOpportunity(row, { attendees: previews.get(row.id) || [] })
  );
}

// Free-text goes into unbounded TEXT columns, so it gets product-level
// bounds here. Capacity's ceiling keeps an obvious typo out of a number the
// marketplace displays; the schema itself only requires it to be positive.
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_LOCATION_LENGTH = 120;
const MAX_CAPACITY = 500;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATE_PATTERN = /^[A-Z]{2}$/;

function requiredText(value, label, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new ValidationError(`${label} is required.`);
  if (text.length > maxLength) {
    throw new ValidationError(`${label} must be ${maxLength} characters or fewer.`);
  }
  return text;
}

/*
 * Creating an opportunity, as a product operation.
 *
 * The host is ALWAYS the resolved session's temporary user — host_user_id is
 * never read from the request. This is the same rule Join, Completion and
 * manual logging use, and it is what makes "Frank is the host" a fact about
 * the session rather than a claim the browser makes.
 *
 * The result is a real published opportunities row, so it reaches Discover,
 * the detail route and Join through the paths that already exist. Nothing
 * about the new opportunity is special-cased downstream.
 */
async function createOpportunity({ hostUserId, sessionId, ...input }) {
  const title = requiredText(input.title, 'Title', MAX_TITLE_LENGTH);
  const description = requiredText(input.description, 'Description', MAX_DESCRIPTION_LENGTH);

  if (!OPPORTUNITY_TYPES.includes(input.type)) {
    throw new ValidationError('Type must be either a volunteer opportunity or a charity event.');
  }

  const causeName = requiredText(input.causeName, 'Cause', MAX_TITLE_LENGTH);

  if (typeof input.date !== 'string' || !DATE_PATTERN.test(input.date.trim())) {
    throw new ValidationError('Date must be a valid date in YYYY-MM-DD format.');
  }
  if (typeof input.startTime !== 'string' || !TIME_PATTERN.test(input.startTime.trim())) {
    throw new ValidationError('Start time must be a valid time in HH:MM format.');
  }
  if (typeof input.endTime !== 'string' || !TIME_PATTERN.test(input.endTime.trim())) {
    throw new ValidationError('End time must be a valid time in HH:MM format.');
  }

  const capacity = Number(input.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
    throw new ValidationError(`Capacity must be a whole number between 1 and ${MAX_CAPACITY}.`);
  }

  // An online opportunity genuinely has no physical location, so the location
  // fields stay NULL rather than being filled with a placeholder.
  const isOnline = input.isOnline === true;
  let locationName = null;
  let city = null;
  let state = null;

  if (!isOnline) {
    locationName = requiredText(input.locationName, 'Location name', MAX_LOCATION_LENGTH);
    city = requiredText(input.city, 'City', MAX_LOCATION_LENGTH);
    state = requiredText(input.state, 'State', 2).toUpperCase();
    if (!STATE_PATTERN.test(state)) {
      throw new ValidationError('State must be a two-letter state code.');
    }
  }

  const resolved = await opportunitiesQueries.resolveOpportunityInputs({
    causeName,
    date: input.date.trim(),
    startTime: input.startTime.trim(),
    endTime: input.endTime.trim(),
  });

  if (!resolved.cause_id) {
    throw new ValidationError('Cause must be one of the causes on Kynd.');
  }
  if (resolved.ends_before_start) {
    throw new ValidationError('End time must be after the start time.');
  }
  if (resolved.starts_in_past) {
    throw new ValidationError('An opportunity must start in the future.');
  }

  const id = crypto.randomUUID();
  await opportunitiesQueries.insertOpportunity({
    id,
    hostUserId,
    title,
    opportunityType: input.type,
    causeId: resolved.cause_id,
    description,
    startsAt: resolved.starts_at,
    endsAt: resolved.ends_at,
    isOnline,
    locationName,
    city,
    state,
    capacity,
  });

  // Read it back through the ordinary session-aware detail path, so the
  // response is the same object Discover and the detail route serve — proof
  // the row is genuinely addressable, not a shape assembled from the input.
  return getOpportunityDetail(id, sessionId);
}

module.exports = {
  listOpportunities,
  getOpportunityDetail,
  createOpportunity,
  joinOpportunity,
  leaveOpportunity,
  listUpcomingForSession,
  listAwaitingConfirmationForSession,
  listSavedForSession,
  commitmentBand,
  durationMinutes,
};
