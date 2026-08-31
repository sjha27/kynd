const CONFIG = require('./config');
const { createRng, randomInt, pick, chance, weightedPick } = require('./lib/random');
const { deterministicUuid } = require('./lib/ids');
const { validateWorld } = require('./lib/validate');
const {
  generateOpportunities,
  buildOpportunityDiagnostics,
} = require('./lib/opportunities');
const {
  CAUSES, FIRST_NAMES, LAST_NAMES, ATLANTA_METRO_LOCATIONS,
  GEORGIA_LOCATIONS, ORGANIZATION_PREFIXES, ORGANIZATION_NOUNS, USER_BIOS,
} = require('./data/content');
const { ANCHOR_USERS, ANCHOR_ORGANIZATIONS } = require('./data/anchors');

const USER_FOLLOW_BASE = Object.freeze({
  light: 8, regular: 13, highly_active: 18, connector: 28,
});
const ORGANIZATION_FOLLOW_BASE = Object.freeze({
  light: 6, regular: 11, highly_active: 16, connector: 23,
});
const USER_VISIBILITY_BONUS = Object.freeze({
  light: 0, regular: 0.5, highly_active: 2, connector: 5,
});
const ORGANIZATION_VISIBILITY_BONUS = Object.freeze({
  community: 0, established: 2, high_visibility: 5,
});
const ATLANTA_METRO_KEYS = new Set(
  ATLANTA_METRO_LOCATIONS.map(({ city, state }) => `${city}|${state}`)
);

function dateBeforeAnchor(rng, minDays, maxDays) {
  const anchor = new Date(CONFIG.anchorDate);
  anchor.setUTCDate(anchor.getUTCDate() - randomInt(rng, minDays, maxDays));
  return anchor.toISOString();
}

function dateBetween(rng, firstDate, secondDate) {
  const start = new Date(firstDate).getTime();
  const end = new Date(secondDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    throw new Error(`Invalid deterministic date range: ${firstDate} to ${secondDate}`);
  }
  return new Date(start + Math.floor(rng() * (end - start + 1))).toISOString();
}

function latestDate(...dates) {
  return new Date(Math.max(...dates.map((date) => new Date(date).getTime()))).toISOString();
}

function locationKey(entity) {
  return `${entity.city}|${entity.state}`;
}

function isAtlantaMetro(entity) {
  return ATLANTA_METRO_KEYS.has(locationKey(entity));
}

function sharedCauseCount(first, second) {
  const secondCauses = new Set(second.causes);
  return first.causes.filter((cause) => secondCauses.has(cause)).length;
}

function generateCauses() {
  return CAUSES.map((name, index) => ({
    id: deterministicUuid('cause', name), name, sortOrder: index + 1,
  }));
}

function generateUsers(rng) {
  const users = [];
  const usedNames = new Set();
  for (const anchor of ANCHOR_USERS) {
    usedNames.add(anchor.displayName);
    users.push({
      id: deterministicUuid('user-anchor', anchor.key),
      displayName: anchor.displayName,
      avatarUrl: null,
      bio: anchor.bio,
      city: anchor.city,
      state: anchor.state,
      tier: anchor.tier,
      causes: anchor.causes,
      anchor: true,
      createdAt: dateBeforeAnchor(rng, 180, 720),
    });
  }

  while (users.length < CONFIG.counts.users) {
    let displayName;
    do {
      displayName = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
    } while (usedNames.has(displayName));
    usedNames.add(displayName);

    const tier = weightedPick(rng, CONFIG.userTiers).name;
    const location = chance(rng, CONFIG.geography.atlantaMetroShare)
      ? pick(rng, ATLANTA_METRO_LOCATIONS)
      : pick(rng, GEORGIA_LOCATIONS);
    const causeCount = tier === 'connector' ? 4 : tier === 'highly_active' ? 3 : 2;
    const selectedCauses = [];
    while (selectedCauses.length < causeCount) {
      const cause = pick(rng, CAUSES);
      if (!selectedCauses.includes(cause)) selectedCauses.push(cause);
    }

    users.push({
      id: deterministicUuid('user', users.length + 1),
      displayName,
      avatarUrl: null,
      bio: pick(rng, USER_BIOS[tier]),
      city: location.city,
      state: location.state,
      tier,
      causes: selectedCauses,
      anchor: false,
      createdAt: dateBeforeAnchor(rng, 30, 720),
    });
  }
  return users;
}

