const CONFIG = require('../config');
const { chance, pick, randomInt, weightedPick } = require('./random');
const { deterministicUuid, stablePick } = require('./ids');
const {
  haversineMiles,
  userOpportunityMiles,
} = require('./geography');
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

const ANCHOR_KYND_ACTIVITY_OVERRIDES = Object.freeze({
  'e9c03813-a217-53f7-a857-6cbf5b689e76': { hours: 4, story: 'Worked alongside neighbors to refresh a shared space and prepare it for the next gathering.', imageUrl: '/demo-assets/activities/community/kynd-4.jpg', createdAt: '2026-03-21T08:00:00.000Z' },
  '376ae75f-2125-5def-8ba9-27829c1bdddf': { hours: 4, story: 'Spent the morning clearing litter along the trail and helping reset a few overgrown sections.', imageUrl: '/demo-assets/activities/environment/kynd-5.jpg', createdAt: '2026-04-15T09:05:00.000Z' },
  '697c33a8-63e3-5928-88a3-45e68164fd43': { hours: 4, story: 'Worked alongside neighbors to refresh a shared space and prepare it for the next gathering.', imageUrl: '/demo-assets/activities/community/kynd-6.jpg', createdAt: '2026-05-23T18:58:00.000Z' },
  '3717cad9-aa45-5f72-959e-917fb1d734ec': { hours: 3, story: 'Packed meal boxes with a great crew and helped organize the final pickup tables.', imageUrl: null, createdAt: '2026-07-14T13:40:00.000Z' },
  '631b9a75-7fe3-5ff7-b027-654f70b72b74': { hours: 4, story: 'Worked alongside neighbors to refresh a shared space and prepare it for the next gathering.', imageUrl: '/demo-assets/activities/community/kynd-10.jpg', createdAt: '2026-03-21T04:23:00.000Z' },
  '9c0e533b-26d3-52da-806d-f2366cba820c': { hours: 4, story: 'Worked alongside neighbors to refresh a shared space and prepare it for the next gathering.', imageUrl: '/demo-assets/activities/community/kynd-11.jpg', createdAt: '2026-03-30T22:43:00.000Z' },
  '3c5e82f3-26b0-5024-b163-4d0b889af1c7': { hours: 1.5, story: 'Set up learning materials and supported students as they worked through the activity stations.', imageUrl: '/demo-assets/activities/education/kynd-0.jpg', createdAt: '2026-05-07T00:53:00.000Z' },
  '38bbd51f-2b34-594a-af07-149b7f5c2a95': { hours: 4, story: 'Prepared career materials and helped the workshop team keep each session running smoothly.', imageUrl: null, createdAt: '2026-06-11T23:18:00.000Z' },
  'e49f883f-8389-5465-b062-1e23e4d782be': { hours: 5, story: null, imageUrl: '/demo-assets/activities/community/kynd-2.jpg', createdAt: '2026-06-21T01:52:00.000Z' },
  '6fc01e98-d7bb-56d5-96e2-d95bb7b01d85': { hours: 1, story: null, imageUrl: '/demo-assets/activities/education/kynd-3.jpg', createdAt: '2026-06-25T07:58:00.000Z' },
  'e4f4c198-47e0-5db6-96f7-a7888aa132c1': { hours: 2, story: null, imageUrl: null, createdAt: '2026-06-27T23:36:00.000Z' },
  'e8691f7a-ba3c-5f5e-bd9b-7bca1c824240': { hours: 3, story: 'Spent a few hours on practical neighborhood work with a crew that made the day feel easy.', imageUrl: null, createdAt: '2026-07-12T01:46:00.000Z' },
  'a0698bf0-0440-5470-af49-08a3d405c297': { hours: 2, story: null, imageUrl: '/demo-assets/activities/veterans/kynd-6.jpg', createdAt: '2026-08-08T03:11:00.000Z' },
});

