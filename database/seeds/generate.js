const CONFIG = require('./config');

const {
  createRng,
  randomInt,
  pick,
  chance,
  weightedPick,
} = require('./lib/random');

const {
  deterministicUuid,
} = require('./lib/ids');

const {
  CAUSES,
  FIRST_NAMES,
  LAST_NAMES,
  ATLANTA_METRO_LOCATIONS,
  GEORGIA_LOCATIONS,
  ORGANIZATION_PREFIXES,
  ORGANIZATION_NOUNS,
  USER_BIOS,
} = require('./data/content');

const {
  ANCHOR_USERS,
  ANCHOR_ORGANIZATIONS,
} = require('./data/anchors');

function dateBeforeAnchor(rng, minDays, maxDays) {
  const anchor = new Date(CONFIG.anchorDate);
  const days = randomInt(rng, minDays, maxDays);

  anchor.setUTCDate(anchor.getUTCDate() - days);

  return anchor.toISOString();
}

function generateCauses() {
  return CAUSES.map((name, index) => ({
    id: deterministicUuid('cause', name),
    name,
    sortOrder: index + 1,
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

    const causeCount = tier === 'connector'
      ? 4
      : tier === 'highly_active'
        ? 3
        : 2;

    const selectedCauses = [];

    while (selectedCauses.length < causeCount) {
      const cause = pick(rng, CAUSES);

      if (!selectedCauses.includes(cause)) {
        selectedCauses.push(cause);
      }
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

  const nounIndex = Math.floor(
    index / ORGANIZATION_PREFIXES.length
  ) % ORGANIZATION_NOUNS.length;

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
    const tier = weightedPick(
      rng,
      CONFIG.organizationTiers
    ).name;

    const location = chance(
      rng,
      CONFIG.geography.atlantaMetroShare
    )
      ? pick(rng, ATLANTA_METRO_LOCATIONS)
      : pick(rng, GEORGIA_LOCATIONS);

    const primaryCause = pick(rng, CAUSES);

    const name = generatedOrganizationName(
      generatedIndex
    );

    organizations.push({
      id: deterministicUuid(
        'organization',
        generatedIndex + 1
      ),
      name,
      mission: `Mobilizing people around ${primaryCause.toLowerCase()} through accessible community programs and volunteer opportunities.`,
      logoUrl: null,
      city: location.city,
      state: location.state,
      isVerifiedDemo: chance(
        rng,
        tier === 'high_visibility' ? 0.9 : 0.2
      ),
      tier,
      causes: [primaryCause],
      anchor: false,
      createdAt: dateBeforeAnchor(rng, 180, 1800),
    });

    generatedIndex += 1;
  }

  return organizations;
}

function generateWorld() {
  const rng = createRng(CONFIG.seed);

  const causes = generateCauses();
  const users = generateUsers(rng);
  const organizations = generateOrganizations(rng);

  return {
    metadata: {
      seed: CONFIG.seed,
      anchorDate: CONFIG.anchorDate,
    },
    causes,
    users,
    organizations,
  };
}

const world = generateWorld();

const userTierCounts = Object.fromEntries(
  CONFIG.userTiers.map(({ name }) => [
    name,
    world.users.filter((user) => user.tier === name).length,
  ])
);

const organizationTierCounts = Object.fromEntries(
  CONFIG.organizationTiers.map(({ name }) => [
    name,
    world.organizations.filter(
      (organization) => organization.tier === name
    ).length,
  ])
);

console.log(JSON.stringify({
  seed: world.metadata.seed,
  anchorDate: world.metadata.anchorDate,

  generatedCounts: {
    causes: world.causes.length,
    users: world.users.length,
    organizations: world.organizations.length,
  },

  userTierCounts,
  organizationTierCounts,

  anchors: {
    users: world.users
      .filter((user) => user.anchor)
      .map((user) => user.displayName),

    organizations: world.organizations
      .filter((organization) => organization.anchor)
      .map((organization) => organization.name),
  },

  sampleGeneratedUsers: world.users
    .filter((user) => !user.anchor)
    .slice(0, 5),

  sampleGeneratedOrganizations: world.organizations
    .filter((organization) => !organization.anchor)
    .slice(0, 5),
}, null, 2));