function generatedOrganizationName(index) {
  const prefixIndex = index % ORGANIZATION_PREFIXES.length;
  const nounIndex = Math.floor(index / ORGANIZATION_PREFIXES.length)
    % ORGANIZATION_NOUNS.length;
  return `${ORGANIZATION_PREFIXES[prefixIndex]} ${ORGANIZATION_NOUNS[nounIndex]}`;
}

function generateOrganizations(rng) {
  const organizations = [];
  for (const anchor of ANCHOR_ORGANIZATIONS) {
    organizations.push({
      id: deterministicUuid('organization-anchor', anchor.key),
      name: anchor.name,
      mission: anchor.mission,
      logoUrl: null,
      city: anchor.city,
      state: anchor.state,
      isVerifiedDemo: true,
      tier: anchor.tier,
      causes: anchor.causes,
      anchor: true,
      createdAt: dateBeforeAnchor(rng, 365, 1500),
    });
  }

  let generatedIndex = 0;
  while (organizations.length < CONFIG.counts.organizations) {
    const tier = weightedPick(rng, CONFIG.organizationTiers).name;
    const location = chance(rng, CONFIG.geography.atlantaMetroShare)
      ? pick(rng, ATLANTA_METRO_LOCATIONS)
      : pick(rng, GEORGIA_LOCATIONS);
    const primaryCause = pick(rng, CAUSES);
    organizations.push({
      id: deterministicUuid('organization', generatedIndex + 1),
      name: generatedOrganizationName(generatedIndex),
      mission: `Mobilizing people around ${primaryCause.toLowerCase()} through accessible community programs and volunteer opportunities.`,
      logoUrl: null,
      city: location.city,
      state: location.state,
      isVerifiedDemo: chance(rng, tier === 'high_visibility' ? 0.9 : 0.2),
      tier,
      causes: [primaryCause],
      anchor: false,
      createdAt: dateBeforeAnchor(rng, 180, 1800),
    });
    generatedIndex += 1;
  }
  return organizations;
}

function generateUserCauses(rng, users, causes) {
  const causeByName = new Map(causes.map((cause) => [cause.name, cause]));
  return users.flatMap((user) => user.causes.map((causeName) => ({
    userId: user.id,
    causeId: causeByName.get(causeName).id,
    selectedAt: dateBetween(rng, user.createdAt, CONFIG.anchorDate),
  })));
}

function generateOrganizationCauses(rng, organizations, causes) {
  const causeByName = new Map(causes.map((cause) => [cause.name, cause]));
  return organizations.flatMap((organization) => organization.causes.map((causeName) => ({
    organizationId: organization.id,
    causeId: causeByName.get(causeName).id,
    createdAt: dateBetween(rng, organization.createdAt, CONFIG.anchorDate),
  })));
}

function allocateExactOutdegrees(rng, entities, targetCount, baseByTier) {
  const weighted = entities.map((entity) => ({
    id: entity.id,
    raw: baseByTier[entity.tier] * (0.8 + rng() * 0.4),
  }));
  const rawTotal = weighted.reduce((sum, item) => sum + item.raw, 0);
  const allocations = weighted.map((item) => {
    const scaled = item.raw * targetCount / rawTotal;
    return {
      id: item.id,
      count: Math.floor(scaled),
      remainder: scaled - Math.floor(scaled),
    };
  });
  const remaining = targetCount - allocations.reduce((sum, item) => sum + item.count, 0);
  allocations.sort((first, second) => (
    second.remainder - first.remainder || first.id.localeCompare(second.id)
  ));
  for (let index = 0; index < remaining; index += 1) allocations[index].count += 1;
  return new Map(allocations.map(({ id, count }) => [id, count]));
}

function weightedSampleWithoutReplacement(rng, candidates, count) {
  return candidates
    .map((candidate) => ({
      ...candidate,
      samplingKey: -Math.log(Math.max(rng(), Number.EPSILON)) / candidate.weight,
    }))
    .sort((first, second) => (
      first.samplingKey - second.samplingKey
      || first.entity.id.localeCompare(second.entity.id)
    ))
    .slice(0, count)
    .map(({ entity }) => entity);
}