const ANCHOR_MANUAL_ACTIVITY_OVERRIDES = Object.freeze({
  'Maya Ellis|1': { occurredOn: '2026-08-16', title: 'Westside Community Garden Morning', story: 'Spent a few hours on practical neighborhood work with a crew that made the day feel easy.', imageUrl: '/demo-assets/activities/community/manual-0.jpg', createdAt: '2026-08-17T15:37:00.000Z' },
  'David Mercer|1': { occurredOn: '2026-06-12', title: 'Neighborhood Welcome Day', story: 'Spent a few hours on practical neighborhood work with a crew that made the day feel easy.', imageUrl: '/demo-assets/activities/community/manual-1.jpg', createdAt: '2026-06-13T12:19:00.000Z' },
  'David Mercer|2': { occurredOn: '2026-03-19', title: 'Community Tutoring Session', story: 'Worked with students on assignments and helped them prepare for next week’s project.', imageUrl: '/demo-assets/activities/education/manual-2.jpg', createdAt: '2026-03-21T13:32:00.000Z' },
  'David Mercer|3': { occurredOn: '2026-01-25', title: 'Career Workshop Support', story: 'Prepared career materials and helped the workshop team keep each session running smoothly.', imageUrl: null, createdAt: '2026-01-28T19:14:00.000Z' },
});

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

  function completionTravelWeight(user, opportunity) {
    if (opportunity.isOnline || user.anchor) return 1;
    const miles = userOpportunityMiles(user, opportunity);
    if (miles <= 5) return 1.75;
    if (miles <= 15) return 1.4;
    if (miles <= 30) return 1;
    if (miles <= 60) return 0.48;
    if (miles <= 100) return 0.16;
    return 0.018;
  }

  function implausiblePair(first, second) {
    const firstOpportunity = opportunityById.get(first.opportunityId);
    const secondOpportunity = opportunityById.get(second.opportunityId);
    if (firstOpportunity.isOnline || secondOpportunity.isOnline) return false;
    if (localCalendarDate(firstOpportunity.startsAt)
      !== localCalendarDate(secondOpportunity.startsAt)) return false;
    const betweenMiles = haversineMiles(
      { latitude: firstOpportunity.latitude, longitude: firstOpportunity.longitude },
      { latitude: secondOpportunity.latitude, longitude: secondOpportunity.longitude }
    );
    const ordered = [firstOpportunity, secondOpportunity].sort((a, b) => (
      new Date(a.startsAt) - new Date(b.startsAt)
    ));
    const gapHours = Math.max(0, (
      new Date(ordered[1].startsAt) - new Date(ordered[0].endsAt)
    ) / 3600000);
    return betweenMiles > 60 && betweenMiles > Math.max(30, gapHours * 55);
  }

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
    const rankedCandidates = eligible
      .filter((row) => tierUsers.has(row.userId)
        && !zeroKyndUsers.has(row.userId) && !anchorUserIds.has(row.userId))
      .map((row) => ({
        row,
        key: -Math.log(Math.max(rng(), Number.EPSILON)) / (
          propensity.get(row.userId)
          * completionTravelWeight(
            world.users.find((user) => user.id === row.userId),
            opportunityById.get(row.opportunityId)
          )
        ),
      }))
      .sort((first, second) => first.key - second.key || first.row.id.localeCompare(second.row.id));
    const candidates = [];
    const selectedByUser = new Map();
    for (const { row } of rankedCandidates) {
      if (candidates.length === target - forced.length) break;
      const user = world.users.find((candidate) => candidate.id === row.userId);
      const item = opportunityById.get(row.opportunityId);
      const prior = selectedByUser.get(user.id) || [];
      const longDistanceCount = prior.filter((candidate) => {
        const candidateOpportunity = opportunityById.get(candidate.opportunityId);
        return !candidateOpportunity.isOnline
          && userOpportunityMiles(user, candidateOpportunity) > 100;
      }).length;
      if (!item.isOnline && userOpportunityMiles(user, item) > 100 && longDistanceCount >= 2) continue;
      if (prior.some((candidate) => implausiblePair(candidate, row))) continue;
      candidates.push(row);
      prior.push(row);
      selectedByUser.set(user.id, prior);
    }
    if (forced.length + candidates.length !== target) {
      throw new Error(`Unable to allocate ${target} Kynd activities for ${tier}`);
    }
    selected.push(...forced, ...candidates);
  }
  return { eligible, selected, zeroKyndUsers };
}

function diversifiedManualTitle(baseTitle, spec) {
  const modifiers = [
    'with Neighbors', 'Community Shift', 'Local Team',
    'Volunteer Session', 'Hands-On Day', 'Shared Service',
  ];
  return `${baseTitle} — ${stablePick('manual-activity-title', spec.key, modifiers)}`;
}

function diversifiedStory(baseStory, key) {
  const reflections = [
    'The team made steady progress and left a clear handoff for the next group.',
    'It was a practical few hours with neighbors who kept the work moving.',
    'The host explained how the work connects to the program beyond this one shift.',
    'I appreciated having a clear role and seeing what the group completed together.',
    'We wrapped up by organizing materials and sharing a quick update with the coordinator.',
    'The small-group format made it easy to contribute and learn from the people there.',
  ];
  return `${baseStory} ${stablePick('activity-story-reflection', key, reflections)}`;
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
  const activity = {
    id: deterministicUuid('activity-registration', row.id),
    userId: row.userId,
    registrationId: row.id,
    occurredOn: localCalendarDate(opportunity.startsAt),
    hours,
    manualTitle: null,
    manualCauseId: null,
    manualOrgId: null,
    manualOrgName: null,
    story: hasStory
      ? (user.anchor
        ? pick(rng, ACTIVITY_STORIES[cause.name])
        : diversifiedStory(pick(rng, ACTIVITY_STORIES[cause.name]), row.id))
      : null,
    imageUrl: hasImage
      ? `/demo-assets/activities/${cause.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/kynd-${index % 12}.jpg`
      : null,
    createdAt: confirmationTimestamp(rng, opportunity.endsAt),
  };
  return { ...activity, ...(ANCHOR_KYND_ACTIVITY_OVERRIDES[row.id] || {}) };
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
      title: diversifiedManualTitle(pick(rng, MANUAL_ACTIVITY_TITLES[causeName]), spec), cause,
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
    title: diversifiedManualTitle(pick(rng, MANUAL_ACTIVITY_TITLES[cause.name]), spec), cause,
    organization: null, organizationName: external.name,
  };
}

function manualActivity(rng, spec, index, world, maps, usedDatesByUser) {
  const user = maps.userById.get(spec.userId);
  const usedDates = usedDatesByUser.get(user.id);
  const authored = ANCHOR_MANUAL_ACTIVITY_OVERRIDES[`${user.displayName}|${spec.sequence}`];
  const generatedOccurredOn = manualOccurredOn(rng, spec, user, usedDates);
  const occurredOn = authored?.occurredOn || generatedOccurredOn;
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
    story: hasStory
      ? (user.anchor
        ? pick(rng, ACTIVITY_STORIES[concept.cause.name])
        : diversifiedStory(pick(rng, ACTIVITY_STORIES[concept.cause.name]), spec.key))
      : null,
    imageUrl: hasImage
      ? `/demo-assets/activities/${concept.cause.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/manual-${index % 10}.jpg`
      : null,
    createdAt: manualCreatedAt(rng, occurredOn, user),
  };
  if (authored) {
    activity.manualTitle = authored.title;
    activity.story = authored.story;
    activity.imageUrl = authored.imageUrl;
    activity.createdAt = authored.createdAt;
  }
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
