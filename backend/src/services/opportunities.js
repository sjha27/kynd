'use strict';

const opportunitiesQueries = require('../db/queries/opportunities');
const { NotFoundError, ConflictError } = require('../errors');
const { COMMITMENT_BANDS } = require('../lib/discovery');

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

module.exports = {
  listOpportunities,
  getOpportunityDetail,
  joinOpportunity,
  listUpcomingForSession,
  commitmentBand,
  durationMinutes,
};
