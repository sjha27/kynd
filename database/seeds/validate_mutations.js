const { generateWorld } = require('./generate');
const { validateWorld } = require('./lib/validate');
const { deterministicUuid } = require('./lib/ids');

const UNKNOWN_UUID = '00000000-0000-5000-8000-000000000000';

function opportunity(world, predicate = () => true) {
  return world.opportunities.find(predicate);
}

function registration(world, predicate = () => true) {
  return world.registrations.find((row) => predicate(
    row, world.opportunities.find((item) => item.id === row.opportunityId)
  ));
}

function save(world, predicate = () => true) {
  return world.savedOpportunities.find((row) => predicate(
    row, world.opportunities.find((item) => item.id === row.opportunityId)
  ));
}

function resetRegistrationId(row) {
  row.id = deterministicUuid('registration', `${row.userId}|${row.opportunityId}`);
}

const MUTATIONS = [
  ['duplicate user follow', (world) => { world.userFollows[1] = { ...world.userFollows[0] }; }],
  ['self-follow', (world) => { world.userFollows[0].followedUserId = world.userFollows[0].followerUserId; }],
  ['missing social user reference', (world) => { world.userFollows[0].followedUserId = UNKNOWN_UUID; }],
  ['future social timestamp', (world) => { world.organizationFollows[0].createdAt = '2027-01-01T00:00:00.000Z'; }],
  ['duplicate opportunity ID', (world) => { world.opportunities[1].id = world.opportunities[0].id; }],
  ['missing opportunity cause', (world) => { world.opportunities[0].causeId = UNKNOWN_UUID; }],
  ['missing opportunity host', (world) => {
    const item = opportunity(world, (candidate) => candidate.hostOrganizationId);
    item.hostOrganizationId = UNKNOWN_UUID;
  }],
  ['both opportunity hosts', (world) => {
    const item = opportunity(world, (candidate) => candidate.hostOrganizationId);
    item.hostUserId = world.users[0].id;
  }],
  ['no opportunity host', (world) => {
    const item = world.opportunities[0];
    item.hostUserId = null;
    item.hostOrganizationId = null;
  }],
  ['host-cause mismatch', (world) => {
    const item = opportunity(world, (candidate) => candidate.hostOrganizationId);
    const host = world.organizations.find((candidate) => candidate.id === item.hostOrganizationId);
    item.causeId = world.causes.find((cause) => !host.causes.includes(cause.name)).id;
  }],
  ['invalid opportunity type', (world) => { world.opportunities[0].opportunityType = 'fundraiser'; }],
  ['invalid opportunity status', (world) => { world.opportunities[0].status = 'draft'; }],
  ['zero capacity', (world) => { world.opportunities[0].capacity = 0; }],
  ['end before start', (world) => {
    const item = world.opportunities[0];
    item.endsAt = new Date(new Date(item.startsAt).getTime() - 60000).toISOString();
  }],
  ['created before host existed', (world) => { world.opportunities[0].createdAt = '2000-01-01T00:00:00.000Z'; }],
  ['created after anchor snapshot', (world) => { world.opportunities[0].createdAt = '2026-08-31T00:00:00.000Z'; }],
  ['upcoming event placed in past', (world) => {
    const item = opportunity(world, (candidate) => candidate.timeBucket === 'upcoming' && !candidate.anchor);
    item.startsAt = '2026-08-29T14:00:00.000Z';
    item.endsAt = '2026-08-29T16:00:00.000Z';
  }],
  ['recent-past event placed in future', (world) => {
    const item = opportunity(world, (candidate) => candidate.timeBucket === 'recent_past');
    item.startsAt = '2026-09-02T14:00:00.000Z';
    item.endsAt = '2026-09-02T16:00:00.000Z';
  }],
  ['invalid online location shape', (world) => {
    const item = opportunity(world, (candidate) => candidate.isOnline);
    item.locationName = 'Fake Online Venue';
  }],
  ['invalid physical location shape', (world) => {
    const item = opportunity(world, (candidate) => !candidate.isOnline);
    item.locationName = null;
  }],
  ['incomplete coordinate pair', (world) => {
    const item = opportunity(world, (candidate) => !candidate.isOnline);
    item.longitude = null;
  }],
  ['coordinate out of range', (world) => {
    const item = opportunity(world, (candidate) => !candidate.isOnline);
    item.latitude = 100;
  }],
  ['missing flagship opportunity', (world) => {
    opportunity(world, (candidate) => candidate.flagship).flagship = false;
  }],
  ['changed flagship scheduled start', (world) => {
    const flagship = opportunity(world, (candidate) => candidate.flagship);
    flagship.startsAt = new Date(
      new Date(flagship.startsAt).getTime() + 60 * 60 * 1000
    ).toISOString();
    flagship.endsAt = new Date(
      new Date(flagship.endsAt).getTime() + 60 * 60 * 1000
    ).toISOString();
  }],
  ['wrong registration count', (world) => { world.registrations.pop(); }],
  ['duplicate registration ID', (world) => { world.registrations[1].id = world.registrations[0].id; }],
  ['duplicate user-opportunity registration', (world) => {
    world.registrations[1] = { ...world.registrations[0] };
  }],
  ['registration missing user reference', (world) => {
    world.registrations[0].userId = UNKNOWN_UUID;
    resetRegistrationId(world.registrations[0]);
  }],
  ['registration missing opportunity reference', (world) => {
    world.registrations[0].opportunityId = UNKNOWN_UUID;
    resetRegistrationId(world.registrations[0]);
  }],
  ['user registered for own hosted opportunity', (world) => {
    const item = opportunity(world, (candidate) => candidate.hostUserId
      && world.registrations.some((row) => row.opportunityId === candidate.id));
    const row = registration(world, (candidate) => candidate.opportunityId === item.id);
    row.userId = item.hostUserId;
    resetRegistrationId(row);
  }],
  ['invalid registration status', (world) => { world.registrations[0].status = 'waitlisted'; }],
  ['joined registration with cancelledAt', (world) => {
    const row = registration(world, (candidate) => candidate.status === 'joined');
    row.cancelledAt = row.joinedAt;
  }],
  ['cancelled registration without cancelledAt', (world) => {
    registration(world, (candidate) => candidate.status === 'cancelled').cancelledAt = null;
  }],
  ['registration cancelled before joined', (world) => {
    const row = registration(world, (candidate) => candidate.status === 'cancelled');
    row.cancelledAt = new Date(new Date(row.joinedAt).getTime() - 60000).toISOString();
  }],
  ['registration joined before user existed', (world) => {
    const row = world.registrations[0];
    const user = world.users.find((candidate) => candidate.id === row.userId);
    row.joinedAt = new Date(new Date(user.createdAt).getTime() - 60000).toISOString();
  }],
  ['registration joined before opportunity existed', (world) => {
    const row = world.registrations[0];
    const item = opportunity(world, (candidate) => candidate.id === row.opportunityId);
    row.joinedAt = new Date(new Date(item.createdAt).getTime() - 60000).toISOString();
  }],
  ['registration joined after opportunity started', (world) => {
    const row = world.registrations[0];
    const item = opportunity(world, (candidate) => candidate.id === row.opportunityId);
    row.joinedAt = item.startsAt;
  }],
  ['registration joined after anchor snapshot', (world) => {
    const row = registration(world, (candidate, item) => (
      new Date(item.startsAt) > new Date('2026-09-01T00:00:00.000Z')
    ));
    row.joinedAt = '2026-08-31T12:00:00.000Z';
  }],
  ['registration cancelled after opportunity starts', (world) => {
    const row = registration(world, (candidate) => candidate.status === 'cancelled');
    const item = opportunity(world, (candidate) => candidate.id === row.opportunityId);
    row.cancelledAt = item.startsAt;
  }],
  ['active joined exceeds capacity', (world) => {
    const full = opportunity(world, (candidate) => candidate.timeBucket === 'upcoming'
      && world.registrations.filter((row) => row.opportunityId === candidate.id && row.status === 'joined').length === candidate.capacity);
    const existing = new Set(world.registrations.filter((row) => row.opportunityId === full.id).map((row) => row.userId));
    const row = registration(world, (candidate, item) => candidate.status === 'joined'
      && item.timeBucket === 'upcoming' && !existing.has(candidate.userId));
    row.opportunityId = full.id;
    resetRegistrationId(row);
  }],
  ['joined registration on cancelled opportunity', (world) => {
    const cancelled = opportunity(world, (candidate) => candidate.status === 'cancelled');
    const existing = new Set(world.registrations.filter((row) => row.opportunityId === cancelled.id).map((row) => row.userId));
    const row = registration(world, (candidate) => candidate.status === 'joined' && !existing.has(candidate.userId));
    row.opportunityId = cancelled.id;
    resetRegistrationId(row);
  }],
  ['overlapping joined opportunities', (world) => {
    let selected;
    for (const user of world.users) {
      const rows = world.registrations.filter((row) => row.userId === user.id && row.status === 'joined');
      for (const first of rows) {
        const firstItem = opportunity(world, (candidate) => candidate.id === first.opportunityId);
        const second = rows.find((row) => {
          const item = opportunity(world, (candidate) => candidate.id === row.opportunityId);
          return row !== first && !item.anchor && item.timeBucket === firstItem.timeBucket
            && new Date(item.createdAt) < new Date(firstItem.startsAt);
        });
        if (second) { selected = { firstItem, second }; break; }
      }
      if (selected) break;
    }
    const item = opportunity(world, (candidate) => candidate.id === selected.second.opportunityId);
    const duration = new Date(item.endsAt) - new Date(item.startsAt);
    item.startsAt = selected.firstItem.startsAt;
    item.endsAt = new Date(new Date(item.startsAt).getTime() + duration).toISOString();
  }],
  ['missing Maya flagship registration', (world) => {
    const maya = world.users.find((user) => user.displayName === 'Maya Ellis');
    const flagship = opportunity(world, (item) => item.flagship);
    const row = registration(world, (candidate) => candidate.userId === maya.id
      && candidate.opportunityId === flagship.id);
    const existing = new Set(world.registrations.filter((candidate) => candidate.opportunityId === flagship.id).map((candidate) => candidate.userId));
    row.userId = world.users.find((user) => !existing.has(user.id) && user.id !== flagship.hostUserId).id;
    resetRegistrationId(row);
  }],
  ['incorrect flagship active participant count', (world) => {
    const flagship = opportunity(world, (item) => item.flagship);
    const existing = new Set(world.registrations.filter((row) => row.opportunityId === flagship.id).map((row) => row.userId));
    const row = registration(world, (candidate, item) => candidate.status === 'joined'
      && item.timeBucket === 'upcoming' && !existing.has(candidate.userId));
    row.opportunityId = flagship.id;
    resetRegistrationId(row);
  }],
  ['wrong save count', (world) => { world.savedOpportunities.pop(); }],
  ['duplicate save relationship', (world) => { world.savedOpportunities[1] = { ...world.savedOpportunities[0] }; }],
  ['save missing user reference', (world) => { world.savedOpportunities[0].userId = UNKNOWN_UUID; }],
  ['save missing opportunity reference', (world) => { world.savedOpportunities[0].opportunityId = UNKNOWN_UUID; }],
  ['save on recent-past opportunity', (world) => {
    world.savedOpportunities[0].opportunityId = opportunity(world, (item) => item.timeBucket === 'recent_past').id;
  }],
  ['save on cancelled opportunity', (world) => {
    world.savedOpportunities[0].opportunityId = opportunity(world, (item) => item.timeBucket === 'cancelled').id;
  }],
  ['save on registered opportunity', (world) => {
    const row = world.savedOpportunities[0];
    const registered = registration(world, (candidate) => candidate.userId === row.userId);
    row.opportunityId = registered.opportunityId;
  }],
  ['save before user existed', (world) => {
    const row = world.savedOpportunities[0];
    const user = world.users.find((candidate) => candidate.id === row.userId);
    row.savedAt = new Date(new Date(user.createdAt).getTime() - 60000).toISOString();
  }],
  ['save before opportunity existed', (world) => {
    const row = world.savedOpportunities[0];
    const item = opportunity(world, (candidate) => candidate.id === row.opportunityId);
    row.savedAt = new Date(new Date(item.createdAt).getTime() - 60000).toISOString();
  }],
  ['save after anchor snapshot', (world) => {
    const row = save(world, (candidate, item) => new Date(item.startsAt) > new Date('2026-09-01T00:00:00.000Z'));
    row.savedAt = '2026-08-31T12:00:00.000Z';
  }],
  ['save after opportunity starts', (world) => {
    const row = world.savedOpportunities[0];
    const item = opportunity(world, (candidate) => candidate.id === row.opportunityId);
    row.savedAt = item.startsAt;
  }],
];

function runMutationValidation() {
  const baseline = generateWorld();
  const failures = [];

  for (const [name, mutate] of MUTATIONS) {
    const world = structuredClone(baseline);
    mutate(world);
    try {
      validateWorld(world);
      failures.push(name);
    } catch {
      // Expected: every mutation must make the world invalid.
    }
  }

  const result = {
    baselineValid: validateWorld(baseline),
    invalidCasesRun: MUTATIONS.length,
    invalidCasesRejected: MUTATIONS.length - failures.length,
    failures,
  };

  if (failures.length) {
    throw new Error(`Mutation validation accepted invalid cases: ${failures.join(', ')}`);
  }

  return result;
}

if (require.main === module) {
  console.log(JSON.stringify(runMutationValidation(), null, 2));
}

module.exports = { MUTATIONS, runMutationValidation };
