const { generateWorld } = require('./generate');
const { validateWorld } = require('./lib/validate');
const { deterministicUuid } = require('./lib/ids');
const { buildOrganizationPublicImpact, localCalendarDate } = require('./lib/activities');

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

function activity(world, predicate = () => true) {
  return world.activities.find((row) => predicate(row));
}

function resetManualActivityId(row) {
  row.id = deterministicUuid('activity-manual', [
    row.userId, row.occurredOn, row.manualTitle, row.manualOrgName,
  ].join('|'));
}

function useRegistration(world, row, registrationRow) {
  const item = opportunity(world, (candidate) => candidate.id === registrationRow.opportunityId);
  row.id = deterministicUuid('activity-registration', registrationRow.id);
  row.userId = registrationRow.userId;
  row.registrationId = registrationRow.id;
  row.occurredOn = localCalendarDate(item.startsAt);
  row.hours = (new Date(item.endsAt) - new Date(item.startsAt)) / 3600000;
  row.manualTitle = null;
  row.manualCauseId = null;
  row.manualOrgId = null;
  row.manualOrgName = null;
  row.createdAt = item.endsAt;
}

function unconvertedRegistration(world, predicate = () => true) {
  const used = new Set(world.activities.filter((row) => row.registrationId)
    .map((row) => row.registrationId));
  return registration(world, (row, item) => !used.has(row.id) && predicate(row, item));
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
  ['wrong activity count', (world) => { world.activities.pop(); }],
  ['wrong Kynd-manual activity split', (world) => {
    const row = activity(world, (candidate) => candidate.registrationId === null);
    row.registrationId = UNKNOWN_UUID;
    row.manualTitle = null;
    row.manualCauseId = null;
    row.manualOrgId = null;
    row.manualOrgName = null;
    row.id = deterministicUuid('activity-registration', row.registrationId);
  }],
  ['duplicate activity ID', (world) => { world.activities[1].id = world.activities[0].id; }],
  ['activity missing user', (world) => { world.activities[0].userId = UNKNOWN_UUID; }],
  ['activity with zero hours', (world) => { world.activities[0].hours = 0; }],
  ['activity with negative hours', (world) => { world.activities[0].hours = -1; }],
  ['activity occurrence in future', (world) => { world.activities[0].occurredOn = '2026-09-01'; }],
  ['activity created after anchor', (world) => { world.activities[0].createdAt = '2026-08-31T00:00:00.000Z'; }],
  ['Kynd activity missing registration reference', (world) => {
    const row = activity(world, (candidate) => candidate.registrationId !== null);
    row.registrationId = null;
  }],
  ['Kynd activity references missing registration row', (world) => {
    const row = activity(world, (candidate) => candidate.registrationId !== null);
    row.registrationId = UNKNOWN_UUID;
    row.id = deterministicUuid('activity-registration', UNKNOWN_UUID);
  }],
  ['activity user differs from registration user', (world) => {
    const row = activity(world, (candidate) => candidate.registrationId !== null);
    row.userId = world.users.find((user) => user.id !== row.userId).id;
  }],
  ['activity references cancelled registration', (world) => {
    const row = activity(world, (candidate) => candidate.registrationId !== null);
    const cancelled = registration(world, (candidate, item) => (
      candidate.status === 'cancelled' && item.timeBucket === 'recent_past'
    ));
    useRegistration(world, row, cancelled);
  }],
  ['activity references upcoming opportunity', (world) => {
    const row = activity(world, (candidate) => candidate.registrationId !== null);
    const upcoming = unconvertedRegistration(world, (candidate, item) => (
      candidate.status === 'joined' && item.timeBucket === 'upcoming'
    ));
    useRegistration(world, row, upcoming);
  }],
  ['activity references cancelled opportunity', (world) => {
    const row = activity(world, (candidate) => candidate.registrationId !== null);
    const cancelled = registration(world, (candidate, item) => item.status === 'cancelled');
    useRegistration(world, row, cancelled);
  }],
  ['duplicate activities for registration', (world) => {
    const rows = world.activities.filter((candidate) => candidate.registrationId !== null);
    rows[1].registrationId = rows[0].registrationId;
    rows[1].id = deterministicUuid('activity-registration', rows[0].registrationId);
  }],
  ['Kynd activity containing manual title', (world) => {
    activity(world, (candidate) => candidate.registrationId !== null).manualTitle = 'Invalid title';
  }],
  ['Kynd activity containing manual cause', (world) => {
    activity(world, (candidate) => candidate.registrationId !== null).manualCauseId = world.causes[0].id;
  }],
  ['Kynd activity containing manual organization', (world) => {
    const row = activity(world, (candidate) => candidate.registrationId !== null);
    row.manualOrgId = world.organizations[0].id;
    row.manualOrgName = world.organizations[0].name;
  }],
  ['Kynd activity occurrence differs from opportunity date', (world) => {
    const row = activity(world, (candidate) => candidate.registrationId !== null);
    row.occurredOn = '2026-01-01';
  }],
  ['Kynd activity confirmed before opportunity ended', (world) => {
    const row = activity(world, (candidate) => candidate.registrationId !== null);
    const registered = world.registrations.find((candidate) => candidate.id === row.registrationId);
    const item = opportunity(world, (candidate) => candidate.id === registered.opportunityId);
    row.createdAt = new Date(new Date(item.endsAt).getTime() - 60000).toISOString();
  }],
  ['manual activity contains registration', (world) => {
    const row = activity(world, (candidate) => candidate.registrationId === null);
    row.registrationId = world.activities.find((candidate) => candidate.registrationId).registrationId;
  }],
  ['manual activity missing title', (world) => {
    activity(world, (candidate) => candidate.registrationId === null).manualTitle = null;
  }],
  ['manual activity missing cause', (world) => {
    activity(world, (candidate) => candidate.registrationId === null).manualCauseId = null;
  }],
  ['manual activity references nonexistent cause', (world) => {
    activity(world, (candidate) => candidate.registrationId === null).manualCauseId = UNKNOWN_UUID;
  }],
  ['manual activity missing organization name', (world) => {
    activity(world, (candidate) => candidate.registrationId === null).manualOrgName = null;
  }],
  ['manual activity references nonexistent organization', (world) => {
    activity(world, (candidate) => candidate.manualOrgId !== null).manualOrgId = UNKNOWN_UUID;
  }],
  ['manual activity organization snapshot mismatch', (world) => {
    activity(world, (candidate) => candidate.manualOrgId !== null).manualOrgName = 'Changed Name';
  }],
  ['manual activity occurs before user creation', (world) => {
    const row = activity(world, (candidate) => candidate.registrationId === null);
    const user = world.users.find((candidate) => candidate.id === row.userId);
    row.occurredOn = new Date(new Date(user.createdAt).getTime() - 86400000)
      .toISOString().slice(0, 10);
  }],
  ['manual activity created before occurrence', (world) => {
    const row = activity(world, (candidate) => candidate.registrationId === null);
    row.createdAt = new Date(new Date(`${row.occurredOn}T00:00:00Z`).getTime() - 60000)
      .toISOString();
  }],
  ['duplicate manual activity date for user', (world) => {
    const first = activity(world, (candidate) => candidate.registrationId === null
      && world.activities.filter((item) => item.userId === candidate.userId
        && item.registrationId === null).length > 1);
    const second = world.activities.find((candidate) => candidate !== first
      && candidate.userId === first.userId && candidate.registrationId === null);
    second.occurredOn = first.occurredOn;
    resetManualActivityId(second);
  }],
  ['wrong Maya activity total', (world) => {
    const maya = world.users.find((user) => user.displayName === 'Maya Ellis');
    const row = activity(world, (candidate) => candidate.userId === maya.id
      && candidate.registrationId === null);
    row.userId = world.users.find((user) => user.tier === 'regular' && user.id !== maya.id).id;
    resetManualActivityId(row);
  }],
  ['wrong Maya activity source split', (world) => {
    const maya = world.users.find((user) => user.displayName === 'Maya Ellis');
    const kyndRow = activity(world, (candidate) => candidate.userId === maya.id
      && candidate.registrationId !== null);
    const replacement = unconvertedRegistration(world, (candidate, item) => (
      world.users.find((user) => user.id === candidate.userId).tier === 'regular'
      && candidate.userId !== maya.id && candidate.status === 'joined'
      && item.timeBucket === 'recent_past'
    ));
    useRegistration(world, kyndRow, replacement);
    const manualRow = activity(world, (candidate) => candidate.userId !== maya.id
      && candidate.registrationId === null
      && world.users.find((user) => user.id === candidate.userId).tier === 'regular');
    manualRow.userId = maya.id;
    resetManualActivityId(manualRow);
  }],
  ['wrong David activity total', (world) => {
    const david = world.users.find((user) => user.displayName === 'David Mercer');
    const row = activity(world, (candidate) => candidate.userId === david.id
      && candidate.registrationId === null);
    row.userId = world.users.find((user) => user.tier === 'connector' && user.id !== david.id).id;
    resetManualActivityId(row);
  }],
  ['wrong David activity source split', (world) => {
    const david = world.users.find((user) => user.displayName === 'David Mercer');
    const kyndRow = activity(world, (candidate) => candidate.userId === david.id
      && candidate.registrationId !== null);
    const replacement = unconvertedRegistration(world, (candidate, item) => (
      world.users.find((user) => user.id === candidate.userId).tier === 'connector'
      && candidate.userId !== david.id && candidate.status === 'joined'
      && item.timeBucket === 'recent_past'
    ));
    useRegistration(world, kyndRow, replacement);
    const manualRow = activity(world, (candidate) => candidate.userId !== david.id
      && candidate.registrationId === null
      && world.users.find((user) => user.id === candidate.userId).tier === 'connector');
    manualRow.userId = david.id;
    resetManualActivityId(manualRow);
  }],
];

