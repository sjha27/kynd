const CONFIG = require('../config');
const { deterministicUuid } = require('./ids');
const { deriveProfileMetrics } = require('./activities');
const {
  deriveFundraiserProgress,
  deriveAmountRaisedByUser,
  lifecycleOf,
  localCalendarDate,
  easternTimestamp,
} = require('./fundraisers');
const {
  EXTERNAL_FUNDRAISER_BENEFICIARIES,
  USER_GOALS,
  ORGANIZATION_GOALS,
  SUPPORT_AMOUNTS,
  ANCHOR_FUNDRAISERS,
} = require('../data/fundraisers');

const UUID_V5_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUSES = new Set(['active', 'cancelled']);
const PROHIBITED_AGGREGATES = [
  'amountRaised', 'amountRaisedCents', 'supporterCount',
  'progress', 'progressPercent', 'percentFunded',
];

function assert(condition, message) {
  if (!condition) throw new Error(`Seed validation failed: ${message}`);
}

function nonblank(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function timestamp(label, value) {
  const parsed = new Date(value).getTime();
  assert(Number.isFinite(parsed), `${label} has invalid timestamp: ${value}`);
  return parsed;
}

function validDate(label, value) {
  assert(typeof value === 'string' && DATE_PATTERN.test(value), `${label} has invalid date: ${value}`);
  const parsed = new Date(`${value}T12:00:00Z`);
  assert(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value,
    `${label} has invalid calendar date: ${value}`);
  return value;
}

function count(rows, predicate) {
  return rows.filter(predicate).length;
}

function assertCount(label, actual, expected) {
  assert(actual === expected, `${label} count is ${actual}; expected ${expected}`);
}

function validateTargetCounts(world, lifecycleById) {
  const targets = CONFIG.fundraiserTargets;
  const userCreated = world.fundraisers.filter((item) => item.creatorUserId !== null);
  const organizationCreated = world.fundraisers.filter(
    (item) => item.creatorOrganizationId !== null
  );
  assertCount('fundraiser', world.fundraisers.length, CONFIG.counts.fundraisers);
  assertCount('user-created fundraiser', userCreated.length, targets.creators.user);
  assertCount(
    'organization-created fundraiser', organizationCreated.length, targets.creators.organization
  );
  for (const lifecycle of ['open', 'ended', 'cancelled']) {
    assertCount(
      `${lifecycle} fundraiser`,
      count(world.fundraisers, (item) => lifecycleById.get(item.id) === lifecycle),
      targets.lifecycle[lifecycle]
    );
  }

  const linked = world.fundraisers.filter((item) => item.beneficiaryOrganizationId !== null);
  const external = world.fundraisers.filter((item) => item.beneficiaryOrganizationId === null);
  assertCount('linked Kynd beneficiary fundraiser', linked.length, targets.beneficiaries.linkedKynd);
  assertCount('external beneficiary fundraiser', external.length, targets.beneficiaries.external);
  assertCount(
    'user-created linked-beneficiary fundraiser',
    count(userCreated, (item) => item.beneficiaryOrganizationId !== null),
    targets.beneficiaries.userLinkedKynd
  );
  assertCount(
    'user-created external-beneficiary fundraiser',
    count(userCreated, (item) => item.beneficiaryOrganizationId === null),
    targets.beneficiaries.userExternal
  );
  assertCount(
    'organization self-beneficiary fundraiser',
    count(organizationCreated, (item) => (
      item.creatorOrganizationId === item.beneficiaryOrganizationId
    )),
    targets.beneficiaries.organizationSelf
  );
  assertCount(
    'organization other-Kynd-beneficiary fundraiser',
    count(organizationCreated, (item) => (
      item.beneficiaryOrganizationId !== null
      && item.creatorOrganizationId !== item.beneficiaryOrganizationId
    )),
    targets.beneficiaries.organizationOtherKynd
  );
  assertCount(
    'organization external-beneficiary fundraiser',
    count(organizationCreated, (item) => item.beneficiaryOrganizationId === null),
    targets.beneficiaries.organizationExternal
  );

  const userById = new Map(world.users.map((user) => [user.id, user]));
  for (const [tier, expected] of Object.entries(targets.creators.userByTier)) {
    assertCount(
      `${tier} user-created fundraiser`,
      count(userCreated, (item) => userById.get(item.creatorUserId)?.tier === tier),
      expected
    );
  }
  const organizationById = new Map(world.organizations.map((item) => [item.id, item]));
  for (const [tier, expected] of Object.entries(targets.creators.organizationByTier)) {
    assertCount(
      `${tier} organization-created fundraiser`,
      count(organizationCreated, (item) => (
        organizationById.get(item.creatorOrganizationId)?.tier === tier
      )),
      expected
    );
  }
}

function validateAnchorFundraisers(world, maps, progress, lifecycleById) {
  for (const specification of ANCHOR_FUNDRAISERS) {
    const matches = world.fundraisers.filter((item) => item.title === specification.title);
    assert(matches.length === 1, `authored fundraiser ${specification.key} is missing or duplicated`);
    const fundraiser = matches[0];
    const creatorName = fundraiser.creatorUserId
      ? maps.userById.get(fundraiser.creatorUserId).displayName
      : maps.organizationById.get(fundraiser.creatorOrganizationId).name;
    const beneficiary = maps.organizationById.get(fundraiser.beneficiaryOrganizationId);
    const cause = maps.causeById.get(fundraiser.causeId);
    assert(fundraiser.id === deterministicUuid('fundraiser-anchor', specification.key),
      `${specification.key} deterministic identity changed`);
    assert(creatorName === (specification.creatorUser || specification.creatorOrganization),
      `${specification.key} creator changed`);
    assert(beneficiary?.name === specification.beneficiaryOrganization,
      `${specification.key} beneficiary changed`);
    assert(fundraiser.beneficiaryName === specification.beneficiaryOrganization,
      `${specification.key} beneficiary snapshot changed`);
    assert(cause?.name === specification.cause, `${specification.key} cause changed`);
    assert(fundraiser.goalAmountCents === specification.goalAmountCents,
      `${specification.key} goal changed`);
    assert(fundraiser.status === specification.status, `${specification.key} status changed`);
    const intendedLifecycle = specification.endDayOffset < 0 ? 'ended' : 'open';
    assert(lifecycleById.get(fundraiser.id) === intendedLifecycle,
      `${specification.key} lifecycle changed`);
    assert(nonblank(fundraiser.imageUrl), `${specification.key} image changed`);
    const expectedTotal = specification.supportAmounts.reduce((sum, amount) => sum + amount, 0);
    const derived = progress.get(fundraiser.id);
    assert(derived.amountRaisedCents === expectedTotal,
      `${specification.key} derived raised total changed`);
    assert(derived.supporterCount === specification.supportAmounts.length,
      `${specification.key} supporter count changed`);
    assert(derived.progressPercent === Number(
      (expectedTotal * 100 / specification.goalAmountCents).toFixed(2)
    ), `${specification.key} derived progress changed`);

    if (specification.requiredSupporter) {
      const supporter = world.users.find(
        (user) => user.displayName === specification.requiredSupporter
      );
      const support = world.fundraiserSupports.find((item) => (
        item.fundraiserId === fundraiser.id && item.userId === supporter.id
      ));
      assert(support, `${specification.key} required supporter is missing`);
      assert(support.amountCents === specification.requiredAmountCents,
        `${specification.key} required support amount changed`);
    }
  }

  for (const [name, expected] of [['Maya Ellis', 1], ['David Mercer', 1]]) {
    const user = world.users.find((candidate) => candidate.displayName === name);
    assertCount(
      `${name} created fundraiser`,
      count(world.fundraisers, (item) => item.creatorUserId === user.id),
      expected
    );
  }
}

function validateFundraisers(world) {
  const maps = {
    userById: new Map(world.users.map((user) => [user.id, user])),
    organizationById: new Map(world.organizations.map((item) => [item.id, item])),
    causeById: new Map(world.causes.map((cause) => [cause.id, cause])),
  };
  const externalByName = new Map(
    EXTERNAL_FUNDRAISER_BENEFICIARIES.map((item) => [item.name, item])
  );
  assert(externalByName.size === EXTERNAL_FUNDRAISER_BENEFICIARIES.length,
    'external fundraiser beneficiary names are duplicated');
  for (const organization of world.organizations) {
    assert(!externalByName.has(organization.name),
      `external fundraiser beneficiary duplicates Kynd organization ${organization.name}`);
  }

  const anchor = timestamp('configured anchor', CONFIG.anchorDate);
  const lifecycleById = new Map(world.fundraisers.map((item) => [item.id, lifecycleOf(item)]));
  validateTargetCounts(world, lifecycleById);
  const fundraiserIds = new Set();
  const allowedUserGoals = new Set(USER_GOALS.map((item) => item.value));
  const allowedOrganizationGoals = new Set(ORGANIZATION_GOALS.map((item) => item.value));
  const anchorTitles = new Set(ANCHOR_FUNDRAISERS.map((item) => item.title));

  for (const fundraiser of world.fundraisers) {
    assert(UUID_V5_PATTERN.test(fundraiser.id), `fundraiser has invalid UUIDv5: ${fundraiser.id}`);
    assert(!fundraiserIds.has(fundraiser.id), `duplicate fundraiser ID: ${fundraiser.id}`);
    fundraiserIds.add(fundraiser.id);
    for (const field of PROHIBITED_AGGREGATES) {
      assert(!Object.hasOwn(fundraiser, field), `fundraiser ${fundraiser.id} stores derived ${field}`);
    }
    assert(nonblank(fundraiser.title), `fundraiser ${fundraiser.id} has blank title`);
    assert(nonblank(fundraiser.story), `fundraiser ${fundraiser.id} has blank story`);
    assert(VALID_STATUSES.has(fundraiser.status), `fundraiser ${fundraiser.id} has invalid status`);
    assert(Number.isSafeInteger(fundraiser.goalAmountCents)
      && fundraiser.goalAmountCents >= CONFIG.fundraiserTargets.goalBounds.minimum
      && fundraiser.goalAmountCents <= CONFIG.fundraiserTargets.goalBounds.maximum,
    `fundraiser ${fundraiser.id} has invalid goal`);
    assert(fundraiser.imageUrl === null
      || (nonblank(fundraiser.imageUrl) && fundraiser.imageUrl.startsWith('/demo-assets/fundraisers/')),
    `fundraiser ${fundraiser.id} has invalid image reference`);

    const hasUserCreator = fundraiser.creatorUserId !== null;
    const hasOrganizationCreator = fundraiser.creatorOrganizationId !== null;
    assert(hasUserCreator !== hasOrganizationCreator,
      `fundraiser ${fundraiser.id} must have exactly one creator`);
    const creator = hasUserCreator
      ? maps.userById.get(fundraiser.creatorUserId)
      : maps.organizationById.get(fundraiser.creatorOrganizationId);
    assert(creator, `fundraiser ${fundraiser.id} references missing creator`);
    const cause = maps.causeById.get(fundraiser.causeId);
    assert(cause, `fundraiser ${fundraiser.id} references missing cause`);
    assert(creator.causes.includes(cause.name),
      `fundraiser ${fundraiser.id} cause does not match creator`);
    assert(nonblank(fundraiser.beneficiaryName),
      `fundraiser ${fundraiser.id} has blank beneficiary name`);

    let beneficiary = null;
    if (fundraiser.beneficiaryOrganizationId !== null) {
      beneficiary = maps.organizationById.get(fundraiser.beneficiaryOrganizationId);
      assert(beneficiary, `fundraiser ${fundraiser.id} references missing beneficiary organization`);
      assert(fundraiser.beneficiaryName === beneficiary.name,
        `fundraiser ${fundraiser.id} beneficiary snapshot does not match`);
      assert(beneficiary.causes.includes(cause.name),
        `fundraiser ${fundraiser.id} cause does not match linked beneficiary`);
    } else {
      const external = externalByName.get(fundraiser.beneficiaryName);
      assert(external, `fundraiser ${fundraiser.id} has unknown external beneficiary`);
      assert(external.cause === cause.name,
        `fundraiser ${fundraiser.id} cause does not match external beneficiary`);
    }

    const createdAt = timestamp(`${fundraiser.id} createdAt`, fundraiser.createdAt);
    assert(createdAt <= anchor, `fundraiser ${fundraiser.id} was created after anchor`);
    assert(createdAt >= timestamp(`${fundraiser.id} creator creation`, creator.createdAt),
      `fundraiser ${fundraiser.id} was created before creator existed`);
    if (beneficiary) {
      assert(createdAt >= timestamp(`${fundraiser.id} beneficiary creation`, beneficiary.createdAt),
        `fundraiser ${fundraiser.id} was created before beneficiary existed`);
    }
    validDate(`${fundraiser.id} endDate`, fundraiser.endDate);
    assert(fundraiser.endDate >= localCalendarDate(fundraiser.createdAt),
      `fundraiser ${fundraiser.id} ends before its creation date`);

    if (!anchorTitles.has(fundraiser.title)) {
      // Identity is keyed on the generation slot, not createdAt, so that
      // ageing the world leaves fundraiser ids (and everything pointing at
      // them) untouched.
      const expectedId = deterministicUuid('fundraiser', [
        fundraiser.creatorUserId || fundraiser.creatorOrganizationId,
        fundraiser.beneficiaryName, fundraiser.title,
        `slot-${String(fundraiser.slotIndex).padStart(4, '0')}`,
      ].join('|'));
      assert(fundraiser.id === expectedId, `fundraiser ${fundraiser.id} identity is not deterministic`);
      const allowedGoals = hasUserCreator ? allowedUserGoals : allowedOrganizationGoals;
      assert(allowedGoals.has(fundraiser.goalAmountCents),
        `fundraiser ${fundraiser.id} goal is outside configured creator options`);
    }
  }

  const imageCount = count(world.fundraisers, (item) => item.imageUrl !== null);
  assert(imageCount / world.fundraisers.length >= 0.8
    && imageCount / world.fundraisers.length <= 0.9,
  `fundraiser image coverage is ${(imageCount * 100 / world.fundraisers.length).toFixed(1)}%`);
  assert(new Set(world.fundraisers.map((item) => item.title)).size >= 180,
    'fundraiser title variety is too low');

  assertCount(
    'fundraiser support', world.fundraiserSupports.length, CONFIG.counts.fundraiserSupports
  );
  const supportIds = new Set();
  const supportPairs = new Set();
  const allowedAmounts = new Set(SUPPORT_AMOUNTS.map((item) => item.value));
  const supportsByLifecycle = { open: 0, ended: 0, cancelled: 0 };
  for (const support of world.fundraiserSupports) {
    assert(UUID_V5_PATTERN.test(support.id), `fundraiser support has invalid UUIDv5: ${support.id}`);
    assert(!supportIds.has(support.id), `duplicate fundraiser support ID: ${support.id}`);
    supportIds.add(support.id);
    const pair = `${support.userId}|${support.fundraiserId}`;
    assert(!supportPairs.has(pair), `duplicate fundraiser support relationship: ${pair}`);
    supportPairs.add(pair);
    assert(support.id === deterministicUuid('fundraiser-support', pair),
      `fundraiser support ${support.id} identity is not deterministic`);
    const user = maps.userById.get(support.userId);
    const fundraiser = world.fundraisers.find((item) => item.id === support.fundraiserId);
    assert(user, `fundraiser support ${support.id} references missing user`);
    assert(fundraiser, `fundraiser support ${support.id} references missing fundraiser`);
    assert(allowedAmounts.has(support.amountCents),
      `fundraiser support ${support.id} has invalid amount`);
    assert(Number.isSafeInteger(support.amountCents) && support.amountCents > 0,
      `fundraiser support ${support.id} amount is not positive integer cents`);
    assert(support.amountCents <= fundraiser.goalAmountCents,
      `fundraiser support ${support.id} exceeds campaign goal`);
    assert(support.userId !== fundraiser.creatorUserId,
      `fundraiser support ${support.id} is user creator self-support`);
    const lifecycle = lifecycleById.get(fundraiser.id);
    assert(lifecycle !== 'cancelled', `cancelled fundraiser ${fundraiser.id} has support`);
    supportsByLifecycle[lifecycle] += 1;
    const supportedAt = timestamp(`${support.id} supportedAt`, support.supportedAt);
    assert(supportedAt >= timestamp(`${support.id} user creation`, user.createdAt),
      `fundraiser support ${support.id} predates user`);
    assert(supportedAt >= timestamp(`${support.id} fundraiser creation`, fundraiser.createdAt),
      `fundraiser support ${support.id} predates fundraiser`);
    assert(supportedAt <= anchor, `fundraiser support ${support.id} is after anchor`);
    assert(supportedAt <= timestamp(
      `${support.id} fundraiser end`, easternTimestamp(fundraiser.endDate, '23:59:59')
    ), `fundraiser support ${support.id} is after fundraiser end`);
  }
  for (const lifecycle of ['open', 'ended', 'cancelled']) {
    assertCount(
      `${lifecycle} fundraiser support`, supportsByLifecycle[lifecycle],
      CONFIG.fundraiserTargets.supports[lifecycle]
    );
  }

  const progress = deriveFundraiserProgress(world);
  validateAnchorFundraisers(world, maps, progress, lifecycleById);
  const amountRaised = deriveAmountRaisedByUser(world);
  const activityMetrics = deriveProfileMetrics(world);
  for (const [name, expected] of [
    ['Maya Ellis', { hours: 17.5, activities: 5, organizations: 4, amountRaised: 65000 }],
    ['David Mercer', { hours: 34, activities: 12, organizations: 9, amountRaised: 185000 }],
  ]) {
    const user = world.users.find((candidate) => candidate.displayName === name);
    const activity = activityMetrics.get(user.id);
    assert(activity.hours === expected.hours, `${name} derived Hours changed`);
    assert(activity.activities === expected.activities, `${name} derived Activities changed`);
    assert(activity.organizations === expected.organizations, `${name} derived Organizations changed`);
    assert(amountRaised.get(user.id) === expected.amountRaised, `${name} derived Amount Raised changed`);
  }
  return true;
}

module.exports = { validateFundraisers, PROHIBITED_AGGREGATES };
