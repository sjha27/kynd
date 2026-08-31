const CONFIG = require('../config');
const { deterministicUuid } = require('./ids');

const UUID_V5_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VALID_STATUSES = new Set(['joined', 'cancelled']);

function assert(condition, message) {
  if (!condition) throw new Error(`Seed validation failed: ${message}`);
}

function timestamp(label, value) {
  const result = new Date(value).getTime();
  assert(Number.isFinite(result), `${label} has invalid timestamp: ${value}`);
  return result;
}

function overlaps(first, second) {
  return timestamp('opportunity start', first.startsAt) < timestamp('opportunity end', second.endsAt)
    && timestamp('opportunity start', second.startsAt) < timestamp('opportunity end', first.endsAt);
}

function validateRegistrationCounts(registrations, opportunityById) {
  const targets = CONFIG.participationTargets.registrations;
  const keys = {
    recent_past: 'recentPast', upcoming: 'upcoming',
    farther_future: 'fartherFuture', cancelled: 'cancelled',
  };
  assert(registrations.length === CONFIG.counts.registrations,
    `registration count is ${registrations.length}; expected ${CONFIG.counts.registrations}`);
  assert(registrations.filter((row) => row.status === 'joined').length === 6250,
    'joined registration count must be 6250');
  assert(registrations.filter((row) => row.status === 'cancelled').length === 750,
    'cancelled registration count must be 750');
  for (const [bucket, key] of Object.entries(keys)) {
    for (const status of VALID_STATUSES) {
      const actual = registrations.filter((row) => (
        row.status === status && opportunityById.get(row.opportunityId)?.timeBucket === bucket
      )).length;
      assert(actual === targets[key][status],
        `${bucket} ${status} registration count is ${actual}; expected ${targets[key][status]}`);
    }
  }
}