const INTEGRITY_CHECKS = [
  ['manual linked activity excluded from public organization impact', (world) => {
    const before = JSON.stringify([...buildOrganizationPublicImpact(world)]);
    const row = activity(world, (candidate) => candidate.registrationId === null
      && candidate.manualOrgId !== null);
    row.hours += 0.5;
    const after = JSON.stringify([...buildOrganizationPublicImpact(world)]);
    return validateWorld(world) && before === after;
  }],
];

function runMutationValidation() {
  const baseline = generateWorld();
  const failures = [];
  const integrityFailures = [];

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

  for (const [name, check] of INTEGRITY_CHECKS) {
    const world = structuredClone(baseline);
    try {
      if (!check(world)) integrityFailures.push(name);
    } catch {
      integrityFailures.push(name);
    }
  }

  const result = {
    baselineValid: validateWorld(baseline),
    invalidCasesRun: MUTATIONS.length,
    invalidCasesRejected: MUTATIONS.length - failures.length,
    failures,
    integrityCasesRun: INTEGRITY_CHECKS.length,
    integrityCasesPassed: INTEGRITY_CHECKS.length - integrityFailures.length,
    integrityFailures,
  };

  if (failures.length || integrityFailures.length) {
    throw new Error([
      failures.length ? `accepted invalid cases: ${failures.join(', ')}` : null,
      integrityFailures.length ? `failed integrity cases: ${integrityFailures.join(', ')}` : null,
    ].filter(Boolean).join('; '));
  }

  return result;
}

if (require.main === module) {
  console.log(JSON.stringify(runMutationValidation(), null, 2));
}

module.exports = { MUTATIONS, INTEGRITY_CHECKS, runMutationValidation };
