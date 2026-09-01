const CONFIG = require('./config');
const { generateWorld } = require('./generate');
const { validateWorld } = require('./lib/validate');
const { deterministicUuid } = require('./lib/ids');
const { buildOrganizationPublicImpact, localCalendarDate } = require('./lib/activities');
const {
  deriveAmountRaisedByUser,
  deriveFundraiserProgress,
  easternTimestamp,
} = require('./lib/fundraisers');
const { deriveProfileMetrics } = require('./lib/activities');
const { ANCHOR_COMMENTS } = require('./data/social');
const { CITY_CENTROIDS, userOpportunityMiles } = require('./lib/geography');

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

function fundraiser(world, predicate = () => true) {
  return world.fundraisers.find((row) => predicate(row));
}

function fundraiserSupport(world, predicate = () => true) {
  return world.fundraiserSupports.find((row) => predicate(
    row, world.fundraisers.find((item) => item.id === row.fundraiserId)
  ));
}

function reaction(world, predicate = () => true) {
  return world.reactions.find((row) => predicate(row));
}

function comment(world, predicate = () => true) {
  return world.comments.find((row) => predicate(row));
}

function socialTargetId(row) {
  return row.activityId || row.opportunityId || row.fundraiserId;
}

function socialTargetType(row) {
  return row.activityId ? 'activity' : row.opportunityId ? 'opportunity' : 'fundraiser';
}

function resetReactionId(row) {
  row.id = deterministicUuid(
    'reaction', `${row.userId}|${socialTargetType(row)}|${socialTargetId(row)}`
  );
}

function resetCommentId(row) {
  row.id = deterministicUuid(
    'comment', `${row.userId}|${socialTargetType(row)}|${socialTargetId(row)}`
  );
}

function retargetSocialRow(row, key, id) {
  row.activityId = null;
  row.opportunityId = null;
  row.fundraiserId = null;
  row[key] = id;
}

function resetFundraiserId(row) {
  row.id = deterministicUuid('fundraiser', [
    row.creatorUserId || row.creatorOrganizationId,
    row.beneficiaryName, row.title, row.createdAt,
  ].join('|'));
}

function resetFundraiserSupportId(row) {
  row.id = deterministicUuid('fundraiser-support', `${row.userId}|${row.fundraiserId}`);
}

function resetManualActivityId(row) {
  row.id = deterministicUuid('activity-manual', [
    row.userId, row.occurredOn, row.manualTitle, row.manualOrgName,
  ].join('|'));
}