function validateParticipation(world) {
  const users = new Map(world.users.map((user) => [user.id, user]));
  const opportunities = new Map(world.opportunities.map((item) => [item.id, item]));
  const anchor = timestamp('configured anchor', CONFIG.anchorDate);
  validateRegistrationCounts(world.registrations, opportunities);

  const ids = new Set();
  const pairs = new Set();
  const joinedByOpportunity = new Map(world.opportunities.map((item) => [item.id, []]));
  const joinedByUser = new Map(world.users.map((user) => [user.id, []]));

  for (const row of world.registrations) {
    assert(UUID_V5_PATTERN.test(row.id), `registration has invalid UUIDv5: ${row.id}`);
    assert(row.id === deterministicUuid('registration', `${row.userId}|${row.opportunityId}`),
      `registration ID is not deterministic for ${row.userId}|${row.opportunityId}`);
    assert(!ids.has(row.id), `duplicate registration ID: ${row.id}`);
    ids.add(row.id);
    const pair = `${row.userId}|${row.opportunityId}`;
    assert(!pairs.has(pair), `duplicate registration relationship: ${pair}`);
    pairs.add(pair);

    const user = users.get(row.userId);
    const opportunity = opportunities.get(row.opportunityId);
    assert(user, `registration references missing user: ${row.userId}`);
    assert(opportunity, `registration references missing opportunity: ${row.opportunityId}`);
    assert(opportunity.hostUserId !== row.userId,
      `user ${row.userId} is registered for their own opportunity ${row.opportunityId}`);
    assert(VALID_STATUSES.has(row.status), `registration ${row.id} has invalid status`);

    const joinedAt = timestamp(`${row.id} joinedAt`, row.joinedAt);
    const startsAt = timestamp(`${row.id} opportunity start`, opportunity.startsAt);
    assert(joinedAt >= timestamp(`${row.id} user creation`, user.createdAt),
      `registration ${row.id} predates user creation`);
    assert(joinedAt >= timestamp(`${row.id} opportunity creation`, opportunity.createdAt),
      `registration ${row.id} predates opportunity creation`);
    assert(joinedAt < startsAt, `registration ${row.id} was joined after opportunity start`);
    assert(joinedAt <= anchor, `registration ${row.id} was joined after anchor snapshot`);

    if (row.status === 'joined') {
      assert(row.cancelledAt === null, `joined registration ${row.id} has cancelledAt`);
      assert(opportunity.status === 'published',
        `joined registration ${row.id} belongs to cancelled opportunity`);
      joinedByOpportunity.get(opportunity.id).push(row);
      joinedByUser.get(user.id).push(opportunity);
    } else {
      assert(row.cancelledAt !== null, `cancelled registration ${row.id} lacks cancelledAt`);
      const cancelledAt = timestamp(`${row.id} cancelledAt`, row.cancelledAt);
      assert(cancelledAt >= joinedAt, `registration ${row.id} was cancelled before it was joined`);
      assert(cancelledAt < startsAt, `registration ${row.id} was cancelled after opportunity start`);
      assert(cancelledAt <= anchor, `registration ${row.id} was cancelled after anchor snapshot`);
    }
  }

  for (const opportunity of world.opportunities) {
    const joined = joinedByOpportunity.get(opportunity.id);
    assert(joined.length <= opportunity.capacity,
      `${opportunity.id} has ${joined.length} joined participants; capacity is ${opportunity.capacity}`);
    if (opportunity.status === 'cancelled') {
      assert(joined.length === 0, `${opportunity.id} is cancelled but has active joined participants`);
    }
  }
  for (const [userId, items] of joinedByUser) {
    const ordered = [...items].sort((first, second) => (
      timestamp('opportunity start', first.startsAt) - timestamp('opportunity start', second.startsAt)
    ));
    for (let index = 1; index < ordered.length; index += 1) {
      assert(!overlaps(ordered[index - 1], ordered[index]),
        `user ${userId} has overlapping joined opportunities ${ordered[index - 1].id} and ${ordered[index].id}`);
    }
  }

  const maya = world.users.find((user) => user.displayName === 'Maya Ellis');
  const flagship = world.opportunities.find((item) => item.flagship);
  const flagshipRows = joinedByOpportunity.get(flagship.id);
  assert(flagshipRows.length === CONFIG.participationTargets.flagshipJoined,
    `flagship active participant count is ${flagshipRows.length}; expected 5`);
  assert(flagshipRows.some((row) => row.userId === maya.id), 'Maya is not joined to the flagship');
  assert(flagship.capacity - flagshipRows.length === 20, 'flagship must derive 20 available spots');
  assert(!Object.hasOwn(flagship, 'participantCount'), 'flagship fabricates participant count');

  assert(world.savedOpportunities.length === CONFIG.participationTargets.savedOpportunities,
    `saved opportunity count is ${world.savedOpportunities.length}; expected 2000`);
  const savePairs = new Set();
  for (const row of world.savedOpportunities) {
    const pair = `${row.userId}|${row.opportunityId}`;
    assert(!savePairs.has(pair), `duplicate saved opportunity relationship: ${pair}`);
    savePairs.add(pair);
    const user = users.get(row.userId);
    const opportunity = opportunities.get(row.opportunityId);
    assert(user, `saved opportunity references missing user: ${row.userId}`);
    assert(opportunity, `saved opportunity references missing opportunity: ${row.opportunityId}`);
    assert(opportunity.status === 'published'
      && ['upcoming', 'farther_future'].includes(opportunity.timeBucket),
    `saved opportunity ${pair} is not published future inventory`);
    assert(!pairs.has(pair), `user has both saved and registered relationship: ${pair}`);
    const savedAt = timestamp(`${pair} savedAt`, row.savedAt);
    assert(savedAt >= timestamp(`${pair} user creation`, user.createdAt),
      `saved opportunity ${pair} predates user creation`);
    assert(savedAt >= timestamp(`${pair} opportunity creation`, opportunity.createdAt),
      `saved opportunity ${pair} predates opportunity creation`);
    assert(savedAt <= anchor, `saved opportunity ${pair} is after anchor snapshot`);
    assert(savedAt < timestamp(`${pair} opportunity start`, opportunity.startsAt),
      `saved opportunity ${pair} is after opportunity start`);
  }
  return true;
}

module.exports = { validateParticipation };
