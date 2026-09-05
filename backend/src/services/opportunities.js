'use strict';

const opportunitiesQueries = require('../db/queries/opportunities');
const { NotFoundError } = require('../errors');
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

async function listOpportunities({ limit = 20, offset = 0, ...filters } = {}) {
  const { rows, total } = await opportunitiesQueries.searchOpportunities({
    limit,
    offset,
    ...filters,
  });

  const previews = await opportunitiesQueries.findAttendeePreviewsFor(
    rows.map((row) => row.id),
    CARD_ATTENDEE_PREVIEW
  );

  return {
    opportunities: rows.map((row) =>
      toProductOpportunity(row, { attendees: previews.get(row.id) || [] })
    ),
    total,
  };
}

async function getOpportunityDetail(id) {
  const row = await opportunitiesQueries.findOpportunityById(id);
  if (!row) {
    throw new NotFoundError('Opportunity not found');
  }
  const attendees = await opportunitiesQueries.findAttendeePreview(
    id,
    DETAIL_ATTENDEE_PREVIEW
  );
  return toProductOpportunity(row, { attendees });
}

module.exports = {
  listOpportunities,
  getOpportunityDetail,
  commitmentBand,
  durationMinutes,
};