function renameManualActivity(world, row, title) {
  const priorId = row.id;
  row.manualTitle = title;
  resetManualActivityId(row);
  for (const socialRow of [...world.reactions, ...world.comments]) {
    if (socialRow.activityId !== priorId) continue;
    socialRow.activityId = row.id;
    if (socialRow.body === undefined) resetReactionId(socialRow);
    else resetCommentId(socialRow);
  }
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
  ['wrong fundraiser count', (world) => { world.fundraisers.pop(); }],
  ['wrong fundraiser creator split', (world) => {
    const row = fundraiser(world, (item) => item.creatorUserId && !item.title.startsWith('100 Meal'));
    const creator = world.organizations.find((item) => item.causes.some(
      (name) => world.causes.find((cause) => cause.id === row.causeId).name === name
    ));
    row.creatorUserId = null;
    row.creatorOrganizationId = creator.id;
    resetFundraiserId(row);
  }],
  ['wrong fundraiser lifecycle totals', (world) => {
    const row = fundraiser(world, (item) => item.status === 'active'
      && item.endDate >= '2026-08-30' && !item.title.includes('Waterways'));
    row.endDate = '2026-08-29';
  }],
  ['wrong fundraiser beneficiary split', (world) => {
    const row = fundraiser(world, (item) => item.beneficiaryOrganizationId
      && item.creatorUserId && !item.title.startsWith('100 Meal'));
    const cause = world.causes.find((item) => item.id === row.causeId).name;
    const external = require('./data/fundraisers').EXTERNAL_FUNDRAISER_BENEFICIARIES
      .find((item) => item.cause === cause);
    row.beneficiaryOrganizationId = null;
    row.beneficiaryName = external.name;
    resetFundraiserId(row);
  }],
  ['duplicate fundraiser ID', (world) => { world.fundraisers[5].id = world.fundraisers[4].id; }],
  ['invalid fundraiser UUID', (world) => { world.fundraisers[4].id = 'not-a-uuid'; }],
  ['both fundraiser creators', (world) => {
    fundraiser(world, (item) => item.creatorUserId).creatorOrganizationId = world.organizations[0].id;
  }],
  ['neither fundraiser creator', (world) => {
    const row = world.fundraisers[4];
    row.creatorUserId = null;
    row.creatorOrganizationId = null;
  }],
  ['fundraiser missing user creator', (world) => {
    const row = fundraiser(world, (item) => item.creatorUserId && !item.title.startsWith('100 Meal'));
    row.creatorUserId = UNKNOWN_UUID;
    resetFundraiserId(row);
  }],
  ['fundraiser missing organization creator', (world) => {
    const row = fundraiser(world, (item) => item.creatorOrganizationId && !item.title.includes('Waterways'));
    row.creatorOrganizationId = UNKNOWN_UUID;
    resetFundraiserId(row);
  }],
  ['fundraiser created before creator existed', (world) => {
    const row = fundraiser(world, (item) => !['100 Meal Boxes for Atlanta Families', 'Roswell Veterans Resource Day Fund', "Keep Atlanta's Waterways Clean This Fall", 'Summer Meal Box Fund'].includes(item.title));
    const creator = row.creatorUserId
      ? world.users.find((item) => item.id === row.creatorUserId)
      : world.organizations.find((item) => item.id === row.creatorOrganizationId);
    row.createdAt = new Date(new Date(creator.createdAt).getTime() - 60000).toISOString();
    resetFundraiserId(row);
  }],
  ['fundraiser invalid cause', (world) => { world.fundraisers[4].causeId = UNKNOWN_UUID; }],
  ['fundraiser creator-cause mismatch', (world) => {
    const row = fundraiser(world, (item) => item.creatorUserId && !item.title.startsWith('100 Meal'));
    const creator = world.users.find((item) => item.id === row.creatorUserId);
    row.causeId = world.causes.find((item) => !creator.causes.includes(item.name)).id;
  }],
  ['fundraiser invalid status', (world) => { world.fundraisers[4].status = 'ended'; }],
  ['fundraiser blank title', (world) => { world.fundraisers[4].title = ' '; }],
  ['fundraiser blank story', (world) => { world.fundraisers[4].story = ''; }],
  ['fundraiser zero goal', (world) => { world.fundraisers[4].goalAmountCents = 0; }],
  ['fundraiser negative goal', (world) => { world.fundraisers[4].goalAmountCents = -500; }],
  ['fundraiser implausible goal', (world) => { world.fundraisers[4].goalAmountCents = 100000000; }],
  ['fundraiser created after anchor', (world) => {
    const row = world.fundraisers[4];
    row.createdAt = '2026-08-31T00:00:00.000Z';
    resetFundraiserId(row);
  }],
  ['fundraiser end before creation date', (world) => {
    const row = fundraiser(world, (item) => !item.title.startsWith('100 Meal'));
    row.endDate = new Date(new Date(row.createdAt).getTime() - 86400000).toISOString().slice(0, 10);
  }],
  ['fundraiser blank beneficiary name', (world) => { world.fundraisers[4].beneficiaryName = ' '; }],
  ['fundraiser linked beneficiary missing', (world) => {
    fundraiser(world, (item) => item.beneficiaryOrganizationId).beneficiaryOrganizationId = UNKNOWN_UUID;
  }],
  ['fundraiser beneficiary snapshot mismatch', (world) => {
    fundraiser(world, (item) => item.beneficiaryOrganizationId).beneficiaryName = 'Changed Beneficiary';
  }],
  ['fundraiser beneficiary-cause mismatch', (world) => {
    const row = fundraiser(world, (item) => item.beneficiaryOrganizationId
      && !item.title.startsWith('100 Meal'));
    const beneficiary = world.organizations.find((item) => item.id === row.beneficiaryOrganizationId);
    row.causeId = world.causes.find((item) => !beneficiary.causes.includes(item.name)).id;
  }],
  ['fundraiser unknown external beneficiary', (world) => {
    const row = fundraiser(world, (item) => !item.beneficiaryOrganizationId);
    row.beneficiaryName = 'Unknown External Charity';
    resetFundraiserId(row);
  }],
  ['fundraiser created before linked beneficiary existed', (world) => {
    const row = fundraiser(world, (item) => item.beneficiaryOrganizationId
      && !['100 Meal Boxes for Atlanta Families', 'Roswell Veterans Resource Day Fund', "Keep Atlanta's Waterways Clean This Fall", 'Summer Meal Box Fund'].includes(item.title));
    const beneficiary = world.organizations.find((item) => item.id === row.beneficiaryOrganizationId);
    row.createdAt = new Date(new Date(beneficiary.createdAt).getTime() - 60000).toISOString();
    resetFundraiserId(row);
  }],
  ['fundraiser fabricated amount raised', (world) => { world.fundraisers[4].amountRaised = 100; }],
  ['fundraiser fabricated supporter count', (world) => { world.fundraisers[4].supporterCount = 3; }],
  ['fundraiser fabricated progress', (world) => { world.fundraisers[4].progress = 0.5; }],
  ['wrong fundraiser support count', (world) => { world.fundraiserSupports.pop(); }],
  ['duplicate fundraiser support ID', (world) => {
    world.fundraiserSupports[1].id = world.fundraiserSupports[0].id;
  }],
  ['duplicate user-fundraiser support', (world) => {
    world.fundraiserSupports[1] = { ...world.fundraiserSupports[0] };
  }],
  ['fundraiser support missing user', (world) => {
    world.fundraiserSupports[0].userId = UNKNOWN_UUID;
    resetFundraiserSupportId(world.fundraiserSupports[0]);
  }],
  ['fundraiser support missing fundraiser', (world) => {
    world.fundraiserSupports[0].fundraiserId = UNKNOWN_UUID;
    resetFundraiserSupportId(world.fundraiserSupports[0]);
  }],
  ['fundraiser support zero amount', (world) => { world.fundraiserSupports[0].amountCents = 0; }],
  ['fundraiser support negative amount', (world) => { world.fundraiserSupports[0].amountCents = -500; }],
  ['fundraiser support amount outside allowed range', (world) => {
    world.fundraiserSupports[0].amountCents = 999999;
  }],
  ['fundraiser support exceeds goal', (world) => {
    const row = fundraiserSupport(world, (item, campaign) => campaign.goalAmountCents === 25000);
    row.amountCents = 50000;
  }],
  ['fundraiser creator self-support', (world) => {
    const row = fundraiserSupport(world, (item, campaign) => campaign.creatorUserId);
    const campaign = fundraiser(world, (item) => item.id === row.fundraiserId);
    row.userId = campaign.creatorUserId;
    resetFundraiserSupportId(row);
  }],
  ['fundraiser support before user existed', (world) => {
    const row = world.fundraiserSupports[0];
    const user = world.users.find((item) => item.id === row.userId);
    row.supportedAt = new Date(new Date(user.createdAt).getTime() - 60000).toISOString();
  }],
  ['fundraiser support before fundraiser existed', (world) => {
    const row = world.fundraiserSupports[0];
    const campaign = fundraiser(world, (item) => item.id === row.fundraiserId);
    row.supportedAt = new Date(new Date(campaign.createdAt).getTime() - 60000).toISOString();
  }],
  ['fundraiser support after anchor', (world) => {
    world.fundraiserSupports[0].supportedAt = '2026-08-31T00:00:00.000Z';
  }],
  ['fundraiser support after campaign end', (world) => {
    const row = fundraiserSupport(world, (item, campaign) => campaign.endDate < '2026-08-30');
    const campaign = fundraiser(world, (item) => item.id === row.fundraiserId);
    row.supportedAt = new Date(`${campaign.endDate}T23:59:59-04:00`).toISOString();
    row.supportedAt = new Date(new Date(row.supportedAt).getTime() + 60000).toISOString();
  }],
  ['fundraiser support on cancelled campaign', (world) => {
    const row = world.fundraiserSupports[0];
    const cancelled = fundraiser(world, (item) => item.status === 'cancelled');
    row.fundraiserId = cancelled.id;
    resetFundraiserSupportId(row);
  }],
  ['wrong Maya fundraiser goal', (world) => {
    fundraiser(world, (item) => item.title === '100 Meal Boxes for Atlanta Families').goalAmountCents = 150000;
  }],
  ['wrong Maya fundraiser support total', (world) => {
    const campaign = fundraiser(world, (item) => item.title === '100 Meal Boxes for Atlanta Families');
    fundraiserSupport(world, (item) => item.fundraiserId === campaign.id && item.amountCents === 5000).amountCents = 10000;
  }],
  ['wrong Maya fundraiser supporter count', (world) => {
    const campaign = fundraiser(world, (item) => item.title === '100 Meal Boxes for Atlanta Families');
    const row = fundraiserSupport(world, (item) => item.fundraiserId === campaign.id);
    const destination = fundraiser(world, (item) => item.id !== campaign.id
      && item.status === 'active' && item.endDate >= '2026-08-30'
      && item.goalAmountCents >= row.amountCents
      && !world.fundraiserSupports.some((support) => support.userId === row.userId
        && support.fundraiserId === item.id));
    row.fundraiserId = destination.id;
    resetFundraiserSupportId(row);
  }],
  ['missing David support on Maya fundraiser', (world) => {
    const david = world.users.find((item) => item.displayName === 'David Mercer');
    const campaign = fundraiser(world, (item) => item.title === '100 Meal Boxes for Atlanta Families');
    const row = fundraiserSupport(world, (item) => item.fundraiserId === campaign.id
      && item.userId === david.id);
    const existing = new Set(world.fundraiserSupports.filter((item) => item.fundraiserId === campaign.id).map((item) => item.userId));
    row.userId = world.users.find((item) => !existing.has(item.id) && item.id !== campaign.creatorUserId).id;
    resetFundraiserSupportId(row);
  }],
  ['Maya fundraiser self-support', (world) => {
    const maya = world.users.find((item) => item.displayName === 'Maya Ellis');
    const campaign = fundraiser(world, (item) => item.title === '100 Meal Boxes for Atlanta Families');
    const row = fundraiserSupport(world, (item) => item.fundraiserId === campaign.id);
    row.userId = maya.id;
    resetFundraiserSupportId(row);
  }],
  ['second Maya-created fundraiser', (world) => {
    const maya = world.users.find((item) => item.displayName === 'Maya Ellis');
    const row = fundraiser(world, (item) => item.creatorUserId && item.creatorUserId !== maya.id
      && maya.causes.includes(world.causes.find((cause) => cause.id === item.causeId).name));
    row.creatorUserId = maya.id;
    resetFundraiserId(row);
  }],
  ['wrong David fundraiser support total', (world) => {
    const campaign = fundraiser(world, (item) => item.title === 'Roswell Veterans Resource Day Fund');
    fundraiserSupport(world, (item) => item.fundraiserId === campaign.id && item.amountCents === 5000).amountCents = 10000;
  }],
  ['wrong David fundraiser supporter count', (world) => {
    const campaign = fundraiser(world, (item) => item.title === 'Roswell Veterans Resource Day Fund');
    const row = fundraiserSupport(world, (item) => item.fundraiserId === campaign.id);
    const destination = fundraiser(world, (item) => item.id !== campaign.id
      && item.status === 'active' && item.endDate >= '2026-08-30'
      && item.goalAmountCents >= row.amountCents
      && !world.fundraiserSupports.some((support) => support.userId === row.userId
        && support.fundraiserId === item.id));
    row.fundraiserId = destination.id;
    resetFundraiserSupportId(row);
  }],
  ['missing Maya support on David fundraiser', (world) => {
    const maya = world.users.find((item) => item.displayName === 'Maya Ellis');
    const campaign = fundraiser(world, (item) => item.title === 'Roswell Veterans Resource Day Fund');
    const row = fundraiserSupport(world, (item) => item.fundraiserId === campaign.id
      && item.userId === maya.id);
    const existing = new Set(world.fundraiserSupports.filter((item) => item.fundraiserId === campaign.id).map((item) => item.userId));
    row.userId = world.users.find((item) => !existing.has(item.id) && item.id !== campaign.creatorUserId).id;
    resetFundraiserSupportId(row);
  }],
  ['David fundraiser self-support', (world) => {
    const david = world.users.find((item) => item.displayName === 'David Mercer');
    const campaign = fundraiser(world, (item) => item.title === 'Roswell Veterans Resource Day Fund');
    const row = fundraiserSupport(world, (item) => item.fundraiserId === campaign.id);
    row.userId = david.id;
    resetFundraiserSupportId(row);
  }],
  ['wrong Riverlight fundraiser total', (world) => {
    const campaign = fundraiser(world, (item) => item.title === "Keep Atlanta's Waterways Clean This Fall");
    fundraiserSupport(world, (item) => item.fundraiserId === campaign.id && item.amountCents === 5000).amountCents = 10000;
  }],
  ['wrong Riverlight fundraiser supporter count', (world) => {
    const campaign = fundraiser(world, (item) => item.title === "Keep Atlanta's Waterways Clean This Fall");
    const row = fundraiserSupport(world, (item) => item.fundraiserId === campaign.id);
    const destination = fundraiser(world, (item) => item.id !== campaign.id
      && item.status === 'active' && item.endDate >= '2026-08-30'
      && item.goalAmountCents >= row.amountCents
      && !world.fundraiserSupports.some((support) => support.userId === row.userId
        && support.fundraiserId === item.id));
    row.fundraiserId = destination.id;
    resetFundraiserSupportId(row);
  }],
  ['wrong Mosaic fundraiser total', (world) => {
    const campaign = fundraiser(world, (item) => item.title === 'Summer Meal Box Fund');
    fundraiserSupport(world, (item) => item.fundraiserId === campaign.id && item.amountCents === 5000).amountCents = 10000;
  }],
  ['Mosaic fundraiser no longer ended', (world) => {
    fundraiser(world, (item) => item.title === 'Summer Meal Box Fund').endDate = '2026-09-30';
  }],
  ['wrong reaction count', (world) => { world.reactions.pop(); }],
  ['wrong reaction target distribution', (world) => {
    const row = reaction(world, (item) => item.activityId);
    const target = opportunity(world, (item) => item.timeBucket === 'upcoming');
    retargetSocialRow(row, 'opportunityId', target.id);
    resetReactionId(row);
  }],
  ['wrong reaction type distribution', (world) => {
    reaction(world, (item) => item.activityId && item.reactionType === 'like').reactionType = 'celebrate';
  }],
  ['duplicate reaction ID', (world) => { world.reactions[1].id = world.reactions[0].id; }],
  ['invalid reaction UUID', (world) => { world.reactions[0].id = 'not-a-uuid'; }],
  ['invalid reaction type', (world) => { world.reactions[0].reactionType = 'applaud'; }],
  ['reaction missing user', (world) => {
    world.reactions[0].userId = UNKNOWN_UUID;
    resetReactionId(world.reactions[0]);
  }],
  ['reaction with zero targets', (world) => {
    const row = world.reactions[0];
    row.activityId = null;
    row.opportunityId = null;
    row.fundraiserId = null;
  }],
  ['reaction with multiple targets', (world) => {
    const row = reaction(world, (item) => item.activityId);
    row.opportunityId = world.opportunities[0].id;
  }],
  ['reaction references missing Activity', (world) => {
    const row = reaction(world, (item) => item.activityId);
    row.activityId = UNKNOWN_UUID;
    resetReactionId(row);
  }],
  ['reaction references missing Opportunity', (world) => {
    const row = reaction(world, (item) => item.opportunityId);
    row.opportunityId = UNKNOWN_UUID;
    resetReactionId(row);
  }],
  ['reaction references missing Fundraiser', (world) => {
    const row = reaction(world, (item) => item.fundraiserId);
    row.fundraiserId = UNKNOWN_UUID;
    resetReactionId(row);
  }],
  ...['activityId', 'opportunityId', 'fundraiserId'].map((key) => [
    `duplicate user/${key.replace('Id', '')} reaction`,
    (world) => {
      const rows = world.reactions.filter((item) => item[key]);
      rows[1].userId = rows[0].userId;
      rows[1][key] = rows[0][key];
      resetReactionId(rows[1]);
    },
  ]),
  ['support reaction on Fundraiser', (world) => {
    reaction(world, (item) => item.fundraiserId && item.reactionType === 'like').reactionType = 'support';
  }],
  ['Activity owner reacts to own Activity', (world) => {
    const row = reaction(world, (item) => item.activityId);
    row.userId = activity(world, (item) => item.id === row.activityId).userId;
    resetReactionId(row);
  }],
  ['user host reacts to own Opportunity', (world) => {
    const target = opportunity(world, (item) => item.hostUserId && item.status === 'published');
    const row = reaction(world, (item) => item.opportunityId);
    retargetSocialRow(row, 'opportunityId', target.id);
    row.userId = target.hostUserId;
    resetReactionId(row);
  }],
  ['fundraiser creator reacts to own Fundraiser', (world) => {
    const target = fundraiser(world, (item) => item.creatorUserId && item.status === 'active');
    const row = reaction(world, (item) => item.fundraiserId);
    retargetSocialRow(row, 'fundraiserId', target.id);
    row.userId = target.creatorUserId;
    resetReactionId(row);
  }],
  ['reaction on cancelled Opportunity', (world) => {
    const row = reaction(world, (item) => item.opportunityId);
    retargetSocialRow(row, 'opportunityId', opportunity(world, (item) => item.status === 'cancelled').id);
    resetReactionId(row);
  }],
  ['reaction on cancelled Fundraiser', (world) => {
    const row = reaction(world, (item) => item.fundraiserId);
    retargetSocialRow(row, 'fundraiserId', fundraiser(world, (item) => item.status === 'cancelled').id);
    resetReactionId(row);
  }],
  ['reaction before user existed', (world) => {
    const row = world.reactions[0];
    const user = world.users.find((item) => item.id === row.userId);
    row.createdAt = new Date(new Date(user.createdAt).getTime() - 60000).toISOString();
  }],
  ['reaction before target existed', (world) => {
    const row = reaction(world, (item) => item.activityId);
    const target = activity(world, (item) => item.id === row.activityId);
    row.createdAt = new Date(new Date(target.createdAt).getTime() - 60000).toISOString();
  }],
  ['reaction after anchor', (world) => { world.reactions[0].createdAt = '2026-08-31T00:00:00.000Z'; }],
  ['wrong comment count', (world) => { world.comments.pop(); }],
  ['wrong comment target distribution', (world) => {
    const row = comment(world, (item) => item.activityId);
    retargetSocialRow(row, 'opportunityId', opportunity(world, (item) => item.timeBucket === 'upcoming').id);
    resetCommentId(row);
  }],
  ['duplicate comment ID', (world) => { world.comments[1].id = world.comments[0].id; }],
  ['invalid comment UUID', (world) => { world.comments[0].id = 'not-a-uuid'; }],
  ['comment missing user', (world) => {
    world.comments[0].userId = UNKNOWN_UUID;
    resetCommentId(world.comments[0]);
  }],
  ['comment with zero targets', (world) => {
    const row = world.comments[0];
    row.activityId = null;
    row.opportunityId = null;
    row.fundraiserId = null;
  }],
  ['comment with multiple targets', (world) => {
    comment(world, (item) => item.activityId).opportunityId = world.opportunities[0].id;
  }],
  ['comment references missing target', (world) => {
    const row = comment(world, (item) => item.fundraiserId);
    row.fundraiserId = UNKNOWN_UUID;
    resetCommentId(row);
  }],
  ['blank comment body', (world) => { world.comments[0].body = ''; }],
  ['whitespace-only comment body', (world) => { world.comments[0].body = '   '; }],
  ['comment body over 1000 characters', (world) => { world.comments[0].body = 'x'.repeat(1001); }],
  ['duplicate seeded user-target comment', (world) => {
    world.comments[1].userId = world.comments[0].userId;
    retargetSocialRow(world.comments[1], `${socialTargetType(world.comments[0])}Id`, socialTargetId(world.comments[0]));
    resetCommentId(world.comments[1]);
  }],
  ['Activity owner comments on own Activity', (world) => {
    const row = comment(world, (item) => item.activityId);
    row.userId = activity(world, (item) => item.id === row.activityId).userId;
    resetCommentId(row);
  }],
  ['user host comments on own Opportunity', (world) => {
    const target = opportunity(world, (item) => item.hostUserId && item.status === 'published');
    const row = comment(world, (item) => item.opportunityId);
    retargetSocialRow(row, 'opportunityId', target.id);
    row.userId = target.hostUserId;
    resetCommentId(row);
  }],
  ['fundraiser creator comments on own Fundraiser', (world) => {
    const target = fundraiser(world, (item) => item.creatorUserId && item.status === 'active');
    const row = comment(world, (item) => item.fundraiserId);
    retargetSocialRow(row, 'fundraiserId', target.id);
    row.userId = target.creatorUserId;
    resetCommentId(row);
  }],
  ['comment on cancelled Opportunity', (world) => {
    const row = comment(world, (item) => item.opportunityId);
    retargetSocialRow(row, 'opportunityId', opportunity(world, (item) => item.status === 'cancelled').id);
    resetCommentId(row);
  }],
  ['comment on cancelled Fundraiser', (world) => {
    const row = comment(world, (item) => item.fundraiserId);
    retargetSocialRow(row, 'fundraiserId', fundraiser(world, (item) => item.status === 'cancelled').id);
    resetCommentId(row);
  }],
  ['comment before user existed', (world) => {
    const row = world.comments[0];
    const user = world.users.find((item) => item.id === row.userId);
    row.createdAt = new Date(new Date(user.createdAt).getTime() - 60000).toISOString();
  }],
  ['comment before target existed', (world) => {
    const row = comment(world, (item) => item.activityId);
    const target = activity(world, (item) => item.id === row.activityId);
    row.createdAt = new Date(new Date(target.createdAt).getTime() - 60000).toISOString();
  }],
  ['comment after anchor', (world) => { world.comments[0].createdAt = '2026-08-31T00:00:00.000Z'; }],
  ['joined-style Opportunity comment without registration', (world) => {
    const row = comment(world, (item) => item.opportunityId && !world.registrations.some(
      (registrationRow) => registrationRow.userId === item.userId
        && registrationRow.opportunityId === item.opportunityId
        && registrationRow.status === 'joined'
    ));
    row.body = ANCHOR_COMMENTS.flagshipByMaya;
  }],
  ['joined-style comment before joinedAt', (world) => {
    const row = comment(world, (item) => item.opportunityId
      && item.body === ANCHOR_COMMENTS.flagshipByMaya);
    const registrationRow = registration(world, (item) => (
      item.userId === row.userId && item.opportunityId === row.opportunityId
    ));
    row.createdAt = new Date(new Date(registrationRow.joinedAt).getTime() - 60000).toISOString();
  }],
  ['joined-style comment on recent-past Opportunity', (world) => {
    let selected;
    for (const target of world.opportunities.filter((item) => item.timeBucket === 'recent_past')) {
      const row = world.comments.find((item) => item.opportunityId === target.id);
      const registrationRow = world.registrations.find((item) => (
        item.opportunityId === target.id && item.status === 'joined'
        && item.userId !== target.hostUserId
        && !world.comments.some((candidate) => (
          candidate.userId === item.userId && candidate.opportunityId === target.id
        ))
      ));
      if (row && registrationRow) {
        selected = { row, registrationRow };
        break;
      }
    }
    selected.row.userId = selected.registrationRow.userId;
    selected.row.body = ANCHOR_COMMENTS.flagshipByMaya;
    selected.row.createdAt = CONFIG.anchorDate;
    resetCommentId(selected.row);
  }],
  ['supporter-style Fundraiser comment without financial support', (world) => {
    const row = comment(world, (item) => item.fundraiserId && !world.fundraiserSupports.some(
      (support) => support.userId === item.userId && support.fundraiserId === item.fundraiserId
    ));
    row.body = ANCHOR_COMMENTS.mayaFundraiserByDavid;
  }],
  ['supporter-style comment before supportedAt', (world) => {
    const row = comment(world, (item) => item.fundraiserId
      && item.body === ANCHOR_COMMENTS.mayaFundraiserByDavid);
    const support = fundraiserSupport(world, (item) => (
      item.userId === row.userId && item.fundraiserId === row.fundraiserId
    ));
    row.createdAt = new Date(new Date(support.supportedAt).getTime() - 60000).toISOString();
  }],
  ['ended-success comment before campaign end', (world) => {
    const target = fundraiser(world, (item) => item.title === 'Summer Meal Box Fund');
    const row = comment(world, (item) => item.fundraiserId === target.id
      && item.body === 'Amazing to see this campaign reach its goal — worth celebrating.');
    row.createdAt = new Date(
      new Date(easternTimestamp(target.endDate, '23:59:59')).getTime() - 60000
    ).toISOString();
  }],
  ['co-participant Activity comment backed only by joined registration', (world) => {
    let selected;
    for (const target of world.activities.filter((item) => item.registrationId)) {
      const source = world.registrations.find((item) => item.id === target.registrationId);
      const opportunityRow = world.opportunities.find((item) => item.id === source.opportunityId);
      const row = world.comments.find((item) => item.activityId === target.id);
      const joined = world.registrations.find((item) => (
        item.opportunityId === source.opportunityId && item.status === 'joined'
        && item.userId !== target.userId && item.userId !== opportunityRow.hostUserId
        && !world.comments.some((candidate) => (
          candidate.userId === item.userId && candidate.activityId === target.id
        ))
        && !world.activities.some((candidate) => {
          if (candidate.userId !== item.userId || !candidate.registrationId) return false;
          const registrationRow = world.registrations.find(
            (registrationItem) => registrationItem.id === candidate.registrationId
          );
          return registrationRow.opportunityId === source.opportunityId;
        })
      ));
      if (row && joined) {
        selected = { row, joined };
        break;
      }
    }
    selected.row.userId = selected.joined.userId;
    selected.row.body = 'Really enjoyed working together on this community project.';
    selected.row.createdAt = CONFIG.anchorDate;
    resetCommentId(selected.row);
  }],
  ['wrong Maya Activity reaction count', (world) => {
    const maya = world.users.find((item) => item.displayName === 'Maya Ellis');
    const target = activity(world, (item) => item.userId === maya.id
      && item.manualTitle === 'Westside Community Garden Morning');
    const row = reaction(world, (item) => item.activityId === target.id);
    const destination = world.activities.find((item) => item.registrationId === null
      && item.id !== target.id && !world.reactions.some((existing) => (
        existing.userId === row.userId && existing.activityId === item.id
      )));
    retargetSocialRow(row, 'activityId', destination.id);
    resetReactionId(row);
  }],
  ['wrong Maya Activity comment count', (world) => {
    const maya = world.users.find((item) => item.displayName === 'Maya Ellis');
    const target = activity(world, (item) => item.userId === maya.id
      && item.manualTitle === 'Westside Community Garden Morning');
    world.comments = world.comments.filter((item, index) => item.activityId !== target.id || index !== world.comments.findIndex((candidate) => candidate.activityId === target.id));
  }],
  ['missing David Celebrate on Maya Activity', (world) => {
    const david = world.users.find((item) => item.displayName === 'David Mercer');
    reaction(world, (item) => item.userId === david.id && item.activityId
      && activity(world, (target) => target.id === item.activityId)?.manualTitle
        === 'Westside Community Garden Morning').reactionType = 'like';
  }],
  ['missing David comment on Maya Activity', (world) => {
    const david = world.users.find((item) => item.displayName === 'David Mercer');
    comment(world, (item) => item.userId === david.id
      && item.body === ANCHOR_COMMENTS.mayaActivityByDavid).body = 'Community effort at its best.';
  }],
  ['wrong David Activity engagement', (world) => {
    const david = world.users.find((item) => item.displayName === 'David Mercer');
    const row = world.reactions.find((item) => item.activityId
      && activity(world, (target) => target.id === item.activityId)?.userId === david.id
      && activity(world, (target) => target.id === item.activityId)?.registrationId);
    world.reactions.splice(world.reactions.indexOf(row), 1);
  }],
  ['missing Maya Celebrate on David Activity', (world) => {
    const maya = world.users.find((item) => item.displayName === 'Maya Ellis');
    reaction(world, (item) => item.userId === maya.id && item.activityId
      && activity(world, (target) => target.id === item.activityId)?.userId
        === world.users.find((user) => user.displayName === 'David Mercer').id).reactionType = 'like';
  }],
  ['wrong flagship social counts', (world) => {
    const flagship = opportunity(world, (item) => item.flagship);
    const row = reaction(world, (item) => item.opportunityId === flagship.id);
    world.reactions.splice(world.reactions.indexOf(row), 1);
  }],
  ['missing Maya Support reaction on flagship', (world) => {
    const maya = world.users.find((item) => item.displayName === 'Maya Ellis');
    const flagship = opportunity(world, (item) => item.flagship);
    reaction(world, (item) => item.userId === maya.id
      && item.opportunityId === flagship.id).reactionType = 'like';
  }],
  ['missing Maya joined-backed flagship comment', (world) => {
    comment(world, (item) => item.body === ANCHOR_COMMENTS.flagshipByMaya).body
      = 'A clear, practical way to support Environment.';
  }],
  ['Fundraiser support reaction added to Maya anchor campaign', (world) => {
    const target = fundraiser(world, (item) => item.title === '100 Meal Boxes for Atlanta Families');
    reaction(world, (item) => item.fundraiserId === target.id).reactionType = 'support';
  }],
  ['wrong Maya fundraiser social counts', (world) => {
    const target = fundraiser(world, (item) => item.title === '100 Meal Boxes for Atlanta Families');
    const row = comment(world, (item) => item.fundraiserId === target.id);
    world.comments.splice(world.comments.indexOf(row), 1);
  }],
  ['missing David social engagement on Maya fundraiser', (world) => {
    const david = world.users.find((item) => item.displayName === 'David Mercer');
    comment(world, (item) => item.userId === david.id
      && item.body === ANCHOR_COMMENTS.mayaFundraiserByDavid).body
        = 'Cheering this campaign on as it builds momentum.';
  }],
  ['wrong David fundraiser social counts', (world) => {
    const target = fundraiser(world, (item) => item.title === 'Roswell Veterans Resource Day Fund');
    const row = reaction(world, (item) => item.fundraiserId === target.id);
    world.reactions.splice(world.reactions.indexOf(row), 1);
  }],
  ['missing Maya social engagement on David fundraiser', (world) => {
    const maya = world.users.find((item) => item.displayName === 'Maya Ellis');
    comment(world, (item) => item.userId === maya.id
      && item.body === ANCHOR_COMMENTS.davidFundraiserByMaya).body
        = 'Cheering this campaign on as it builds momentum.';
  }],
  ['wrong Riverlight social engagement', (world) => {
    const target = fundraiser(world, (item) => item.title === "Keep Atlanta's Waterways Clean This Fall");
    const row = comment(world, (item) => item.fundraiserId === target.id);
    world.comments.splice(world.comments.indexOf(row), 1);
  }],
  ['wrong Mosaic social engagement', (world) => {
    const target = fundraiser(world, (item) => item.title === 'Summer Meal Box Fund');
    const row = reaction(world, (item) => item.fundraiserId === target.id);
    world.reactions.splice(world.reactions.indexOf(row), 1);
  }],
  ['all charity events below meaningful traction', (world) => {
    const joined = new Map(world.opportunities.map((item) => [item.id, 0]));
    for (const row of world.registrations) {
      if (row.status === 'joined') joined.set(row.opportunityId, joined.get(row.opportunityId) + 1);
    }
    for (const item of world.opportunities.filter((candidate) => (
      candidate.opportunityType === 'charity_event' && !candidate.anchor
    ))) item.capacity = Math.max(1, joined.get(item.id) * 5);
  }],
  ['user with three long-distance completed Activities', (world) => {
    const registrationById = new Map(world.registrations.map((row) => [row.id, row]));
    const opportunityById = new Map(world.opportunities.map((item) => [item.id, item]));
    const candidates = world.users.filter((user) => (
      !user.anchor && !world.opportunities.some((item) => item.hostUserId === user.id)
    ));
    let selected;
    for (const user of candidates) {
      const items = world.activities.filter((item) => (
        item.userId === user.id && item.registrationId
      )).map((item) => opportunityById.get(registrationById.get(item.registrationId).opportunityId))
        .filter((item) => !item.isOnline);
      for (const city of Object.keys(CITY_CENTROIDS)) {
        const hypothetical = { ...user, city };
        if (items.filter((item) => userOpportunityMiles(hypothetical, item) > 100).length >= 3) {
          selected = { user, city };
          break;
        }
      }
      if (selected) break;
    }
    selected.user.city = selected.city;
  }],
  ['implausible same-day distant and local completed Activities', (world) => {
    const registrationById = new Map(world.registrations.map((row) => [row.id, row]));
    const opportunityById = new Map(world.opportunities.map((item) => [item.id, item]));
    const groups = new Map();
    for (const item of world.activities.filter((candidate) => candidate.registrationId)) {
      const target = opportunityById.get(registrationById.get(item.registrationId).opportunityId);
      if (target.isOnline || target.anchor) continue;
      const key = `${item.userId}|${item.occurredOn}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(target);
    }
    const [key, items] = [...groups].find(([, targets]) => targets.length >= 2);
    const user = world.users.find((candidate) => candidate.id === key.split('|')[0]);
    const local = CITY_CENTROIDS[user.city];
    const distant = Object.values(CITY_CENTROIDS).find((coordinates) => {
      const hypothetical = { ...items[1], ...coordinates };
      return userOpportunityMiles(user, hypothetical) > 100;
    });
    items[0].latitude = local.latitude;
    items[0].longitude = local.longitude;
    items[1].latitude = distant.latitude;
    items[1].longitude = distant.longitude;
  }],
  ['missing Maya avatar reference', (world) => {
    world.users.find((user) => user.displayName === 'Maya Ellis').avatarUrl = null;
  }],
  ['wrong avatar reference count', (world) => {
    world.users.find((user) => user.avatarUrl && !user.anchor).avatarUrl = null;
  }],
  ['missing anchor organization logo reference', (world) => {
    world.organizations.find((organization) => organization.anchor).logoUrl = null;
  }],
  ['wrong organization logo reference count', (world) => {
    world.organizations.find((organization) => organization.logoUrl && !organization.anchor)
      .logoUrl = null;
  }],
  ['malformed controlled media path', (world) => {
    world.users.find((user) => user.avatarUrl && !user.anchor).avatarUrl = '/tmp/avatar.jpg';
  }],
  ['collapsed generated Opportunity title diversity', (world) => {
    for (const item of world.opportunities.filter((candidate) => !candidate.anchor)) {
      item.title = 'Community Service Day';
    }
  }],
  ['excessively repeated ordinary Opportunity title', (world) => {
    for (const item of world.opportunities.filter((candidate) => !candidate.anchor).slice(0, 11)) {
      item.title = 'Repeated Community Opportunity';
    }
  }],
  ['collapsed manual Activity title diversity', (world) => {
    for (const item of world.activities.filter((candidate) => !candidate.registrationId)) {
      renameManualActivity(world, item, 'Community Volunteer Shift');
    }
  }],
];

const INTEGRITY_CHECKS = [
  ['manual linked activity excluded from public organization impact', (world) => {
    const before = JSON.stringify([...buildOrganizationPublicImpact(world)]);
    const row = activity(world, (candidate) => candidate.registrationId === null
      && candidate.manualOrgId !== null
      && !world.users.find((user) => user.id === candidate.userId).anchor);
    row.hours += 0.5;
    const after = JSON.stringify([...buildOrganizationPublicImpact(world)]);
    return validateWorld(world) && before === after;
  }],
  ['supporting a fundraiser does not increase supporter Amount Raised', (world) => {
    const authoredIds = new Set(world.fundraisers.slice(0, 4).map((item) => item.id));
    const row = fundraiserSupport(world, (item, campaign) => (
      !authoredIds.has(campaign.id) && item.amountCents === 2500
      && campaign.goalAmountCents >= 5000
    ));
    const before = deriveAmountRaisedByUser(world).get(row.userId);
    const priorProgress = deriveFundraiserProgress(world).get(row.fundraiserId).amountRaisedCents;
    row.amountCents = 5000;
    const after = deriveAmountRaisedByUser(world).get(row.userId);
    const nextProgress = deriveFundraiserProgress(world).get(row.fundraiserId).amountRaisedCents;
    return validateWorld(world) && before === after && nextProgress === priorProgress + 2500;
  }],
  ['fundraiser social reaction cannot change financial truth', (world) => {
    const beforeProgress = JSON.stringify([...deriveFundraiserProgress(world)]);
    const beforeRaised = JSON.stringify([...deriveAmountRaisedByUser(world)]);
    const row = reaction(world, (item) => item.fundraiserId && item.reactionType === 'like');
    row.reactionType = 'celebrate';
    const afterProgress = JSON.stringify([...deriveFundraiserProgress(world)]);
    const afterRaised = JSON.stringify([...deriveAmountRaisedByUser(world)]);
    return beforeProgress === afterProgress && beforeRaised === afterRaised;
  }],
  ['Activity social engagement cannot change contribution truth', (world) => {
    const beforeProfiles = JSON.stringify([...deriveProfileMetrics(world)]);
    const beforeImpact = JSON.stringify([...buildOrganizationPublicImpact(world)]);
    const beforeProgress = JSON.stringify([...deriveFundraiserProgress(world)]);
    const activityReaction = reaction(world, (item) => item.activityId);
    const activityComment = comment(world, (item) => item.activityId);
    world.reactions.splice(world.reactions.indexOf(activityReaction), 1);
    activityComment.body = 'A morning well spent — thanks for sharing this.';
    const afterProfiles = JSON.stringify([...deriveProfileMetrics(world)]);
    const afterImpact = JSON.stringify([...buildOrganizationPublicImpact(world)]);
    const afterProgress = JSON.stringify([...deriveFundraiserProgress(world)]);
    return beforeProfiles === afterProfiles
      && beforeImpact === afterImpact
      && beforeProgress === afterProgress;
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
