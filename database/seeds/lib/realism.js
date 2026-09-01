const {
  completedPhysicalRows,
  implausibleSameDayPairs,
  travelBucket,
  userOpportunityMiles,
} = require('./geography');

const AVATAR_PATH = /^\/demo-assets\/avatars\/[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}\.webp$/;
const LOGO_PATH = /^\/demo-assets\/organizations\/[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}\.svg$/;

function assert(condition, message) {
  if (!condition) throw new Error(`Seed validation failed: ${message}`);
}

function normalized(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function distinctCount(rows, key) {
  return new Set(rows.map((row) => normalized(row[key]))).size;
}

function maximumRepetition(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const value = normalized(row[key]);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Math.max(...counts.values());
}

function joinedCounts(world) {
  const counts = new Map(world.opportunities.map((item) => [item.id, 0]));
  for (const row of world.registrations) {
    if (row.status === 'joined') counts.set(row.opportunityId, counts.get(row.opportunityId) + 1);
  }
  return counts;
}

function validateMedia(world) {
  const usersWithAvatars = world.users.filter((user) => user.avatarUrl !== null);
  const organizationsWithLogos = world.organizations.filter(
    (organization) => organization.logoUrl !== null
  );
  assert(usersWithAvatars.length === 50,
    `user avatar reference count is ${usersWithAvatars.length}; expected 50`);
  assert(organizationsWithLogos.length === 25,
    `organization logo reference count is ${organizationsWithLogos.length}; expected 25`);
  assert(world.users.find((user) => user.displayName === 'Maya Ellis').avatarUrl,
    'Maya Ellis must have an avatar reference');
  assert(world.users.find((user) => user.displayName === 'David Mercer').avatarUrl,
    'David Mercer must have an avatar reference');
  assert(world.organizations.filter((organization) => organization.anchor)
    .every((organization) => organization.logoUrl),
  'every anchor organization must have a logo reference');
  assert(usersWithAvatars.every((user) => AVATAR_PATH.test(user.avatarUrl)),
    'user avatar reference has an invalid controlled path');
  assert(organizationsWithLogos.every((organization) => LOGO_PATH.test(organization.logoUrl)),
    'organization logo reference has an invalid controlled path');
  assert(new Set(usersWithAvatars.map((user) => user.avatarUrl)).size === 50,
    'user avatar references must be unique');
  assert(new Set(organizationsWithLogos.map((organization) => organization.logoUrl)).size === 25,
    'organization logo references must be unique');
}

function validateCopy(world) {
  const generated = world.opportunities.filter((item) => !item.anchor);
  const manual = world.activities.filter((activity) => activity.registrationId === null);
  const stories = world.activities.filter((activity) => activity.story !== null);
  assert(distinctCount(generated, 'title') >= 600,
    'generated Opportunity title diversity fell below 600 normalized titles');
  assert(maximumRepetition(generated, 'title') <= 10,
    'an ordinary generated Opportunity title repeats more than 10 times');
  assert(distinctCount(generated, 'description') >= 300,
    'generated Opportunity description diversity fell below 300');
  assert(distinctCount(generated, 'whatYoullDo') >= 300,
    'generated Opportunity task diversity fell below 300');
  assert(distinctCount(generated, 'requirements') >= 160,
    'generated Opportunity requirement diversity fell below 160');
  assert(distinctCount(manual, 'manualTitle') >= 100,
    'manual Activity title diversity fell below 100');
  assert(maximumRepetition(manual, 'manualTitle') <= 12,
    'a manual Activity title repeats more than 12 times');
  assert(distinctCount(stories, 'story') >= 120,
    'story-bearing Activity diversity fell below 120');
}

function validateCharityTraction(world) {
  const joined = joinedCounts(world);
  const charity = world.opportunities.filter(
    (item) => item.opportunityType === 'charity_event'
  );
  const rates = charity.map((item) => joined.get(item.id) / item.capacity);
  assert(rates.filter((rate) => rate >= 0.25).length >= 20,
    'fewer than 20 charity events have meaningful 25%+ traction');
  assert(rates.filter((rate) => rate >= 0.5).length >= 4,
    'fewer than four charity events have 50%+ traction');
}

function validateTravel(world) {
  const completed = completedPhysicalRows(world);
  const longDistanceByUser = new Map();
  for (const row of completed.filter((item) => item.miles > 100)) {
    longDistanceByUser.set(row.user.id, (longDistanceByUser.get(row.user.id) || 0) + 1);
  }
  assert([...longDistanceByUser.values()].every((count) => count <= 2),
    'a user has more than two completed physical Activities over 100 miles from home');
  assert(implausibleSameDayPairs(world).length === 0,
    'completed Activities contain an implausible same-day distant/local travel pattern');
}

function validateRealism(world) {
  validateMedia(world);
  validateCopy(world);
  validateCharityTraction(world);
  validateTravel(world);
  return true;
}

function rounded(value) {
  return Number(value.toFixed(2));
}

function distribution(values) {
  const sorted = [...values].sort((first, second) => first - second);
  const percentile = (fraction) => sorted[Math.ceil(sorted.length * fraction) - 1];
  return {
    minimum: sorted[0],
    median: percentile(0.5),
    p75: percentile(0.75),
    p90: percentile(0.9),
    maximum: sorted[sorted.length - 1],
    average: rounded(values.reduce((sum, value) => sum + value, 0) / values.length),
  };
}

function fillBucket(joined, capacity) {
  if (joined === 0) return '0%';
  const rate = joined / capacity;
  if (rate === 1) return '100%';
  if (rate >= 0.75) return '75–99%';
  if (rate >= 0.5) return '50–74%';
  if (rate >= 0.25) return '25–49%';
  return '1–24%';
}

function travelDistribution(rows) {
  const buckets = Object.fromEntries(
    ['0–5', '5–15', '15–30', '30–60', '60–100', '100+'].map((key) => [key, 0])
  );
  for (const row of rows) buckets[travelBucket(row.miles)] += 1;
  return buckets;
}

function buildRealismDiagnostics(world) {
  const userById = new Map(world.users.map((user) => [user.id, user]));
  const opportunityById = new Map(world.opportunities.map((item) => [item.id, item]));
  const joined = joinedCounts(world);
  const charity = world.opportunities.filter((item) => item.opportunityType === 'charity_event');
  const charityRows = charity.map((item) => ({
    id: item.id,
    title: item.title,
    mode: item.isOnline ? 'online' : `${item.city}, GA`,
    timeBucket: item.timeBucket,
    capacity: item.capacity,
    joined: joined.get(item.id),
    fillPercent: rounded(joined.get(item.id) * 100 / item.capacity),
    bucket: fillBucket(joined.get(item.id), item.capacity),
  }));
  const joinedPhysical = world.registrations.flatMap((row) => {
    const item = opportunityById.get(row.opportunityId);
    if (row.status !== 'joined' || item.isOnline) return [];
    const user = userById.get(row.userId);
    return [{ user, opportunity: item, miles: userOpportunityMiles(user, item) }];
  });
  const completed = completedPhysicalRows(world);
  const longDistanceByUser = new Map();
  for (const row of completed.filter((item) => item.miles > 100)) {
    longDistanceByUser.set(row.user.id, (longDistanceByUser.get(row.user.id) || 0) + 1);
  }
  const usersWithAvatars = world.users.filter((user) => user.avatarUrl);
  const organizationsWithLogos = world.organizations.filter((organization) => organization.logoUrl);
  const generated = world.opportunities.filter((item) => !item.anchor);
  const manual = world.activities.filter((activity) => !activity.registrationId);
  const stories = world.activities.filter((activity) => activity.story);
  return {
    charityTraction: {
      total: charity.length,
      byMode: {
        online: charity.filter((item) => item.isOnline).length,
        physical: charity.filter((item) => !item.isOnline).length,
      },
      capacity: distribution(charity.map((item) => item.capacity)),
      fillBuckets: Object.fromEntries(
        ['0%', '1–24%', '25–49%', '50–74%', '75–99%', '100%']
          .map((bucket) => [bucket, charityRows.filter((row) => row.bucket === bucket).length])
      ),
      atLeast25Percent: charityRows.filter((row) => row.fillPercent >= 25).length,
      atLeast50Percent: charityRows.filter((row) => row.fillPercent >= 50).length,
      representative: [...charityRows].sort((first, second) => (
        second.fillPercent - first.fillPercent || first.id.localeCompare(second.id)
      )).filter((_, index, rows) => index % Math.max(1, Math.floor(rows.length / 15)) === 0)
        .slice(0, 15),
    },
    physicalTravel: {
      joined: {
        rows: joinedPhysical.length,
        distanceBuckets: travelDistribution(joinedPhysical),
        over100Miles: joinedPhysical.filter((row) => row.miles > 100).length,
        over100MilesPercent: rounded(
          joinedPhysical.filter((row) => row.miles > 100).length * 100 / joinedPhysical.length
        ),
      },
      completed: {
        rows: completed.length,
        distanceBuckets: travelDistribution(completed),
        over100Miles: completed.filter((row) => row.miles > 100).length,
        over100MilesPercent: rounded(
          completed.filter((row) => row.miles > 100).length * 100 / completed.length
        ),
        maximumLongDistanceCompletionsPerUser: Math.max(0, ...longDistanceByUser.values()),
      },
      implausibleSameDayPairs: implausibleSameDayPairs(world).length,
    },
    media: {
      users: {
        references: usersWithAvatars.length,
        null: world.users.length - usersWithAvatars.length,
        byTier: Object.fromEntries(['light', 'regular', 'highly_active', 'connector'].map((tier) => [
          tier, usersWithAvatars.filter((user) => user.tier === tier).length,
        ])),
        maya: world.users.find((user) => user.displayName === 'Maya Ellis').avatarUrl,
        david: world.users.find((user) => user.displayName === 'David Mercer').avatarUrl,
      },
      organizations: {
        references: organizationsWithLogos.length,
        null: world.organizations.length - organizationsWithLogos.length,
        anchorPaths: Object.fromEntries(world.organizations.filter((organization) => organization.anchor)
          .map((organization) => [organization.name, organization.logoUrl])),
        nonAnchorSample: organizationsWithLogos.filter((organization) => !organization.anchor)
          .slice(0, 10).map((organization) => ({
            name: organization.name, tier: organization.tier, logoUrl: organization.logoUrl,
          })),
      },
      assetExistenceValidated: false,
    },
    copyDiversity: {
      generatedOpportunityRows: generated.length,
      opportunityTitles: distinctCount(generated, 'title'),
      maximumOpportunityTitleRepetition: maximumRepetition(generated, 'title'),
      opportunityDescriptions: distinctCount(generated, 'description'),
      opportunityTasks: distinctCount(generated, 'whatYoullDo'),
      opportunityRequirements: distinctCount(generated, 'requirements'),
      manualActivityRows: manual.length,
      manualActivityTitles: distinctCount(manual, 'manualTitle'),
      maximumManualTitleRepetition: maximumRepetition(manual, 'manualTitle'),
      storyBearingActivityRows: stories.length,
      activityStories: distinctCount(stories, 'story'),
    },
  };
}

module.exports = {
  validateRealism,
  buildRealismDiagnostics,
  normalized,
};