function generateUserFollows(rng, users) {
  const outdegrees = allocateExactOutdegrees(
    rng, users, CONFIG.counts.userFollows, USER_FOLLOW_BASE
  );
  const appealByUserId = new Map(users.map((user) => [user.id, 0.7 + rng() * 0.9]));
  const userByName = new Map(users.map((user) => [user.displayName, user]));
  const requiredByFollower = new Map([
    [userByName.get('Maya Ellis').id, [userByName.get('David Mercer')]],
    [userByName.get('David Mercer').id, [userByName.get('Maya Ellis')]],
  ]);
  const relationships = [];

  for (const follower of users) {
    const requiredTargets = requiredByFollower.get(follower.id) || [];
    const selectedIds = new Set(requiredTargets.map((user) => user.id));
    const candidates = users
      .filter((followed) => followed.id !== follower.id && !selectedIds.has(followed.id))
      .map((followed) => {
        const sameCity = locationKey(follower) === locationKey(followed);
        const bothAtlantaMetro = isAtlantaMetro(follower) && isAtlantaMetro(followed);
        const affinity = 1
          + sharedCauseCount(follower, followed) * 4
          + (sameCity ? 3 : 0)
          + (!sameCity && bothAtlantaMetro ? 1.25 : 0)
          + USER_VISIBILITY_BONUS[followed.tier]
          + (followed.anchor ? 1.5 : 0);
        return { entity: followed, weight: affinity * appealByUserId.get(followed.id) };
      });
    const selected = requiredTargets.concat(weightedSampleWithoutReplacement(
      rng, candidates, outdegrees.get(follower.id) - requiredTargets.length
    ));

    for (const followed of selected) {
      relationships.push({
        followerUserId: follower.id,
        followedUserId: followed.id,
        createdAt: dateBetween(
          rng,
          latestDate(follower.createdAt, followed.createdAt),
          CONFIG.anchorDate
        ),
      });
    }
  }
  return relationships;
}

