const CONFIG = require('../config');
const { randomInt, pick, chance, weightedPick } = require('./random');
const { deterministicUuid, stablePick, stableUnitInterval } = require('./ids');
const {
  OPPORTUNITY_ARCHETYPES,
  PHYSICAL_LOCATIONS,
  ANCHOR_OPPORTUNITIES,
} = require('../data/opportunities');

const DAY_MS = 24 * 60 * 60 * 1000;

const SCHEDULE_PROFILES = Object.freeze({
  weekend_morning: { days: [0, 6], starts: ['08:30', '09:00', '09:30', '10:00'] },
  weekend_day: { days: [0, 6], starts: ['11:00', '13:00', '14:00'] },
  weekday_evening: { days: [1, 2, 3, 4, 5], starts: ['17:30', '18:00', '18:30'] },
  weekday_daytime: { days: [1, 2, 3, 4, 5], starts: ['09:00', '10:00', '13:00'] },
});

const ORGANIZATION_ACTIVITY = Object.freeze({
  community: { activeChance: 0.68, weight: 1, cap: 13 },
  established: { activeChance: 0.92, weight: 2.1, cap: 18 },
  high_visibility: { activeChance: 1, weight: 3.5, cap: 24 },
});

const USER_ACTIVITY = Object.freeze({
  light: { activeChance: 0.06, weight: 0.6, cap: 2 },
  regular: { activeChance: 0.22, weight: 1.4, cap: 4 },
  highly_active: { activeChance: 0.58, weight: 2.8, cap: 6 },
  connector: { activeChance: 0.9, weight: 4.5, cap: 8 },
});

