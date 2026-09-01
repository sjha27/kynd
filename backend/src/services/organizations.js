'use strict';

const organizationsQueries = require('../db/queries/organizations');
const { NotFoundError } = require('../errors');

function toProductOpportunitySummary(row) {
  const joined = row.joined_count;
  return {
    id: row.id,
    title: row.title,
    type: row.opportunity_type,
    startsAt: row.starts_at,
    capacity: row.capacity,
    participants: { joined, available: Math.max(row.capacity - joined, 0) },
  };
}

function toProductFundraiserSummary(row) {
  return {
    id: row.id,
    title: row.title,
    goalAmountCents: Number(row.goal_amount_cents),
    raisedAmountCents: Number(row.raised_cents),
    supporterCount: row.supporter_count,
    endDate: row.end_date,
  };
}

async function getOrganizationDetail(id) {
  const org = await organizationsQueries.findOrganizationById(id);
  if (!org) {
    throw new NotFoundError('Organization not found');
  }

  const [causes, followerCount, upcomingOpportunities, fundraisers] =
    await Promise.all([
      organizationsQueries.findOrganizationCauses(id),
      organizationsQueries.countFollowers(id),
      organizationsQueries.findUpcomingOpportunities(id),
      organizationsQueries.findActiveFundraisers(id),
    ]);

  return {
    id: org.id,
    name: org.name,
    mission: org.mission,
    logoUrl: org.logo_url,
    city: org.city,
    state: org.state,
    verified: org.is_verified_demo,
    causes,
    followerCount,
    upcomingOpportunities: upcomingOpportunities.map(
      toProductOpportunitySummary
    ),
    fundraisers: fundraisers.map(toProductFundraiserSummary),
  };
}

module.exports = { getOrganizationDetail };