function generateOrganizationFollows(rng, users, organizations) {
  const outdegrees = allocateExactOutdegrees(
    rng, users, CONFIG.counts.organizationFollows, ORGANIZATION_FOLLOW_BASE
  );
  const appealByOrganizationId = new Map(
    organizations.map((organization) => [organization.id, 0.7 + rng() * 0.9])
  );
  const userByName = new Map(users.map((user) => [user.displayName, user]));
  const organizationByName = new Map(
    organizations.map((organization) => [organization.name, organization])
  );
  const requiredNames = new Map([
    ['Maya Ellis', ['Mosaic Meals Collective', 'Riverlight Atlanta', 'Community Roots Atlanta']],
    ['David Mercer', [
      'Community Roots Atlanta', 'Bright Futures Lab',
      'Northstar Veterans Network', 'Bridgeway Youth Collaborative',
    ]],
  ]);
  const requiredByUser = new Map([...requiredNames].map(([userName, names]) => [
    userByName.get(userName).id,
    names.map((name) => organizationByName.get(name)),
  ]));
  const relationships = [];

  for (const user of users) {
    const requiredOrganizations = requiredByUser.get(user.id) || [];
    const selectedIds = new Set(requiredOrganizations.map((organization) => organization.id));
    const candidates = organizations
      .filter((organization) => !selectedIds.has(organization.id))
      .map((organization) => {
        const sameCity = locationKey(user) === locationKey(organization);
        const bothAtlantaMetro = isAtlantaMetro(user) && isAtlantaMetro(organization);
        const affinity = 1
          + sharedCauseCount(user, organization) * 5
          + (sameCity ? 3 : 0)
          + (!sameCity && bothAtlantaMetro ? 1.25 : 0)
          + ORGANIZATION_VISIBILITY_BONUS[organization.tier]
          + (organization.anchor ? 1.5 : 0);
        return {
          entity: organization,
          weight: affinity * appealByOrganizationId.get(organization.id),
        };
      });
    const selected = requiredOrganizations.concat(weightedSampleWithoutReplacement(
      rng, candidates, outdegrees.get(user.id) - requiredOrganizations.length
    ));

    for (const organization of selected) {
      relationships.push({
        userId: user.id,
        organizationId: organization.id,
        createdAt: dateBetween(
          rng,
          latestDate(user.createdAt, organization.createdAt),
          CONFIG.anchorDate
        ),
      });
    }
  }
  return relationships;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((first, second) => first - second);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function rounded(value) {
  return Number(value.toFixed(2));
}

function averageCountByTier(entities, countsById, tiers) {
  return Object.fromEntries(tiers.map(({ name }) => {
    const counts = entities
      .filter((entity) => entity.tier === name)
      .map((entity) => countsById.get(entity.id) || 0);
    return [name, rounded(average(counts))];
  }));
}

function buildDiagnostics(world) {
  const followerCounts = new Map(world.users.map((user) => [user.id, 0]));
  const peopleFollowedCounts = new Map(world.users.map((user) => [user.id, 0]));
  const organizationFollowerCounts = new Map(
    world.organizations.map((organization) => [organization.id, 0])
  );
  const organizationsFollowedCounts = new Map(world.users.map((user) => [user.id, 0]));

  for (const relationship of world.userFollows) {
    followerCounts.set(
      relationship.followedUserId, followerCounts.get(relationship.followedUserId) + 1
    );
    peopleFollowedCounts.set(
      relationship.followerUserId, peopleFollowedCounts.get(relationship.followerUserId) + 1
    );
  }
  for (const relationship of world.organizationFollows) {
    organizationFollowerCounts.set(
      relationship.organizationId,
      organizationFollowerCounts.get(relationship.organizationId) + 1
    );
    organizationsFollowedCounts.set(
      relationship.userId, organizationsFollowedCounts.get(relationship.userId) + 1
    );
  }

  const followerValues = [...followerCounts.values()];
  const organizationFollowerValues = [...organizationFollowerCounts.values()];
  const anchors = Object.fromEntries(['Maya Ellis', 'David Mercer'].map((displayName) => {
    const user = world.users.find((candidate) => candidate.displayName === displayName);
    return [displayName, {
      peopleFollowed: peopleFollowedCounts.get(user.id),
      followers: followerCounts.get(user.id),
      organizationsFollowed: organizationsFollowedCounts.get(user.id),
    }];
  }));

  return {
    entityCounts: {
      causes: world.causes.length,
      users: world.users.length,
      organizations: world.organizations.length,
      userCauses: world.userCauses.length,
      organizationCauses: world.organizationCauses.length,
      userFollows: world.userFollows.length,
      organizationFollows: world.organizationFollows.length,
      opportunities: world.opportunities.length,
    },
    userPopulation: {
      byActivityTier: Object.fromEntries(CONFIG.userTiers.map(({ name }) => [
        name, world.users.filter((user) => user.tier === name).length,
      ])),
      atlantaMetroShare: rounded(world.users.filter(isAtlantaMetro).length / world.users.length),
    },
    userSocialGraph: {
      averagePeopleFollowed: rounded(average([...peopleFollowedCounts.values()])),
      averageFollowers: rounded(average(followerValues)),
      medianFollowers: median(followerValues),
      maximumFollowers: Math.max(...followerValues),
      usersWithZeroFollowers: followerValues.filter((count) => count === 0).length,
      averageFollowersByFollowedUserTier: averageCountByTier(
        world.users, followerCounts, CONFIG.userTiers
      ),
      averagePeopleFollowedByFollowerTier: averageCountByTier(
        world.users, peopleFollowedCounts, CONFIG.userTiers
      ),
    },
    organizationGraph: {
      averageOrganizationsFollowedPerUser: rounded(
        average([...organizationsFollowedCounts.values()])
      ),
      averageFollowersPerOrganization: rounded(average(organizationFollowerValues)),
      medianOrganizationFollowers: median(organizationFollowerValues),
      maximumOrganizationFollowers: Math.max(...organizationFollowerValues),
      organizationsWithZeroFollowers: organizationFollowerValues
        .filter((count) => count === 0).length,
      averageFollowersByOrganizationTier: averageCountByTier(
        world.organizations, organizationFollowerCounts, CONFIG.organizationTiers
      ),
    },
    anchors,
    opportunities: buildOpportunityDiagnostics(world),
  };
}

function generateWorld() {
  const rng = createRng(CONFIG.seed);
  const causes = generateCauses();
  const users = generateUsers(rng);
  const organizations = generateOrganizations(rng);
  const userCauses = generateUserCauses(rng, users, causes);
  const organizationCauses = generateOrganizationCauses(rng, organizations, causes);
  const userFollows = generateUserFollows(rng, users);
  const organizationFollows = generateOrganizationFollows(rng, users, organizations);
  const opportunities = generateOpportunities(rng, causes, users, organizations);
  const world = {
    metadata: { seed: CONFIG.seed, anchorDate: CONFIG.anchorDate },
    causes, users, organizations, userCauses,
    organizationCauses, userFollows, organizationFollows, opportunities,
  };
  validateWorld(world);
  return world;
}

if (require.main === module) {
  const world = generateWorld();
  console.log(JSON.stringify({
    metadata: world.metadata,
    validation: { passed: true },
    diagnostics: buildDiagnostics(world),
  }, null, 2));
}

module.exports = { generateWorld, buildDiagnostics };
