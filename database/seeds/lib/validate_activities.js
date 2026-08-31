const CONFIG = require('../config');
const { deterministicUuid } = require('./ids');
const {
  buildOrganizationPublicImpact,
  deriveProfileMetrics,
  localCalendarDate,
} = require('./activities');
const { EXTERNAL_ACTIVITY_ORGANIZATIONS } = require('../data/activities');

const UUID_V5_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assert(condition, message) {
  if (!condition) throw new Error(`Seed validation failed: ${message}`);
}

function timestamp(label, value) {
  const result = new Date(value).getTime();
  assert(Number.isFinite(result), `${label} has invalid timestamp: ${value}`);
  return result;
}

function validDate(label, value) {
  assert(typeof value === 'string' && DATE_PATTERN.test(value), `${label} has invalid date: ${value}`);
  const parsed = new Date(`${value}T12:00:00Z`);
  assert(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value,
    `${label} has invalid calendar date: ${value}`);
  return value;
}

function nonblank(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateTargetCounts(world, registrationById) {
  const kynd = world.activities.filter((activity) => activity.registrationId !== null);
  const manual = world.activities.filter((activity) => activity.registrationId === null);
  const linkedManual = manual.filter((activity) => activity.manualOrgId !== null);
  assert(world.activities.length === CONFIG.counts.activities,
    `activity count is ${world.activities.length}; expected ${CONFIG.counts.activities}`);
  assert(kynd.length === CONFIG.activityTargets.sources.kynd,
    `Kynd activity count is ${kynd.length}; expected ${CONFIG.activityTargets.sources.kynd}`);
  assert(manual.length === CONFIG.activityTargets.sources.manual,
    `manual activity count is ${manual.length}; expected ${CONFIG.activityTargets.sources.manual}`);
  assert(linkedManual.length === CONFIG.activityTargets.manualOrganizations.linkedKynd,
    `linked manual activity count is ${linkedManual.length}; expected 120`);
  assert(manual.length - linkedManual.length === CONFIG.activityTargets.manualOrganizations.external,
    `external manual activity count is ${manual.length - linkedManual.length}; expected 280`);

  const users = new Map(world.users.map((user) => [user.id, user]));
  for (const [tier, expected] of Object.entries(CONFIG.activityTargets.kyndByUserTier)) {
    const actual = kynd.filter((activity) => users.get(activity.userId)?.tier === tier).length;
    assert(actual === expected, `${tier} Kynd activity count is ${actual}; expected ${expected}`);
  }
  for (const [tier, expected] of Object.entries(CONFIG.activityTargets.manualByUserTier)) {
    const actual = manual.filter((activity) => users.get(activity.userId)?.tier === tier).length;
    assert(actual === expected, `${tier} manual activity count is ${actual}; expected ${expected}`);
  }

  const eligible = world.registrations.filter((registration) => {
    const opportunity = world.opportunities.find((item) => item.id === registration.opportunityId);
    return registration.status === 'joined' && opportunity?.timeBucket === 'recent_past';
  });
  assert(eligible.length === 3200, `eligible activity registration count is ${eligible.length}; expected 3200`);
  assert(kynd.every((activity) => registrationById.has(activity.registrationId)),
    'Kynd activity count includes missing registration references');
}

function validateAnchors(world, registrationById, opportunityById) {
  const anchorRequirements = [
    ['Maya Ellis', CONFIG.activityTargets.anchors.maya, 2],
    ['David Mercer', CONFIG.activityTargets.anchors.david, 4],
  ];
  for (const [name, target, enrichmentMinimum] of anchorRequirements) {
    const user = world.users.find((candidate) => candidate.displayName === name);
    const activities = world.activities.filter((activity) => activity.userId === user.id);
    const kynd = activities.filter((activity) => activity.registrationId !== null);
    const manual = activities.filter((activity) => activity.registrationId === null);
    assert(activities.length === target.kynd + target.manual,
      `${name} activity total is ${activities.length}; expected ${target.kynd + target.manual}`);
    assert(kynd.length === target.kynd, `${name} Kynd activity count changed`);
    assert(manual.length === target.manual, `${name} manual activity count changed`);
    assert(manual.some((activity) => activity.manualOrgId === null),
      `${name} must have an external manual activity`);
    assert(activities.filter((activity) => nonblank(activity.story) || nonblank(activity.imageUrl)).length
      >= enrichmentMinimum, `${name} lacks useful story/image activity content`);

    const eligible = world.registrations.filter((registration) => {
      const opportunity = opportunityById.get(registration.opportunityId);
      return registration.userId === user.id && registration.status === 'joined'
        && opportunity.timeBucket === 'recent_past';
    });
    assert(eligible.length > kynd.length,
      `${name} must retain at least one past join without a confirmed activity`);
    for (const activity of kynd) {
      const registration = registrationById.get(activity.registrationId);
      assert(registration.userId === user.id, `${name} activity belongs to another user`);
    }
  }

  const david = world.users.find((user) => user.displayName === 'David Mercer');
  const davidHosted = world.opportunities.find((opportunity) => opportunity.davidAnchor);
  assert(!world.activities.some((activity) => {
    if (activity.userId !== david.id || !activity.registrationId) return false;
    return registrationById.get(activity.registrationId).opportunityId === davidHosted.id;
  }), 'David has an activity for his own upcoming hosted opportunity');
}

function validateActivities(world) {
  const userById = new Map(world.users.map((user) => [user.id, user]));
  const causeById = new Map(world.causes.map((cause) => [cause.id, cause]));
  const organizationById = new Map(world.organizations.map((item) => [item.id, item]));
  const opportunityById = new Map(world.opportunities.map((item) => [item.id, item]));
  const registrationById = new Map(world.registrations.map((row) => [row.id, row]));
  const anchor = timestamp('configured anchor', CONFIG.anchorDate);
  const anchorDate = localCalendarDate(CONFIG.anchorDate);
  validateTargetCounts(world, registrationById);

  const ids = new Set();
  const registrationIds = new Set();
  const manualDatesByUser = new Set();
  const kyndDatesByUser = new Set();
  for (const activity of world.activities.filter((item) => item.registrationId !== null)) {
    kyndDatesByUser.add(`${activity.userId}|${activity.occurredOn}`);
  }

  for (const activity of world.activities) {
    assert(UUID_V5_PATTERN.test(activity.id), `activity has invalid UUIDv5: ${activity.id}`);
    assert(!ids.has(activity.id), `duplicate activity ID: ${activity.id}`);
    ids.add(activity.id);
    const user = userById.get(activity.userId);
    assert(user, `activity references missing user: ${activity.userId}`);
    assert(Number.isFinite(activity.hours) && activity.hours > 0 && activity.hours <= 12,
      `activity ${activity.id} has invalid or unrealistic hours`);
    assert(Number.isInteger(activity.hours * 4), `activity ${activity.id} hours lack quarter-hour precision`);
    validDate(`${activity.id} occurredOn`, activity.occurredOn);
    assert(activity.occurredOn <= anchorDate, `activity ${activity.id} occurs after anchor date`);
    assert(activity.occurredOn >= localCalendarDate(user.createdAt),
      `activity ${activity.id} occurs before user creation`);
    const createdAt = timestamp(`${activity.id} createdAt`, activity.createdAt);
    assert(createdAt <= anchor, `activity ${activity.id} was created after anchor snapshot`);
    assert(createdAt >= timestamp(`${activity.id} user creation`, user.createdAt),
      `activity ${activity.id} was created before user existed`);
    assert(activity.story === null || nonblank(activity.story), `activity ${activity.id} has blank story`);
    assert(activity.imageUrl === null || nonblank(activity.imageUrl), `activity ${activity.id} has blank image`);

    if (activity.registrationId !== null) {
      const registration = registrationById.get(activity.registrationId);
      assert(registration, `activity ${activity.id} references missing registration`);
      assert(registration.userId === activity.userId,
        `activity ${activity.id} user differs from registration user`);
      assert(registration.status === 'joined', `activity ${activity.id} references cancelled registration`);
      assert(!registrationIds.has(activity.registrationId),
        `duplicate activity for registration ${activity.registrationId}`);
      registrationIds.add(activity.registrationId);
      const opportunity = opportunityById.get(registration.opportunityId);
      assert(opportunity, `activity ${activity.id} registration references missing opportunity`);
      assert(opportunity.status === 'published', `activity ${activity.id} references cancelled opportunity`);
      assert(opportunity.timeBucket === 'recent_past',
        `activity ${activity.id} references future or ineligible opportunity`);
      assert(timestamp(`${activity.id} opportunity end`, opportunity.endsAt) < anchor,
        `activity ${activity.id} opportunity has not ended`);
      for (const key of ['manualTitle', 'manualCauseId', 'manualOrgId', 'manualOrgName']) {
        assert(activity[key] === null, `Kynd activity ${activity.id} has ${key}`);
      }
      assert(activity.occurredOn === localCalendarDate(opportunity.startsAt),
        `activity ${activity.id} occurrence does not match opportunity date`);
      assert(createdAt >= timestamp(`${activity.id} opportunity end`, opportunity.endsAt),
        `activity ${activity.id} was confirmed before opportunity ended`);
      const scheduled = (new Date(opportunity.endsAt) - new Date(opportunity.startsAt)) / 3600000;
      assert(Math.abs(activity.hours - scheduled) <= 0.5,
        `activity ${activity.id} hours are implausible for scheduled duration`);
      assert(activity.id === deterministicUuid('activity-registration', activity.registrationId),
        `activity ${activity.id} does not have deterministic registration identity`);
    } else {
      assert(nonblank(activity.manualTitle), `manual activity ${activity.id} has blank title`);
      const cause = causeById.get(activity.manualCauseId);
      assert(cause, `manual activity ${activity.id} references missing cause`);
      assert(nonblank(activity.manualOrgName), `manual activity ${activity.id} has blank organization name`);
      assert(Number.isInteger(activity.hours * 2),
        `manual activity ${activity.id} hours must use half-hour increments`);
      if (activity.manualOrgId !== null) {
        const organization = organizationById.get(activity.manualOrgId);
        assert(organization, `manual activity ${activity.id} references missing organization`);
        assert(activity.manualOrgName === organization.name,
          `manual activity ${activity.id} organization snapshot does not match`);
        assert(organization.causes.includes(cause.name),
          `manual activity ${activity.id} cause does not match linked organization`);
      } else {
        const external = EXTERNAL_ACTIVITY_ORGANIZATIONS.find(
          (item) => item.name === activity.manualOrgName
        );
        assert(external, `manual activity ${activity.id} uses unknown external organization`);
        assert(external.cause === cause.name,
          `manual activity ${activity.id} cause does not match external organization`);
      }
      const manualKey = `${activity.userId}|${activity.occurredOn}|${activity.manualTitle}|${activity.manualOrgName}`;
      assert(activity.id === deterministicUuid('activity-manual', manualKey),
        `manual activity ${activity.id} does not have deterministic identity`);
      const dateKey = `${activity.userId}|${activity.occurredOn}`;
      assert(!manualDatesByUser.has(dateKey), `duplicate manual activity date for ${activity.userId}`);
      assert(!kyndDatesByUser.has(dateKey), `manual and Kynd activity date collide for ${activity.userId}`);
      manualDatesByUser.add(dateKey);
      assert(createdAt >= timestamp(`${activity.id} occurrence`, `${activity.occurredOn}T00:00:00Z`),
        `manual activity ${activity.id} was created before occurrence`);
      const ageDays = Math.floor((
        new Date(`${anchorDate}T12:00:00Z`) - new Date(`${activity.occurredOn}T12:00:00Z`)
      ) / (24 * 60 * 60 * 1000));
      assert(ageDays >= 0 && ageDays <= 365,
        `manual activity ${activity.id} falls outside the one-year history window`);
    }
  }

  const externalNames = new Set(EXTERNAL_ACTIVITY_ORGANIZATIONS.map((item) => item.name));
  assert(externalNames.size === EXTERNAL_ACTIVITY_ORGANIZATIONS.length,
    'external manual organization names are duplicated');
  for (const organization of world.organizations) {
    assert(!externalNames.has(organization.name),
      `external manual organization duplicates Kynd organization ${organization.name}`);
  }

  validateAnchors(world, registrationById, opportunityById);
  const profileMetrics = deriveProfileMetrics(world);
  for (const user of world.users) {
    const rows = world.activities.filter((activity) => activity.userId === user.id);
    const metrics = profileMetrics.get(user.id);
    assert(metrics.activities === rows.length, `profile activity count is incoherent for ${user.id}`);
    assert(metrics.hours === Number(rows.reduce((sum, activity) => sum + activity.hours, 0).toFixed(2)),
      `profile hours are incoherent for ${user.id}`);
  }

  const manualIds = new Set(world.activities
    .filter((activity) => activity.registrationId === null).map((activity) => activity.id));
  for (const [organizationId, impact] of buildOrganizationPublicImpact(world)) {
    assert(organizationById.has(organizationId), `public impact references missing organization ${organizationId}`);
    assert(impact.activityIds.every((id) => !manualIds.has(id)),
      `manual activity inflated public organization impact for ${organizationId}`);
  }
  return true;
}

module.exports = { validateActivities };