function shuffled(rng, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(rng, 0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function repeated(value, count) {
  return Array.from({ length: count }, () => value);
}

function localDateAtOffset(dayOffset) {
  const anchorDate = CONFIG.anchorDate.slice(0, 10);
  const date = new Date(`${anchorDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function nthSunday(year, monthIndex, occurrence) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const firstSunday = 1 + ((7 - first.getUTCDay()) % 7);
  return firstSunday + (occurrence - 1) * 7;
}

function easternOffsetForDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const dstStart = `${year}-03-${String(nthSunday(year, 2, 2)).padStart(2, '0')}`;
  const dstEnd = `${year}-11-${String(nthSunday(year, 10, 1)).padStart(2, '0')}`;
  const current = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return current >= dstStart && current < dstEnd ? '-04:00' : '-05:00';
}

function easternDateTime(dayOffset, time) {
  const dateString = localDateAtOffset(dayOffset);
  return new Date(`${dateString}T${time}:00${easternOffsetForDate(dateString)}`).toISOString();
}

function dayOfWeek(dayOffset) {
  return new Date(`${localDateAtOffset(dayOffset)}T12:00:00Z`).getUTCDay();
}

function regionForEntity(entity) {
  return ['Atlanta', 'Decatur', 'Sandy Springs', 'Brookhaven', 'Marietta', 'Smyrna', 'Roswell', 'Alpharetta']
    .includes(entity.city)
    ? 'atlanta_metro'
    : 'other_georgia';
}

function chooseWeightedItem(rng, items, weightForItem) {
  return weightedPick(rng, items.map((item) => ({
    item,
    weight: weightForItem(item),
  }))).item;
}

function chooseProfileAndOffset(rng, archetype, bucket, host) {
  const profiles = shuffled(rng, archetype.schedules);
  const hostAgeDays = Math.floor(
    (new Date(CONFIG.anchorDate).getTime() - new Date(host.createdAt).getTime()) / DAY_MS
  );

  for (const profileName of profiles) {
    const profile = SCHEDULE_PROFILES[profileName];
    let ranges;

    if (bucket === 'upcoming') {
      ranges = [
        { min: 0, max: 0, weight: 0.025 },
        { min: 1, max: 7, weight: 0.155 },
        { min: 8, max: 14, weight: 0.18 },
        { min: 15, max: 30, weight: 0.29 },
        { min: 31, max: 90, weight: 0.35 },
      ];
    } else if (bucket === 'recent_past') {
      ranges = [{ min: -Math.min(180, hostAgeDays - 3), max: -1, weight: 1 }];
    } else if (bucket === 'farther_future') {
      ranges = [{ min: 91, max: 180, weight: 1 }];
    } else {
      ranges = [
        { min: -Math.min(180, hostAgeDays - 3), max: -1, weight: 0.4 },
        { min: 0, max: 90, weight: 0.45 },
        { min: 91, max: 180, weight: 0.15 },
      ];
    }

    const viableRanges = ranges
      .map((range) => ({
        ...range,
        offsets: Array.from(
          { length: Math.max(0, range.max - range.min + 1) },
          (_, index) => range.min + index
        ).filter((offset) => profile.days.includes(dayOfWeek(offset))),
      }))
      .filter((range) => range.offsets.length > 0);

    if (viableRanges.length) {
      const range = weightedPick(rng, viableRanges);
      return { profile, dayOffset: pick(rng, range.offsets) };
    }
  }

  throw new Error(`No viable schedule for ${archetype.key} in ${bucket}`);
}

function chooseStartTime(rng, profile, dayOffset, bucket) {
  const anchor = new Date(CONFIG.anchorDate).getTime();
  const choices = profile.starts.filter((time) => {
    if (bucket !== 'upcoming' || dayOffset !== 0) return true;
    return new Date(easternDateTime(dayOffset, time)).getTime() > anchor;
  });
  if (!choices.length) return null;
  return pick(rng, choices);
}

function chooseLocation(rng, host, targetRegion, hostType) {
  const regionLocations = PHYSICAL_LOCATIONS.filter(
    (location) => location.region === targetRegion
  );
  const localLocations = regionLocations.filter((location) => location.city === host.city);
  const localChance = hostType === 'user' ? 0.9 : 0.75;
  return localLocations.length && chance(rng, localChance)
    ? pick(rng, localLocations)
    : pick(rng, regionLocations);
}

function createdBeforeStart(rng, hostCreatedAt, startsAt) {
  const start = new Date(startsAt).getTime();
  const anchor = new Date(CONFIG.anchorDate).getTime();
  const lower = Math.max(new Date(hostCreatedAt).getTime(), start - 365 * DAY_MS);
  const upper = Math.min(anchor, start - 60 * 60 * 1000);
  if (lower > upper) {
    throw new Error(
      `Opportunity host did not exist early enough: host=${hostCreatedAt}, start=${startsAt}`
    );
  }
  return new Date(lower + Math.floor(rng() * (upper - lower + 1))).toISOString();
}

function generatedCharityCapacity(key, mode, legacyCapacity) {
  const roll = stableUnitInterval('charity-capacity-band', key);
  const pools = mode === 'online'
    ? {
      small: [12, 15, 18, 20, 24],
      community: [30, 35, 40, 50],
      regional: [60, 75, 100],
    }
    : {
      small: [12, 15, 18, 20, 24],
      community: [30, 35, 40, 50],
      regional: [60, 75, 100],
    };
  if (roll < 0.28) return stablePick('charity-capacity-small', key, pools.small);
  if (roll < 0.60) return stablePick('charity-capacity-community', key, pools.community);
  if (roll < 0.82) return stablePick('charity-capacity-regional', key, pools.regional);
  return legacyCapacity;
}

function diversifiedOpportunityCopy(key, baseTitle, archetype, location) {
  const physicalModifiers = [
    `${location?.city || 'Local'} Crew`, 'Local Action Day', 'Neighbor Meetup', 'Community Edition',
    'Morning Team', 'Weekend Session', 'Hands-On Day', 'Fall Gathering',
    'Small-Group Shift', 'Open Community', 'Local Workday', 'Neighborhood Team',
  ];
  const onlineModifiers = [
    'Online Meetup', 'Remote Team', 'Virtual Session', 'Community Online',
    'Evening Online', 'Remote Workgroup', 'Digital Gathering', 'Virtual Team',
    'Online Workday', 'Open Session', 'Community Call', 'Remote Workshop',
  ];
  const titleModifier = stablePick(
    'opportunity-title-modifier', key, location ? physicalModifiers : onlineModifiers
  );
  const setting = location ? `in ${location.city}` : 'in a facilitated online room';
  const descriptionDetails = [
    `The session is designed for neighbors who want a practical way to contribute ${setting}.`,
    `Participants will work in a welcoming group with clear guidance from the host team ${setting}.`,
    `This is a focused, community-scale opportunity with an approachable role for each participant ${setting}.`,
    `The host will connect the work to its local impact and help participants find a useful role ${setting}.`,
    `The format balances hands-on contribution with time to learn about the program's ongoing work ${setting}.`,
    `New and returning participants can contribute at a comfortable pace alongside the host team ${setting}.`,
    `The gathering offers a concrete next step for people who care about this cause ${setting}.`,
    `Participants will see how a short shared effort supports the host's broader community work ${setting}.`,
  ];
  const taskDetails = [
    'The host will divide the group into clear roles and close with a short team reset.',
    'Participants will check in together, choose a role, and help leave materials ready for the next group.',
    'A coordinator will demonstrate the workflow before participants move into small teams.',
    'The group will share progress midway through the session and finish with an organized handoff.',
    'Participants can rotate between two practical roles based on comfort and experience.',
    'The host team will provide a brief kickoff, role cards, and a clear end-of-session wrap-up.',
    'Work will be organized in small groups so participants can ask questions as they go.',
    'Participants will follow a simple checklist and help document what the group completes.',
  ];
  const requirementDetails = location ? [
    'Please arrive 10 minutes early for check-in.',
    'Accessibility questions can be shared with the host before the event.',
    'Bring a reusable water bottle and review the host note before arrival.',
    'The host will send final arrival details to registered participants.',
  ] : [
    'A brief access note will be sent to registered participants.',
    'Please join a few minutes early to confirm audio and access.',
    'Participants may keep cameras off unless a role specifically requires video.',
    'The host will provide the working links and materials before the session.',
  ];
  return {
    title: `${baseTitle} — ${titleModifier}`,
    description: `${archetype.description} ${stablePick('opportunity-description', key, descriptionDetails)}`,
    tasks: `${archetype.tasks} ${stablePick('opportunity-tasks', key, taskDetails)}`,
    requirements: `${archetype.requirements} ${stablePick('opportunity-requirements', key, requirementDetails)}`,
  };
}

function opportunityRow({
  key,
  title,
  cause,
  type,
  host,
  hostType,
  description,
  tasks,
  requirements,
  startsAt,
  duration,
  capacity,
  status,
  location,
  anchor = false,
  anchorKey = null,
  flagship = false,
  davidAnchor = false,
  archetypeKey = null,
  timeBucket,
  createdAt,
}) {
  const isOnline = location === null;
  return {
    id: deterministicUuid('opportunity', key),
    title,
    opportunityType: type,
    causeId: cause.id,
    hostUserId: hostType === 'user' ? host.id : null,
    hostOrganizationId: hostType === 'organization' ? host.id : null,
    description,
    whatYoullDo: tasks,
    requirements,
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + duration * 60 * 1000).toISOString(),
    isOnline,
    locationName: location ? location.name : null,
    city: location ? location.city : null,
    state: location ? location.state : null,
    latitude: location ? location.latitude : null,
    longitude: location ? location.longitude : null,
    capacity,
    imageUrl: anchor
      ? `/demo-assets/opportunities/anchors/${anchorKey}.jpg`
      : `/demo-assets/opportunities/${cause.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${archetypeKey}.jpg`,
    status,
    createdAt,
    timeBucket,
    geography: isOnline ? 'online' : location.region,
    archetypeKey,
    anchor,
    anchorKey,
    flagship,
    davidAnchor,
  };
}

function generateAnchorOpportunities(rng, causes, users, organizations) {
  const causeByName = new Map(causes.map((cause) => [cause.name, cause]));
  const userByName = new Map(users.map((user) => [user.displayName, user]));
  const organizationByName = new Map(
    organizations.map((organization) => [organization.name, organization])
  );
  const locationByKey = new Map(PHYSICAL_LOCATIONS.map((location) => [location.key, location]));

  return ANCHOR_OPPORTUNITIES.map((specification) => {
    const hostType = specification.hostUser ? 'user' : 'organization';
    const host = specification.hostUser
      ? userByName.get(specification.hostUser)
      : organizationByName.get(specification.hostOrganization);
    const startsAt = easternDateTime(specification.dayOffset, specification.startTime);
    return opportunityRow({
      key: `anchor-${specification.key}`,
      title: specification.title,
      cause: causeByName.get(specification.cause),
      type: specification.type,
      host,
      hostType,
      description: specification.description,
      tasks: specification.tasks,
      requirements: specification.requirements,
      startsAt,
      duration: specification.duration,
      capacity: specification.capacity,
      status: 'published',
      location: locationByKey.get(specification.locationKey),
      anchor: true,
      anchorKey: specification.key,
      flagship: Boolean(specification.flagship),
      davidAnchor: Boolean(specification.davidAnchor),
      timeBucket: 'upcoming',
      createdAt: createdBeforeStart(rng, host.createdAt, startsAt),
    });
  });
}

function activeHosts(rng, entities, settings, requiredNames, nameKey) {
  return entities.filter((entity) => (
    requiredNames.has(entity[nameKey]) || chance(rng, settings[entity.tier].activeChance)
  ));
}

function chooseHost(rng, hostType, region, pools, counts) {
  const settings = hostType === 'organization' ? ORGANIZATION_ACTIVITY : USER_ACTIVITY;
  const pool = hostType === 'organization' ? pools.organizations : pools.users;
  let candidates = pool.filter((host) => (
    (!region || regionForEntity(host) === region)
    && counts.get(host.id) < settings[host.tier].cap
  ));

  if (!candidates.length) {
    candidates = pool.filter((host) => !region || regionForEntity(host) === region);
  }

  return chooseWeightedItem(rng, candidates, (host) => {
    const anchorBoost = host.anchor ? 1.2 : 1;
    return settings[host.tier].weight * anchorBoost / (1 + counts.get(host.id) * 0.32);
  });
}

function buildGeneratedSlots(rng) {
  const targets = CONFIG.opportunityTargets;
  const anchorOrganizationCount = ANCHOR_OPPORTUNITIES.filter(
    (opportunity) => opportunity.hostOrganization
  ).length;
  const anchorUserCount = ANCHOR_OPPORTUNITIES.length - anchorOrganizationCount;
  const anchorVolunteerCount = ANCHOR_OPPORTUNITIES.filter(
    (opportunity) => opportunity.type === 'volunteer'
  ).length;
  const anchorCharityCount = ANCHOR_OPPORTUNITIES.length - anchorVolunteerCount;
  const hostTypes = shuffled(rng, [
    ...repeated('organization', targets.hosts.organization - anchorOrganizationCount),
    ...repeated('user', targets.hosts.user - anchorUserCount),
  ]);
  const types = shuffled(rng, [
    ...repeated('volunteer', targets.types.volunteer - anchorVolunteerCount),
    ...repeated('charity_event', targets.types.charityEvent - anchorCharityCount),
  ]);
  const timeBuckets = shuffled(rng, [
    ...repeated('upcoming', targets.time.upcoming - ANCHOR_OPPORTUNITIES.length),
    ...repeated('recent_past', targets.time.recentPast),
    ...repeated('farther_future', targets.time.fartherFuture),
    ...repeated('cancelled', targets.time.cancelled),
  ]);
  const geographies = shuffled(rng, [
    ...repeated('online', targets.geography.online),
    ...repeated(
      'atlanta_metro',
      targets.geography.atlantaMetroPhysical - ANCHOR_OPPORTUNITIES.length
    ),
    ...repeated('other_georgia', targets.geography.otherGeorgiaPhysical),
  ]);

  return hostTypes.map((hostType, index) => ({
    hostType,
    type: types[index],
    timeBucket: timeBuckets[index],
    geography: geographies[index],
  }));
}

function generateOpportunities(rng, causes, users, organizations) {
  const causeByName = new Map(causes.map((cause) => [cause.name, cause]));
  const opportunities = generateAnchorOpportunities(rng, causes, users, organizations);
  const organizationCounts = new Map(organizations.map((organization) => [organization.id, 0]));
  const userCounts = new Map(users.map((user) => [user.id, 0]));
  const causeCounts = new Map(causes.map((cause) => [cause.name, 0]));

  for (const opportunity of opportunities) {
    const counts = opportunity.hostOrganizationId ? organizationCounts : userCounts;
    const hostId = opportunity.hostOrganizationId || opportunity.hostUserId;
    counts.set(hostId, counts.get(hostId) + 1);
    const causeName = causes.find((cause) => cause.id === opportunity.causeId).name;
    causeCounts.set(causeName, causeCounts.get(causeName) + 1);
  }

  const pools = {
    organizations: activeHosts(
      rng,
      organizations,
      ORGANIZATION_ACTIVITY,
      new Set(ANCHOR_OPPORTUNITIES.map((item) => item.hostOrganization).filter(Boolean)),
      'name'
    ),
    users: activeHosts(
      rng,
      users,
      USER_ACTIVITY,
      new Set(['David Mercer']),
      'displayName'
    ),
  };
  const slots = buildGeneratedSlots(rng);

  slots.forEach((slot, index) => {
    const region = slot.geography === 'online' ? null : slot.geography;
    const counts = slot.hostType === 'organization' ? organizationCounts : userCounts;
    const host = chooseHost(rng, slot.hostType, region, pools, counts);
    const causeName = chooseWeightedItem(rng, host.causes, (name) => (
      1 / (1 + causeCounts.get(name) / 30)
    ));
    const mode = slot.geography === 'online' ? 'online' : 'physical';
    const candidates = OPPORTUNITY_ARCHETYPES.filter((item) => (
      item.cause === causeName && item.type === slot.type && item.mode === mode
    ));
    const selectedArchetype = pick(rng, candidates);
    const { profile, dayOffset } = chooseProfileAndOffset(
      rng,
      selectedArchetype,
      slot.timeBucket,
      host
    );
    let startTime = chooseStartTime(rng, profile, dayOffset, slot.timeBucket);
    if (!startTime) startTime = '14:00';
    const startsAt = easternDateTime(dayOffset, startTime);
    const duration = pick(rng, selectedArchetype.durations);
    let capacities = selectedArchetype.capacity;
    if (slot.hostType === 'user') {
      const maximum = slot.type === 'volunteer' ? 30 : 100;
      capacities = capacities.filter((capacity) => capacity <= maximum);
      if (!capacities.length) capacities = slot.type === 'volunteer' ? [10, 15, 20] : [50, 75, 100];
    }
    const location = mode === 'online'
      ? null
      : chooseLocation(rng, host, slot.geography, slot.hostType);
    const key = `generated-${String(index + 1).padStart(4, '0')}`;
    const baseTitle = pick(rng, selectedArchetype.titles);
    const copy = diversifiedOpportunityCopy(key, baseTitle, selectedArchetype, location);
    const legacyCapacity = pick(rng, capacities);
    const capacity = slot.type === 'charity_event'
      ? generatedCharityCapacity(key, mode, legacyCapacity)
      : legacyCapacity;

    opportunities.push(opportunityRow({
      key,
      title: copy.title,
      cause: causeByName.get(causeName),
      type: slot.type,
      host,
      hostType: slot.hostType,
      description: copy.description,
      tasks: copy.tasks,
      requirements: copy.requirements,
      startsAt,
      duration,
      capacity,
      status: slot.timeBucket === 'cancelled' ? 'cancelled' : 'published',
      location,
      archetypeKey: selectedArchetype.key,
      timeBucket: slot.timeBucket,
      createdAt: createdBeforeStart(rng, host.createdAt, startsAt),
    }));
    counts.set(host.id, counts.get(host.id) + 1);
    causeCounts.set(causeName, causeCounts.get(causeName) + 1);
  });

  return opportunities;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((first, second) => first - second);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

function rounded(value) {
  return Number(value.toFixed(2));
}

function distribution(values) {
  return {
    min: Math.min(...values),
    median: median(values),
    average: rounded(average(values)),
    p75: percentile(values, 0.75),
    p90: percentile(values, 0.9),
    max: Math.max(...values),
  };
}

function durationMinutes(opportunity) {
  return (new Date(opportunity.endsAt) - new Date(opportunity.startsAt)) / 60000;
}

function commitmentBucket(minutes) {
  if (minutes < 60) return 'underOneHour';
  if (minutes <= 180) return 'oneToThreeHours';
  if (minutes <= 300) return 'halfDay';
  return 'fullDay';
}

function describedOpportunity(opportunity, world) {
  const causeById = new Map(world.causes.map((cause) => [cause.id, cause.name]));
  const userById = new Map(world.users.map((user) => [user.id, user.displayName]));
  const organizationById = new Map(
    world.organizations.map((organization) => [organization.id, organization.name])
  );
  return {
    title: opportunity.title,
    host: opportunity.hostUserId
      ? userById.get(opportunity.hostUserId)
      : organizationById.get(opportunity.hostOrganizationId),
    cause: causeById.get(opportunity.causeId),
    type: opportunity.opportunityType,
    status: opportunity.status,
    timeBucket: opportunity.timeBucket,
    location: opportunity.isOnline
      ? 'Online'
      : `${opportunity.locationName}, ${opportunity.city}, ${opportunity.state}`,
    startsAt: opportunity.startsAt,
    endsAt: opportunity.endsAt,
    durationMinutes: durationMinutes(opportunity),
    capacity: opportunity.capacity,
    description: opportunity.description,
    whatYoullDo: opportunity.whatYoullDo,
    requirements: opportunity.requirements,
    flagship: opportunity.flagship,
    davidAnchor: opportunity.davidAnchor,
  };
}

function representativeSample(world) {
  const generated = world.opportunities.filter((opportunity) => !opportunity.anchor);
  const selected = [];
  const selectedIds = new Set();
  const add = (opportunity) => {
    if (opportunity && !selectedIds.has(opportunity.id) && selected.length < 15) {
      selected.push(opportunity);
      selectedIds.add(opportunity.id);
    }
  };
  const causeById = new Map(world.causes.map((cause) => [cause.id, cause.name]));

  world.causes.forEach((cause, index) => {
    const preferred = generated.find((opportunity) => (
      opportunity.causeId === cause.id
      && (index % 2 === 0 ? opportunity.isOnline : !opportunity.isOnline)
      && (index % 3 === 0
        ? opportunity.opportunityType === 'charity_event'
        : opportunity.opportunityType === 'volunteer')
    ));
    add(preferred || generated.find((opportunity) => opportunity.causeId === cause.id));
  });

  const predicates = [
    (item) => item.hostUserId && item.geography === 'other_georgia',
    (item) => item.hostUserId && item.isOnline,
    (item) => item.opportunityType === 'charity_event' && item.geography === 'other_georgia',
    (item) => item.timeBucket === 'recent_past' && item.hostUserId,
    (item) => item.timeBucket === 'farther_future' && item.isOnline,
    (item) => item.timeBucket === 'cancelled',
  ];
  predicates.forEach((predicate) => add(generated.find(predicate)));
  generated
    .filter((item) => !selectedIds.has(item.id))
    .sort((first, second) => (
      causeById.get(first.causeId).localeCompare(causeById.get(second.causeId))
      || first.id.localeCompare(second.id)
    ))
    .forEach(add);

  return selected.map((opportunity) => describedOpportunity(opportunity, world));
}

function buildOpportunityDiagnostics(world) {
  const opportunities = world.opportunities;
  const opportunityDate = (item) => item.startsAt.slice(0, 10);
  const userById = new Map(world.users.map((user) => [user.id, user]));
  const organizationById = new Map(
    world.organizations.map((organization) => [organization.id, organization])
  );
  const organizationCounts = new Map(
    world.organizations.map((organization) => [organization.id, 0])
  );
  const userCounts = new Map(world.users.map((user) => [user.id, 0]));
  opportunities.forEach((opportunity) => {
    const counts = opportunity.hostOrganizationId ? organizationCounts : userCounts;
    const id = opportunity.hostOrganizationId || opportunity.hostUserId;
    counts.set(id, counts.get(id) + 1);
  });
  const organizationValues = [...organizationCounts.values()];
  const userHostingValues = [...userCounts.values()].filter((count) => count > 0);
  const capacities = opportunities.map((opportunity) => opportunity.capacity);
  const durations = opportunities.map(durationMinutes);
  const upcoming = opportunities.filter((opportunity) => opportunity.timeBucket === 'upcoming');
  const weekendCount = opportunities.filter((opportunity) => (
    [0, 6].includes(new Date(opportunity.startsAt).getUTCDay())
  )).length;
  const topOrganizations = world.organizations
    .map((organization) => ({
      name: organization.name,
      tier: organization.tier,
      opportunities: organizationCounts.get(organization.id),
    }))
    .sort((first, second) => (
      second.opportunities - first.opportunities || first.name.localeCompare(second.name)
    ))
    .slice(0, 10);

  const capacityBy = (predicate) => distribution(
    opportunities.filter(predicate).map((opportunity) => opportunity.capacity)
  );

  return {
    hostMix: {
      organizationHosted: opportunities.filter((item) => item.hostOrganizationId).length,
      userHosted: opportunities.filter((item) => item.hostUserId).length,
    },
    typeMix: {
      volunteer: opportunities.filter((item) => item.opportunityType === 'volunteer').length,
      charityEvent: opportunities.filter((item) => item.opportunityType === 'charity_event').length,
    },
    timeAndStatus: Object.fromEntries(
      ['upcoming', 'recent_past', 'farther_future', 'cancelled'].map((bucket) => [
        bucket,
        opportunities.filter((item) => item.timeBucket === bucket).length,
      ])
    ),
    nearTerm: {
      today: upcoming.filter((item) => opportunityDate(item) === localDateAtOffset(0)).length,
      next7Days: upcoming.filter((item) => opportunityDate(item) <= localDateAtOffset(7)).length,
      next14Days: upcoming.filter((item) => opportunityDate(item) <= localDateAtOffset(14)).length,
      next30Days: upcoming.filter((item) => opportunityDate(item) <= localDateAtOffset(30)).length,
      days31To90: upcoming.filter((item) => (
        opportunityDate(item) > localDateAtOffset(30)
        && opportunityDate(item) <= localDateAtOffset(90)
      )).length,
    },
    geography: {
      online: opportunities.filter((item) => item.isOnline).length,
      onlineShare: rounded(opportunities.filter((item) => item.isOnline).length / opportunities.length),
      physical: opportunities.filter((item) => !item.isOnline).length,
      physicalShare: rounded(opportunities.filter((item) => !item.isOnline).length / opportunities.length),
      atlantaMetroPhysical: opportunities.filter((item) => item.geography === 'atlanta_metro').length,
      otherGeorgiaPhysical: opportunities.filter((item) => item.geography === 'other_georgia').length,
      physicalInHostCity: opportunities.filter((item) => {
        if (item.isOnline) return false;
        const host = item.hostUserId
          ? userById.get(item.hostUserId)
          : organizationById.get(item.hostOrganizationId);
        return item.city === host.city;
      }).length,
      physicalInHostCityShare: rounded(opportunities.filter((item) => {
        if (item.isOnline) return false;
        const host = item.hostUserId
          ? userById.get(item.hostUserId)
          : organizationById.get(item.hostOrganizationId);
        return item.city === host.city;
      }).length / opportunities.filter((item) => !item.isOnline).length),
      byTimeBucket: Object.fromEntries(
        ['upcoming', 'recent_past', 'farther_future', 'cancelled'].map((bucket) => {
          const items = opportunities.filter((item) => item.timeBucket === bucket);
          return [bucket, {
            online: items.filter((item) => item.isOnline).length,
            atlantaMetroPhysical: items.filter((item) => item.geography === 'atlanta_metro').length,
            otherGeorgiaPhysical: items.filter((item) => item.geography === 'other_georgia').length,
          }];
        })
      ),
    },
    byCause: Object.fromEntries(world.causes.map((cause) => [
      cause.name,
      opportunities.filter((item) => item.causeId === cause.id).length,
    ])),
    organizationHosting: {
      averagePerOrganization: rounded(average(organizationValues)),
      median: median(organizationValues),
      maximum: Math.max(...organizationValues),
      organizationsWithZero: organizationValues.filter((count) => count === 0).length,
      byTier: Object.fromEntries(CONFIG.organizationTiers.map(({ name }) => {
        const organizations = world.organizations.filter((item) => item.tier === name);
        const counts = organizations.map((item) => organizationCounts.get(item.id));
        return [name, {
          organizations: organizations.length,
          opportunities: counts.reduce((sum, count) => sum + count, 0),
          average: rounded(average(counts)),
          zeroHosts: counts.filter((count) => count === 0).length,
        }];
      })),
      topHosts: topOrganizations,
    },
    userHosting: {
      hostingUsers: userHostingValues.length,
      averageAmongHostingUsers: rounded(average(userHostingValues)),
      medianAmongHostingUsers: median(userHostingValues),
      maximum: Math.max(...userHostingValues),
      usersWithZero: [...userCounts.values()].filter((count) => count === 0).length,
      zeroShare: rounded([...userCounts.values()].filter((count) => count === 0).length / world.users.length),
      byTier: Object.fromEntries(CONFIG.userTiers.map(({ name }) => {
        const users = world.users.filter((item) => item.tier === name);
        const counts = users.map((item) => userCounts.get(item.id));
        return [name, {
          users: users.length,
          hostingUsers: counts.filter((count) => count > 0).length,
          opportunities: counts.reduce((sum, count) => sum + count, 0),
          averageAmongAllUsers: rounded(average(counts)),
        }];
      })),
    },
    capacity: {
      overall: distribution(capacities),
      volunteer: capacityBy((item) => item.opportunityType === 'volunteer'),
      charityEvent: capacityBy((item) => item.opportunityType === 'charity_event'),
      organizationHosted: capacityBy((item) => item.hostOrganizationId),
      userHosted: capacityBy((item) => item.hostUserId),
    },
    duration: {
      ...distribution(durations),
      commitment: Object.fromEntries(
        ['underOneHour', 'oneToThreeHours', 'halfDay', 'fullDay'].map((bucket) => [
          bucket,
          durations.filter((minutes) => commitmentBucket(minutes) === bucket).length,
        ])
      ),
    },
    scheduling: {
      weekend: weekendCount,
      weekendShare: rounded(weekendCount / opportunities.length),
      weekday: opportunities.length - weekendCount,
      weekdayShare: rounded((opportunities.length - weekendCount) / opportunities.length),
      nearTermWeekend: upcoming.filter((item) => (
        opportunityDate(item) <= localDateAtOffset(14)
        && [0, 6].includes(new Date(item.startsAt).getUTCDay())
      )).length,
    },
    anchors: opportunities
      .filter((opportunity) => opportunity.anchor)
      .map((opportunity) => describedOpportunity(opportunity, world)),
    representativeSample: representativeSample(world),
  };
}

module.exports = {
  generateOpportunities,
  buildOpportunityDiagnostics,
  commitmentBucket,
  durationMinutes,
};
