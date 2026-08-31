const { generateWorld } = require('./generate');
const { validateWorld } = require('./lib/validate');

const UNKNOWN_UUID = '00000000-0000-5000-8000-000000000000';

function opportunity(world, predicate = () => true) {
  return world.opportunities.find(predicate);
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
