const CONFIG = require('../config');
const { chance, pick, randomInt, weightedPick } = require('./random');
const { deterministicUuid } = require('./ids');
const {
  EXTERNAL_ACTIVITY_ORGANIZATIONS,
  MANUAL_ACTIVITY_TITLES,
  ACTIVITY_STORIES,
} = require('../data/activities');

const DAY_MS = 24 * 60 * 60 * 1000;
const MANUAL_CAPS = Object.freeze({ light: 2, regular: 3, highly_active: 5, connector: 8 });
const MANUAL_HOURS = Object.freeze([
  { value: 0.5, weight: 3 }, { value: 1, weight: 9 },
  { value: 1.5, weight: 14 }, { value: 2, weight: 20 },
  { value: 2.5, weight: 16 }, { value: 3, weight: 15 },
  { value: 4, weight: 10 }, { value: 5, weight: 6 },
  { value: 6, weight: 4 }, { value: 8, weight: 3 },
]);

function shuffled(rng, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(rng, 0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function localCalendarDate(timestamp) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateAtOffset(dayOffset) {
  const date = new Date(`${CONFIG.anchorDate.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function daysBeforeAnchor(date) {
  return Math.floor((
    new Date(`${CONFIG.anchorDate.slice(0, 10)}T12:00:00Z`)
    - new Date(`${date}T12:00:00Z`)
  ) / DAY_MS);
}

function confirmationTimestamp(rng, endsAt) {
  const end = new Date(endsAt).getTime();
  const anchor = new Date(CONFIG.anchorDate).getTime();
  const roll = rng();
  let minMinutes;
  let maxMinutes;
  if (roll < 0.5) [minMinutes, maxMinutes] = [30, 8 * 60];
  else if (roll < 0.86) [minMinutes, maxMinutes] = [8 * 60, 30 * 60];
  else if (roll < 0.96) [minMinutes, maxMinutes] = [30 * 60, 72 * 60];
  else [minMinutes, maxMinutes] = [72 * 60, 7 * 24 * 60];
  const availableMinutes = Math.floor((anchor - end) / 60000);
  const upper = Math.max(0, Math.min(maxMinutes, availableMinutes));
  const lower = Math.min(minMinutes, upper);
  return new Date(end + randomInt(rng, lower, upper) * 60000).toISOString();
}

function selectedKyndRegistrations(rng, world, maya, david) {
  const opportunityById = new Map(world.opportunities.map((item) => [item.id, item]));
  const eligible = world.registrations.filter((row) => {
    const opportunity = opportunityById.get(row.opportunityId);
    return row.status === 'joined'
      && opportunity.status === 'published'
      && opportunity.timeBucket === 'recent_past';
  });
  const eligibleByUser = new Map(world.users.map((user) => [user.id, []]));
  for (const row of eligible) eligibleByUser.get(row.userId).push(row);
  for (const rows of eligibleByUser.values()) rows.sort((first, second) => (
    opportunityById.get(first.opportunityId).startsAt
      .localeCompare(opportunityById.get(second.opportunityId).startsAt)
  ));

  const zeroKyndUsers = new Set(world.users
    .filter((user) => user.tier === 'light' && !user.anchor)
    .map((user) => ({ user, key: rng() }))
    .sort((first, second) => first.key - second.key || first.user.id.localeCompare(second.user.id))
    .slice(0, 55)
    .map(({ user }) => user.id));
  const forcedByUser = new Map([
    [maya.id, eligibleByUser.get(maya.id).slice(0, CONFIG.activityTargets.anchors.maya.kynd)],
    [david.id, eligibleByUser.get(david.id).slice(0, CONFIG.activityTargets.anchors.david.kynd)],
  ]);
  const selected = [];

  for (const tier of Object.keys(CONFIG.activityTargets.kyndByUserTier)) {
    const target = CONFIG.activityTargets.kyndByUserTier[tier];
    const tierUsers = new Set(world.users.filter((user) => user.tier === tier).map((user) => user.id));
    const forced = [...forcedByUser]
      .filter(([userId]) => tierUsers.has(userId))
      .flatMap(([, rows]) => rows);
    const anchorUserIds = new Set(forcedByUser.keys());
    const propensity = new Map(world.users.filter((user) => tierUsers.has(user.id)).map((user) => [
      user.id, 0.65 + rng() * 0.7,
    ]));
    const candidates = eligible
      .filter((row) => tierUsers.has(row.userId)
        && !zeroKyndUsers.has(row.userId) && !anchorUserIds.has(row.userId))
      .map((row) => ({
        row,
        key: -Math.log(Math.max(rng(), Number.EPSILON)) / propensity.get(row.userId),
      }))
      .sort((first, second) => first.key - second.key || first.row.id.localeCompare(second.row.id))
      .slice(0, target - forced.length)
      .map(({ row }) => row);
    if (forced.length + candidates.length !== target) {
      throw new Error(`Unable to allocate ${target} Kynd activities for ${tier}`);
    }
    selected.push(...forced, ...candidates);
  }
  return { eligible, selected, zeroKyndUsers };
}

function allocateManualQuotas(rng, world, maya, david, zeroKyndUsers) {
  const overrides = new Map([[maya.id, 1], [david.id, 3]]);
  for (const userId of [...zeroKyndUsers].sort().slice(0, 5)) overrides.set(userId, 1);
  const quotas = new Map(world.users.map((user) => [user.id, overrides.get(user.id) || 0]));

  for (const [tier, target] of Object.entries(CONFIG.activityTargets.manualByUserTier)) {
    const users = world.users.filter((user) => user.tier === tier && !overrides.has(user.id));
    const weights = new Map(users.map((user) => [user.id, 0.25 + rng() * 1.5]));
    const fixed = world.users.filter((user) => user.tier === tier)
      .reduce((sum, user) => sum + quotas.get(user.id), 0);
    let remaining = target - fixed;
    while (remaining > 0) {
      const candidates = users.filter((user) => quotas.get(user.id) < MANUAL_CAPS[tier]);
      if (!candidates.length) throw new Error(`Unable to allocate manual activities for ${tier}`);
      const user = weightedPick(rng, candidates.map((candidate) => ({
        user: candidate,
        weight: weights.get(candidate.id) / Math.pow(1 + quotas.get(candidate.id), 1.25),
      }))).user;
      quotas.set(user.id, quotas.get(user.id) + 1);
      remaining -= 1;
    }
  }
  return quotas;
}

function manualSpecs(rng, world, quotas, maya, david) {
  const userById = new Map(world.users.map((user) => [user.id, user]));
  const specs = world.users.flatMap((user) => Array.from(
    { length: quotas.get(user.id) }, (_, index) => ({
      key: `${user.id}|${index + 1}`,
      userId: user.id,
      sequence: index + 1,
    })
  ));
  const mayaSpec = specs.find((spec) => spec.userId === maya.id);
  const davidSpecs = specs.filter((spec) => spec.userId === david.id);
  const linkedKeys = new Set([davidSpecs[0].key]);
  const forcedExternal = new Set([mayaSpec.key, davidSpecs[1].key, davidSpecs[2].key]);
  const linkedCandidates = shuffled(rng, specs.filter((spec) => (
    !linkedKeys.has(spec.key) && !forcedExternal.has(spec.key)
  )));
  for (const spec of linkedCandidates.slice(
    0, CONFIG.activityTargets.manualOrganizations.linkedKynd - linkedKeys.size
  )) linkedKeys.add(spec.key);

  const bucketByKey = new Map([
    [mayaSpec.key, 'previous90Days'],
    [davidSpecs[0].key, 'previous90Days'],
    [davidSpecs[1].key, 'days91To180'],
    [davidSpecs[2].key, 'days181To365'],
  ]);
  function assignBucket(bucket, target, minimumAge) {
    const already = [...bucketByKey.values()].filter((value) => value === bucket).length;
    const candidates = shuffled(rng, specs.filter((spec) => (
      !bucketByKey.has(spec.key)
      && daysBeforeAnchor(localCalendarDate(userById.get(spec.userId).createdAt)) >= minimumAge
    )));
    for (const spec of candidates.slice(0, target - already)) bucketByKey.set(spec.key, bucket);
  }
  assignBucket('days181To365', CONFIG.activityTargets.manualRecency.days181To365, 181);
  assignBucket('days91To180', CONFIG.activityTargets.manualRecency.days91To180, 91);
  for (const spec of specs) if (!bucketByKey.has(spec.key)) bucketByKey.set(spec.key, 'previous90Days');

  return specs.map((spec) => ({
    ...spec,
    linkedKyndOrganization: linkedKeys.has(spec.key),
    recencyBucket: bucketByKey.get(spec.key),
  }));
}

function kyndActivity(rng, row, index, world, maps, anchorSequence) {
  const user = maps.userById.get(row.userId);
  const opportunity = maps.opportunityById.get(row.opportunityId);
  const cause = maps.causeById.get(opportunity.causeId);
  const scheduledHours = (new Date(opportunity.endsAt) - new Date(opportunity.startsAt)) / 3600000;
  const hourRoll = rng();
  const hours = Math.max(0.5, hourRoll < 0.8
    ? scheduledHours : hourRoll < 0.95 ? scheduledHours - 0.5 : scheduledHours + 0.5);
  const anchorIndex = anchorSequence.get(user.id) || 0;
  const forceStory = user.anchor && anchorIndex < 4;
  const forceImage = user.anchor && anchorIndex < 3;
  anchorSequence.set(user.id, anchorIndex + 1);
  const hasStory = forceStory || chance(rng, 0.35);
  const hasImage = forceImage || chance(rng, 0.28);
  return {
    id: deterministicUuid('activity-registration', row.id),
    userId: row.userId,
    registrationId: row.id,
    occurredOn: localCalendarDate(opportunity.startsAt),
    hours,
    manualTitle: null,
    manualCauseId: null,
    manualOrgId: null,
    manualOrgName: null,
    story: hasStory ? pick(rng, ACTIVITY_STORIES[cause.name]) : null,
    imageUrl: hasImage
      ? `/demo-assets/activities/${cause.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/kynd-${index % 12}.jpg`
      : null,
    createdAt: confirmationTimestamp(rng, opportunity.endsAt),
  };
}

function manualOccurredOn(rng, spec, user, usedDates) {
  const ranges = {
    previous90Days: [0, 90], days91To180: [91, 180], days181To365: [181, 365],
  };
  const [minimum, configuredMaximum] = ranges[spec.recencyBucket];
  const userAge = daysBeforeAnchor(localCalendarDate(user.createdAt));
  const maximum = Math.min(configuredMaximum, userAge);
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const occurredOn = dateAtOffset(-randomInt(rng, minimum, maximum));
    if (!usedDates.has(occurredOn)) return occurredOn;
  }
  throw new Error(`Unable to place manual activity date for ${user.displayName}`);
}

function manualCreatedAt(rng, occurredOn, user) {
  const anchor = new Date(CONFIG.anchorDate).getTime();
  const occurred = new Date(`${occurredOn}T12:00:00Z`).getTime();
  const lower = Math.max(occurred, new Date(user.createdAt).getTime());
  const upper = Math.min(anchor, occurred + 8 * DAY_MS);
  const roll = rng();
  const preferredDelay = roll < 0.65 ? randomInt(rng, 0, 1)
    : roll < 0.9 ? randomInt(rng, 2, 3) : randomInt(rng, 4, 7);
  const preferred = occurred + preferredDelay * DAY_MS + randomInt(rng, 0, 8 * 60) * 60000;
  return new Date(Math.max(lower, Math.min(upper, preferred))).toISOString();
}

function chooseManualConcept(rng, spec, user, world, maps) {
  if (user.displayName === 'Maya Ellis') {
    const cause = maps.causeByName.get('Community');
    return {
      title: 'Westside Community Garden Morning', cause,
      organization: null, organizationName: 'Westside Garden Neighbors',
    };
  }
  if (user.displayName === 'David Mercer') {
    const concepts = [
      { cause: 'Community', organizationName: 'Northstar Veterans Network' },
      { cause: 'Education', organizationName: 'Peach State Learning Circle' },
      { cause: 'Veterans', organizationName: 'Homefront Welcome Project' },
    ];
    const authored = concepts[spec.sequence - 1];
    const cause = maps.causeByName.get(authored.cause);
    const organization = spec.linkedKyndOrganization
      ? maps.organizationByName.get(authored.organizationName) : null;
    return {
      title: pick(rng, MANUAL_ACTIVITY_TITLES[cause.name]), cause,
      organization, organizationName: authored.organizationName,
    };
  }

  const shouldMatchUser = chance(rng, 0.86);
  if (spec.linkedKyndOrganization) {
    let candidates = world.organizations.filter((organization) => (
      shouldMatchUser
        ? organization.causes.some((cause) => user.causes.includes(cause))
        : organization.causes.every((cause) => !user.causes.includes(cause))
    ));
    if (!candidates.length) candidates = world.organizations;
    const organization = pick(rng, candidates);
    const matchingCauses = organization.causes.filter((cause) => user.causes.includes(cause));
    const causeName = shouldMatchUser && matchingCauses.length
      ? pick(rng, matchingCauses) : pick(rng, organization.causes);
    const cause = maps.causeByName.get(causeName);
    return {
      title: pick(rng, MANUAL_ACTIVITY_TITLES[causeName]), cause,
      organization, organizationName: organization.name,
    };
  }

  let candidates = EXTERNAL_ACTIVITY_ORGANIZATIONS.filter((item) => (
    shouldMatchUser ? user.causes.includes(item.cause) : !user.causes.includes(item.cause)
  ));
  if (!candidates.length) candidates = EXTERNAL_ACTIVITY_ORGANIZATIONS;
  const external = pick(rng, candidates);
  const cause = maps.causeByName.get(external.cause);
  return {
    title: pick(rng, MANUAL_ACTIVITY_TITLES[cause.name]), cause,
    organization: null, organizationName: external.name,
  };
}

function manualActivity(rng, spec, index, world, maps, usedDatesByUser) {
  const user = maps.userById.get(spec.userId);
  const usedDates = usedDatesByUser.get(user.id);
  const occurredOn = manualOccurredOn(rng, spec, user, usedDates);
  usedDates.add(occurredOn);
  const concept = chooseManualConcept(rng, spec, user, world, maps);
  const forceStory = user.anchor;
  const forceImage = user.displayName === 'Maya Ellis' || (user.displayName === 'David Mercer' && spec.sequence <= 2);
  const hasStory = forceStory || chance(rng, 0.525);
  const hasImage = forceImage || chance(rng, 0.325);
  const hours = user.displayName === 'Maya Ellis' ? 2.5
    : user.displayName === 'David Mercer' ? [3, 2, 2.5][spec.sequence - 1]
      : weightedPick(rng, MANUAL_HOURS.map((item) => ({ ...item, weight: item.weight }))).value;
  const activity = {
    userId: user.id,
    registrationId: null,
    occurredOn,
    hours,
    manualTitle: concept.title,
    manualCauseId: concept.cause.id,
    manualOrgId: concept.organization?.id || null,
    manualOrgName: concept.organizationName,
    story: hasStory ? pick(rng, ACTIVITY_STORIES[concept.cause.name]) : null,
    imageUrl: hasImage
      ? `/demo-assets/activities/${concept.cause.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/manual-${index % 10}.jpg`
      : null,
    createdAt: manualCreatedAt(rng, occurredOn, user),
  };
  return {
    id: deterministicUuid('activity-manual', [
      activity.userId, activity.occurredOn, activity.manualTitle, activity.manualOrgName,
    ].join('|')),
    ...activity,
  };
}

function generateActivities(rng, world) {
  const userById = new Map(world.users.map((user) => [user.id, user]));
  const opportunityById = new Map(world.opportunities.map((item) => [item.id, item]));
  const causeById = new Map(world.causes.map((cause) => [cause.id, cause]));
  const causeByName = new Map(world.causes.map((cause) => [cause.name, cause]));
  const organizationByName = new Map(world.organizations.map((item) => [item.name, item]));
  const maps = { userById, opportunityById, causeById, causeByName, organizationByName };
  const maya = world.users.find((user) => user.displayName === 'Maya Ellis');
  const david = world.users.find((user) => user.displayName === 'David Mercer');
  const { selected, zeroKyndUsers } = selectedKyndRegistrations(rng, world, maya, david);
  const anchorSequence = new Map();
  const kyndActivities = selected.map((row, index) => (
    kyndActivity(rng, row, index, world, maps, anchorSequence)
  ));
  const quotas = allocateManualQuotas(rng, world, maya, david, zeroKyndUsers);
  const specs = manualSpecs(rng, world, quotas, maya, david);
  const usedDatesByUser = new Map(world.users.map((user) => [user.id, new Set()]));
  for (const activity of kyndActivities) usedDatesByUser.get(activity.userId).add(activity.occurredOn);
  const manualActivities = specs.map((spec, index) => (
    manualActivity(rng, spec, index, world, maps, usedDatesByUser)
  ));
  return [...kyndActivities, ...manualActivities];
}

function deriveProfileMetrics(world) {
  const registrationById = new Map(world.registrations.map((row) => [row.id, row]));
  const opportunityById = new Map(world.opportunities.map((item) => [item.id, item]));
  const metrics = new Map(world.users.map((user) => [user.id, {
    hours: 0, activities: 0, organizations: new Set(),
  }]));
  for (const activity of world.activities) {
    const value = metrics.get(activity.userId);
    value.hours += activity.hours;
    value.activities += 1;
    if (activity.registrationId) {
      const opportunity = opportunityById.get(registrationById.get(activity.registrationId).opportunityId);
      if (opportunity.hostOrganizationId) value.organizations.add(`kynd:${opportunity.hostOrganizationId}`);
    } else if (activity.manualOrgId) {
      value.organizations.add(`kynd:${activity.manualOrgId}`);
    } else {
      value.organizations.add(`external:${activity.manualOrgName}`);
    }
  }
  return new Map([...metrics].map(([userId, value]) => [userId, {
    hours: Number(value.hours.toFixed(2)),
    activities: value.activities,
    organizations: value.organizations.size,
    organizationKeys: [...value.organizations].sort(),
  }]));
}

function buildOrganizationPublicImpact(world) {
  const registrationById = new Map(world.registrations.map((row) => [row.id, row]));
  const opportunityById = new Map(world.opportunities.map((item) => [item.id, item]));
  const impact = new Map(world.organizations.map((organization) => [organization.id, {
    completedActivities: 0, totalHours: 0, participants: new Set(), activityIds: [],
  }]));
  for (const activity of world.activities.filter((item) => item.registrationId !== null)) {
    const registration = registrationById.get(activity.registrationId);
    const opportunity = opportunityById.get(registration.opportunityId);
    if (!opportunity.hostOrganizationId) continue;
    const value = impact.get(opportunity.hostOrganizationId);
    value.completedActivities += 1;
    value.totalHours += activity.hours;
    value.participants.add(activity.userId);
    value.activityIds.push(activity.id);
  }
  return new Map([...impact].map(([organizationId, value]) => [organizationId, {
    completedActivities: value.completedActivities,
    totalHours: Number(value.totalHours.toFixed(2)),
    distinctParticipants: value.participants.size,
    activityIds: value.activityIds,
  }]));
}

module.exports = {
  generateActivities,
  deriveProfileMetrics,
  buildOrganizationPublicImpact,
  localCalendarDate,
};
