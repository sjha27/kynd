'use strict';

const opportunitiesQueries = require('../db/queries/opportunities');
const { NotFoundError } = require('../errors');

function toProductOpportunity(row) {
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

  const joined = row.joined_count;
  const available = Math.max(row.capacity - joined, 0);

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
    timing: { startsAt: row.starts_at, endsAt: row.ends_at },
    location: row.is_online
      ? { isOnline: true }
      : {
          isOnline: false,
          name: row.location_name,
          city: row.city,
          state: row.state,
        },
    capacity: row.capacity,
    participants: { joined, available },
    imageUrl: row.image_url,
  };
}

async function listOpportunities({ limit = 20, offset = 0 } = {}) {
  const rows = await opportunitiesQueries.findPublishedOpportunities({
    limit,
    offset,
  });
  return rows.map(toProductOpportunity);
}

async function getOpportunityDetail(id) {
  const row = await opportunitiesQueries.findOpportunityById(id);
  if (!row) {
    throw new NotFoundError('Opportunity not found');
  }
  return toProductOpportunity(row);
}

module.exports = { listOpportunities, getOpportunityDetail };
