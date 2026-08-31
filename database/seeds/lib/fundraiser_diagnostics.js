const CONFIG = require('../config');
const { deriveProfileMetrics } = require('./activities');
const {
  deriveFundraiserProgress,
  deriveAmountRaisedByUser,
  lifecycleOf,
} = require('./fundraisers');

function rounded(value) {
  return Number((value || 0).toFixed(2));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

function distribution(values) {
  return {
    minimum: values.length ? Math.min(...values) : 0,
    average: rounded(average(values)),
    median: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    p90: percentile(values, 0.9),
    maximum: values.length ? Math.max(...values) : 0,
    zero: values.filter((value) => value === 0).length,
  };
}

function percentage(numerator, denominator) {
  return rounded(denominator ? numerator * 100 / denominator : 0);
}

function dollars(cents) {
  return rounded(cents / 100);
}

function progressBucket(percent) {
  if (percent === 0) return '0%';
  if (percent < 25) return '1–24%';
  if (percent < 50) return '25–49%';
  if (percent < 80) return '50–79%';
  if (percent < 100) return '80–99%';
  if (percent < 120) return '100–119%';
  return '120%+';
}

function buildFundraiserDiagnostics(world) {
  const userById = new Map(world.users.map((user) => [user.id, user]));
  const organizationById = new Map(world.organizations.map((item) => [item.id, item]));
  const causeById = new Map(world.causes.map((cause) => [cause.id, cause]));
  const fundraiserById = new Map(world.fundraisers.map((item) => [item.id, item]));
  const progress = deriveFundraiserProgress(world);
  const amountRaisedByUser = deriveAmountRaisedByUser(world);
  const activityMetrics = deriveProfileMetrics(world);
  const supportsByFundraiser = new Map(world.fundraisers.map((item) => [item.id, []]));
  const supportsByUser = new Map(world.users.map((user) => [user.id, []]));
  for (const support of world.fundraiserSupports) {
    supportsByFundraiser.get(support.fundraiserId).push(support);
    supportsByUser.get(support.userId).push(support);
  }
  const userFollows = new Set(world.userFollows.map(
    (row) => `${row.followerUserId}|${row.followedUserId}`
  ));
  const organizationFollows = new Set(world.organizationFollows.map(
    (row) => `${row.userId}|${row.organizationId}`
  ));

  function creator(fundraiser) {
    return fundraiser.creatorUserId
      ? { type: 'user', entity: userById.get(fundraiser.creatorUserId) }
      : { type: 'organization', entity: organizationById.get(fundraiser.creatorOrganizationId) };
  }

  function creatorName(fundraiser) {
    const value = creator(fundraiser);
    return value.type === 'user' ? value.entity.displayName : value.entity.name;
  }

  function describeSupport(support) {
    const fundraiser = fundraiserById.get(support.fundraiserId);
    const user = userById.get(support.userId);
    const otherSupporters = supportsByFundraiser.get(fundraiser.id)
      .filter((item) => item.userId !== user.id && item.supportedAt < support.supportedAt);
    return {
      supporter: user.displayName,
      fundraiser: fundraiser.title,
      creator: creatorName(fundraiser),
      creatorType: creator(fundraiser).type,
      beneficiary: fundraiser.beneficiaryName,
      cause: causeById.get(fundraiser.causeId).name,
      amountDollars: dollars(support.amountCents),
      causeMatch: user.causes.includes(causeById.get(fundraiser.causeId).name),
      followsCreator: fundraiser.creatorUserId
        ? userFollows.has(`${user.id}|${fundraiser.creatorUserId}`)
        : organizationFollows.has(`${user.id}|${fundraiser.creatorOrganizationId}`),
      followsBeneficiary: fundraiser.beneficiaryOrganizationId
        ? organizationFollows.has(`${user.id}|${fundraiser.beneficiaryOrganizationId}`)
        : false,
      followsAnotherSupporter: otherSupporters.some(
        (item) => userFollows.has(`${user.id}|${item.userId}`)
      ),
      supportedAt: support.supportedAt,
    };
  }

  function describeFundraiser(fundraiser, includeSupporters = 5) {
    const derived = progress.get(fundraiser.id);
    return {
      title: fundraiser.title,
      creator: creatorName(fundraiser),
      creatorType: creator(fundraiser).type,
      cause: causeById.get(fundraiser.causeId).name,
      beneficiary: fundraiser.beneficiaryName,
      beneficiaryType: fundraiser.beneficiaryOrganizationId ? 'linked Kynd' : 'external',
      lifecycle: lifecycleOf(fundraiser),
      createdAt: fundraiser.createdAt,
      endDate: fundraiser.endDate,
      goalDollars: dollars(fundraiser.goalAmountCents),
      supporterCount: derived.supporterCount,
      amountRaisedDollars: dollars(derived.amountRaisedCents),
      progressPercent: derived.progressPercent,
      imageUrl: fundraiser.imageUrl,
      story: fundraiser.story,
      supporterSample: supportsByFundraiser.get(fundraiser.id).slice(0, includeSupporters)
        .map((support) => ({
          name: userById.get(support.userId).displayName,
          amountDollars: dollars(support.amountCents),
        })),
    };
  }

  function creatorDiagnostics(entities, creatorKey, tiers, nameKey) {
    const counts = new Map(entities.map((entity) => [entity.id, 0]));
    for (const fundraiser of world.fundraisers) {
      if (fundraiser[creatorKey]) counts.set(
        fundraiser[creatorKey], counts.get(fundraiser[creatorKey]) + 1
      );
    }
    const values = [...counts.values()];
    const creatorValues = values.filter((value) => value > 0);
    return {
      uniqueCreators: creatorValues.length,
      withZero: values.filter((value) => value === 0).length,
      averageAmongAll: rounded(average(values)),
      averageAmongCreators: rounded(average(creatorValues)),
      medianAmongCreators: percentile(creatorValues, 0.5),
      p90AmongCreators: percentile(creatorValues, 0.9),
      maximum: Math.max(...values),
      byTier: Object.fromEntries(tiers.map(({ name }) => {
        const tierEntities = entities.filter((entity) => entity.tier === name);
        const tierValues = tierEntities.map((entity) => counts.get(entity.id));
        const active = tierValues.filter((value) => value > 0);
        return [name, {
          entities: tierEntities.length,
          fundraiserRows: tierValues.reduce((sum, value) => sum + value, 0),
          uniqueCreators: active.length,
          averageAmongAll: rounded(average(tierValues)),
          averageAmongCreators: rounded(average(active)),
        }];
      })),
      topCreators: entities.filter((entity) => counts.get(entity.id) > 0)
        .sort((first, second) => (
          counts.get(second.id) - counts.get(first.id)
          || first[nameKey].localeCompare(second[nameKey])
        )).slice(0, 10).map((entity) => ({
          name: entity[nameKey], tier: entity.tier, fundraisers: counts.get(entity.id),
        })),
    };
  }

  function goalDistribution(rows) {
    const values = rows.map((item) => dollars(item.goalAmountCents));
    return distribution(values);
  }

  function lifecycleTraction(lifecycle) {
    const rows = world.fundraisers.filter((item) => lifecycleOf(item) === lifecycle);
    const values = rows.map((item) => progress.get(item.id).supporterCount);
    const buckets = Object.fromEntries(
      ['0%', '1–24%', '25–49%', '50–79%', '80–99%', '100–119%', '120%+']
        .map((bucket) => [bucket, rows.filter((item) => (
          progressBucket(progress.get(item.id).progressPercent) === bucket
        )).length])
    );
    return {
      fundraiserCount: rows.length,
      supporterCount: distribution(values),
      progressBuckets: buckets,
      zeroSupport: buckets['0%'],
      nearGoal: buckets['80–99%'],
      goalMetOrOverfunded: buckets['100–119%'] + buckets['120%+'],
    };
  }

  const userCreated = world.fundraisers.filter((item) => item.creatorUserId);
  const organizationCreated = world.fundraisers.filter((item) => item.creatorOrganizationId);
  const lifecycleCounts = Object.fromEntries(['open', 'ended', 'cancelled'].map((name) => [
    name, world.fundraisers.filter((item) => lifecycleOf(item) === name).length,
  ]));
  const supportLifecycle = Object.fromEntries(['open', 'ended', 'cancelled'].map((name) => [
    name, world.fundraiserSupports.filter((support) => (
      lifecycleOf(fundraiserById.get(support.fundraiserId)) === name
    )).length,
  ]));
  const supportCounts = world.users.map((user) => supportsByUser.get(user.id).length);
  const supportAmounts = world.fundraiserSupports.map((item) => dollars(item.amountCents));
  const amountFrequency = [...new Set(supportAmounts)].sort((first, second) => first - second)
    .map((amount) => ({ amountDollars: amount, count: supportAmounts.filter((item) => item === amount).length }))
    .sort((first, second) => second.count - first.count || first.amountDollars - second.amountDollars);

  const supporterByTier = Object.fromEntries(CONFIG.userTiers.map(({ name }) => {
    const users = world.users.filter((user) => user.tier === name);
    const values = users.map((user) => supportsByUser.get(user.id).length);
    return [name, {
      users: users.length,
      supportRows: values.reduce((sum, value) => sum + value, 0),
      averagePerUser: rounded(average(values)),
      median: percentile(values, 0.5),
      zeroSupportUsers: values.filter((value) => value === 0).length,
    }];
  }));

  let causeMatches = 0;
  let userCreatedRows = 0;
  let userCreatorFollows = 0;
  let organizationCreatedRows = 0;
  let organizationCreatorFollows = 0;
  let linkedBeneficiaryRows = 0;
  let beneficiaryFollows = 0;
  let socialProof = 0;
  for (const support of world.fundraiserSupports) {
    const fundraiser = fundraiserById.get(support.fundraiserId);
    const user = userById.get(support.userId);
    if (user.causes.includes(causeById.get(fundraiser.causeId).name)) causeMatches += 1;
    if (fundraiser.creatorUserId) {
      userCreatedRows += 1;
      if (userFollows.has(`${user.id}|${fundraiser.creatorUserId}`)) userCreatorFollows += 1;
    } else {
      organizationCreatedRows += 1;
      if (organizationFollows.has(`${user.id}|${fundraiser.creatorOrganizationId}`)) {
        organizationCreatorFollows += 1;
      }
    }
    if (fundraiser.beneficiaryOrganizationId) {
      linkedBeneficiaryRows += 1;
      if (organizationFollows.has(`${user.id}|${fundraiser.beneficiaryOrganizationId}`)) {
        beneficiaryFollows += 1;
      }
    }
    const others = supportsByFundraiser.get(fundraiser.id).filter(
      (item) => item.userId !== user.id && item.supportedAt < support.supportedAt
    );
    if (others.some((item) => userFollows.has(`${user.id}|${item.userId}`))) socialProof += 1;
  }

  const beneficiaryCounts = new Map();
  for (const fundraiser of world.fundraisers) beneficiaryCounts.set(
    fundraiser.beneficiaryName,
    (beneficiaryCounts.get(fundraiser.beneficiaryName) || 0) + 1
  );

  function anchorDiagnostics(name, fundraiserTitle) {
    const user = userById.get(world.users.find((item) => item.displayName === name).id);
    const fundraiser = world.fundraisers.find((item) => item.title === fundraiserTitle);
    const metrics = activityMetrics.get(user.id);
    return {
      authoredFundraiser: describeFundraiser(fundraiser, 50),
      createsExactlyOne: world.fundraisers.filter((item) => item.creatorUserId === user.id).length === 1,
      selfSupport: supportsByFundraiser.get(fundraiser.id).some((item) => item.userId === user.id),
      supportsOnOtherFundraisers: supportsByUser.get(user.id)
        .filter((support) => support.fundraiserId !== fundraiser.id)
        .map(describeSupport),
      profile: {
        hours: metrics.hours,
        activities: metrics.activities,
        organizations: metrics.organizations,
        amountRaisedDollars: dollars(amountRaisedByUser.get(user.id)),
      },
    };
  }

  const representatives = [];
  function addRepresentative(predicate) {
    const item = world.fundraisers.find((fundraiser) => (
      !representatives.includes(fundraiser) && predicate(fundraiser, progress.get(fundraiser.id))
    ));
    if (item) representatives.push(item);
  }
  for (const title of [
    '100 Meal Boxes for Atlanta Families', 'Roswell Veterans Resource Day Fund',
    "Keep Atlanta's Waterways Clean This Fall", 'Summer Meal Box Fund',
  ]) addRepresentative((item) => item.title === title);
  addRepresentative((item, value) => lifecycleOf(item) === 'open' && value.supporterCount === 0);
  addRepresentative((item, value) => lifecycleOf(item) === 'open' && value.progressPercent > 0 && value.progressPercent < 25);
  addRepresentative((item, value) => value.progressPercent >= 50 && value.progressPercent < 80);
  addRepresentative((item, value) => value.progressPercent >= 80 && value.progressPercent < 100);
  addRepresentative((item, value) => value.progressPercent === 100);
  addRepresentative((item, value) => value.progressPercent > 100);
  addRepresentative((item, value) => lifecycleOf(item) === 'ended' && value.progressPercent < 50);
  addRepresentative((item, value) => lifecycleOf(item) === 'ended' && value.progressPercent >= 100);
  addRepresentative((item) => lifecycleOf(item) === 'cancelled');
  addRepresentative((item) => item.creatorUserId && !item.beneficiaryOrganizationId);
  addRepresentative((item) => item.creatorOrganizationId
    && item.beneficiaryOrganizationId
    && item.creatorOrganizationId !== item.beneficiaryOrganizationId);

  const representativeSupports = [];
  function addSupport(predicate) {
    const support = world.fundraiserSupports.find((item) => (
      !representativeSupports.includes(item) && predicate(describeSupport(item))
    ));
    if (support) representativeSupports.push(support);
  }
  const maya = world.users.find((user) => user.displayName === 'Maya Ellis');
  const david = world.users.find((user) => user.displayName === 'David Mercer');
  const mayaFundraiser = world.fundraisers.find((item) => item.creatorUserId === maya.id);
  const davidFundraiser = world.fundraisers.find((item) => item.creatorUserId === david.id);
  addSupport((item) => item.supporter === 'Maya Ellis' && item.fundraiser === davidFundraiser.title);
  addSupport((item) => item.supporter === 'David Mercer' && item.fundraiser === mayaFundraiser.title);
  addSupport((item) => item.causeMatch && item.followsCreator);
  addSupport((item) => item.followsBeneficiary);
  addSupport((item) => item.followsAnotherSupporter);
  addSupport((item) => !item.causeMatch);
  addSupport((item) => item.creatorType === 'user' && item.amountDollars <= 25);
  addSupport((item) => item.creatorType === 'organization' && item.amountDollars === 50);
  addSupport((item) => item.amountDollars === 100);
  addSupport((item) => item.amountDollars >= 250);

  const highestProgress = Math.max(...world.fundraisers.map(
    (item) => progress.get(item.id).progressPercent
  ));
  return {
    marketplace: {
      total: world.fundraisers.length,
      userCreated: userCreated.length,
      organizationCreated: organizationCreated.length,
      lifecycle: lifecycleCounts,
      linkedKyndBeneficiary: world.fundraisers.filter((item) => item.beneficiaryOrganizationId).length,
      externalBeneficiary: world.fundraisers.filter((item) => !item.beneficiaryOrganizationId).length,
      creatorBeneficiaryCombinations: {
        userLinkedKynd: userCreated.filter((item) => item.beneficiaryOrganizationId).length,
        userExternal: userCreated.filter((item) => !item.beneficiaryOrganizationId).length,
        organizationSelf: organizationCreated.filter((item) => (
          item.creatorOrganizationId === item.beneficiaryOrganizationId
        )).length,
        organizationOtherKynd: organizationCreated.filter((item) => (
          item.beneficiaryOrganizationId
          && item.creatorOrganizationId !== item.beneficiaryOrganizationId
        )).length,
        organizationExternal: organizationCreated.filter((item) => !item.beneficiaryOrganizationId).length,
      },
    },
    creators: {
      users: creatorDiagnostics(world.users, 'creatorUserId', CONFIG.userTiers, 'displayName'),
      organizations: creatorDiagnostics(
        world.organizations, 'creatorOrganizationId', CONFIG.organizationTiers, 'name'
      ),
    },
    goalsDollars: {
      overall: goalDistribution(world.fundraisers),
      userCreated: goalDistribution(userCreated),
      organizationCreated: goalDistribution(organizationCreated),
    },
    supports: {
      total: world.fundraiserSupports.length,
      byLifecycle: supportLifecycle,
      usersWithAtLeastOne: supportCounts.filter((value) => value > 0).length,
      usersWithZero: supportCounts.filter((value) => value === 0).length,
      perUser: distribution(supportCounts),
      byUserTier: supporterByTier,
      amountsDollars: {
        total: dollars(world.fundraiserSupports.reduce((sum, item) => sum + item.amountCents, 0)),
        ...distribution(supportAmounts),
        frequency: amountFrequency,
      },
    },
    traction: {
      all: distribution(world.fundraisers.map((item) => progress.get(item.id).supporterCount)),
      open: lifecycleTraction('open'),
      ended: lifecycleTraction('ended'),
      cancelled: lifecycleTraction('cancelled'),
      highestProgressPercent: highestProgress,
    },
    affinity: {
      causeMatchPercent: percentage(causeMatches, world.fundraiserSupports.length),
      userCreatorFollowPercent: percentage(userCreatorFollows, userCreatedRows),
      organizationCreatorFollowPercent: percentage(
        organizationCreatorFollows, organizationCreatedRows
      ),
      linkedBeneficiaryFollowPercent: percentage(beneficiaryFollows, linkedBeneficiaryRows),
      followsAnotherSupporterPercent: percentage(socialProof, world.fundraiserSupports.length),
      baselines: {
        declaredCauseSharePercent: percentage(
          world.users.reduce((sum, user) => sum + user.causes.length, 0),
          world.users.length * world.causes.length
        ),
        userFollowDensityPercent: percentage(
          world.userFollows.length, world.users.length * (world.users.length - 1)
        ),
        organizationFollowDensityPercent: percentage(
          world.organizationFollows.length, world.users.length * world.organizations.length
        ),
      },
    },
    beneficiaries: {
      linkedKyndFundraisers: world.fundraisers.filter((item) => item.beneficiaryOrganizationId).length,
      externalFundraisers: world.fundraisers.filter((item) => !item.beneficiaryOrganizationId).length,
      distinctKyndOrganizations: new Set(world.fundraisers
        .filter((item) => item.beneficiaryOrganizationId)
        .map((item) => item.beneficiaryOrganizationId)).size,
      distinctExternalBeneficiaries: new Set(world.fundraisers
        .filter((item) => !item.beneficiaryOrganizationId)
        .map((item) => item.beneficiaryName)).size,
      topBeneficiaries: [...beneficiaryCounts]
        .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
        .slice(0, 12).map(([name, fundraisers]) => ({ name, fundraisers })),
      byCause: Object.fromEntries(world.causes.map((cause) => [
        cause.name, world.fundraisers.filter((item) => item.causeId === cause.id).length,
      ])),
    },
    content: {
      withImage: world.fundraisers.filter((item) => item.imageUrl).length,
      imageCoveragePercent: percentage(
        world.fundraisers.filter((item) => item.imageUrl).length, world.fundraisers.length
      ),
      withoutImage: world.fundraisers.filter((item) => !item.imageUrl).length,
      distinctTitles: new Set(world.fundraisers.map((item) => item.title)).size,
      distinctStories: new Set(world.fundraisers.map((item) => item.story)).size,
    },
    anchors: {
      maya: anchorDiagnostics('Maya Ellis', '100 Meal Boxes for Atlanta Families'),
      david: anchorDiagnostics('David Mercer', 'Roswell Veterans Resource Day Fund'),
      riverlight: describeFundraiser(world.fundraisers.find(
        (item) => item.title === "Keep Atlanta's Waterways Clean This Fall"
      ), 10),
      mosaic: describeFundraiser(world.fundraisers.find(
        (item) => item.title === 'Summer Meal Box Fund'
      ), 10),
    },
    representativeFundraisers: representatives.map((item) => describeFundraiser(item)),
    representativeSupports: representativeSupports.map(describeSupport),
  };
}

module.exports = { buildFundraiserDiagnostics };
