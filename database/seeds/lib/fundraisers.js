const CONFIG = require('../config');
const { chance, pick, randomInt, weightedPick } = require('./random');
const { deterministicUuid } = require('./ids');
const {
  EXTERNAL_FUNDRAISER_BENEFICIARIES,
  FUNDRAISER_THEMES,
  USER_GOALS,
  ORGANIZATION_GOALS,
  SUPPORT_AMOUNTS,
  ANCHOR_FUNDRAISERS,
} = require('../data/fundraisers');

const DAY_MS = 24 * 60 * 60 * 1000;
const USER_CREATOR_UNIQUES = Object.freeze({
  light: 25, regular: 38, highly_active: 25, connector: 12,
});
const ORGANIZATION_CREATOR_UNIQUES = Object.freeze({
  community: 16, established: 25, high_visibility: 12,
});
const USER_CREATOR_CAPS = Object.freeze({
  light: 2, regular: 3, highly_active: 4, connector: 4,
});
const ORGANIZATION_CREATOR_CAPS = Object.freeze({
  community: 2, established: 3, high_visibility: 3,
});
const SUPPORTER_CAPS = Object.freeze({
  light: 7, regular: 9, highly_active: 11, connector: 13,
});
const TRACTION_PERCENTAGES = Object.freeze({
  low: [10, 15, 20],
  medium: [30, 40, 45],
  midhigh: [55, 65, 75],
  near: [82, 88, 95],
  met: [100, 108, 115],
  over: [125, 140],
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
  const date = new Date(`${CONFIG.anchorDate.slice(0, 10)}T12:00:00Z`);
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
  return dateString >= dstStart && dateString < dstEnd ? '-04:00' : '-05:00';
}

function easternTimestamp(dateString, time = '12:00:00') {
  return new Date(`${dateString}T${time}${easternOffsetForDate(dateString)}`).toISOString();
}

function localCalendarDate(timestamp) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function lifecycleOf(fundraiser) {
  if (fundraiser.status === 'cancelled') return 'cancelled';
  return fundraiser.endDate < localCalendarDate(CONFIG.anchorDate) ? 'ended' : 'open';
}

function weightedSampleWithoutReplacement(rng, candidates, count, weightFor) {
  return candidates.map((entity) => ({
    entity,
    key: -Math.log(Math.max(rng(), Number.EPSILON)) / weightFor(entity),
  })).sort((first, second) => (
    first.key - second.key || first.entity.id.localeCompare(second.entity.id)
  )).slice(0, count).map(({ entity }) => entity);
}

function creatorQuotas(
  rng, entities, rowTargets, uniqueTargets, caps, fixedNames, nameKey
) {
  const quotas = new Map(entities.map((entity) => [entity.id, 0]));
  const appeal = new Map(entities.map((entity) => [entity.id, 0.75 + rng() * 0.5]));
  for (const tier of Object.keys(rowTargets)) {
    const tierEntities = entities.filter((entity) => entity.tier === tier);
    const fixed = tierEntities.filter((entity) => fixedNames.has(entity[nameKey]));
    for (const entity of fixed) quotas.set(entity.id, 1);
    const selected = fixed.concat(weightedSampleWithoutReplacement(
      rng,
      tierEntities.filter((entity) => !fixed.includes(entity)),
      uniqueTargets[tier] - fixed.length,
      (entity) => appeal.get(entity.id)
    ));
    for (const entity of selected) if (quotas.get(entity.id) === 0) quotas.set(entity.id, 1);
    let remaining = rowTargets[tier]
      - tierEntities.reduce((sum, entity) => sum + quotas.get(entity.id), 0);
    while (remaining > 0) {
      const candidates = selected.filter((entity) => (
        !fixedNames.has(entity[nameKey]) && quotas.get(entity.id) < caps[tier]
      ));
      if (!candidates.length) throw new Error(`Unable to allocate ${tier} fundraiser creators`);
      const selectedEntity = weightedPick(rng, candidates.map((entity) => ({
        entity,
        weight: appeal.get(entity.id) / Math.pow(quotas.get(entity.id) + 1, 1.3),
      }))).entity;
      quotas.set(selectedEntity.id, quotas.get(selectedEntity.id) + 1);
      remaining -= 1;
    }
  }
  return quotas;
}

function remainingCreatorSequence(rng, entities, quotas, consumedNames, nameKey) {
  const remaining = new Map(quotas);
  for (const name of consumedNames) {
    const entity = entities.find((candidate) => candidate[nameKey] === name);
    remaining.set(entity.id, remaining.get(entity.id) - 1);
  }
  return shuffled(rng, entities.flatMap((entity) => (
    repeated(entity, remaining.get(entity.id))
  )));
}

function anchorFundraisers(causes, users, organizations) {
  const causeByName = new Map(causes.map((cause) => [cause.name, cause]));
  const userByName = new Map(users.map((user) => [user.displayName, user]));
  const organizationByName = new Map(organizations.map((item) => [item.name, item]));
  return ANCHOR_FUNDRAISERS.map((spec) => {
    const creatorUser = spec.creatorUser ? userByName.get(spec.creatorUser) : null;
    const creatorOrganization = spec.creatorOrganization
      ? organizationByName.get(spec.creatorOrganization) : null;
    const beneficiary = organizationByName.get(spec.beneficiaryOrganization);
    return {
      id: deterministicUuid('fundraiser-anchor', spec.key),
      title: spec.title,
      story: spec.story,
      causeId: causeByName.get(spec.cause).id,
      creatorUserId: creatorUser?.id || null,
      creatorOrganizationId: creatorOrganization?.id || null,
      beneficiaryOrganizationId: beneficiary.id,
      beneficiaryName: beneficiary.name,
      goalAmountCents: spec.goalAmountCents,
      endDate: localDateAtOffset(spec.endDayOffset),
      imageUrl: spec.imageUrl,
      status: spec.status,
      createdAt: easternTimestamp(localDateAtOffset(spec.createdDayOffset), '10:00:00'),
    };
  });
}

function generatedSlots(rng) {
  const beneficiaryTypes = shuffled(rng, [
    ...repeated('user_linked', 103),
    ...repeated('user_external', 70),
    ...repeated('organization_self', 53),
    ...repeated('organization_other', 10),
    ...repeated('organization_external', 10),
  ]);
  const lifecycles = shuffled(rng, [
    ...repeated('open', 147), ...repeated('ended', 79), ...repeated('cancelled', 20),
  ]);
  return beneficiaryTypes.map((beneficiaryType, index) => ({
    beneficiaryType, lifecycle: lifecycles[index],
  }));
}

function chooseBalanced(rng, values, counts, keyFor, eligibleWeight = () => 1) {
  return weightedPick(rng, values.map((value) => ({
    value,
    weight: eligibleWeight(value) / Math.pow(1 + (counts.get(keyFor(value)) || 0), 0.8),
  }))).value;
}

function generatedTiming(rng, lifecycle, creator, beneficiaryOrganization) {
  const dependencyTimestamp = Math.max(
    new Date(creator.createdAt).getTime(),
    beneficiaryOrganization ? new Date(beneficiaryOrganization.createdAt).getTime() : 0
  );
  const dependencyDate = localCalendarDate(new Date(dependencyTimestamp).toISOString());
  let endDate;
  if (lifecycle === 'ended') {
    const dependencyAge = Math.max(2, Math.floor((
      new Date(`${CONFIG.anchorDate.slice(0, 10)}T12:00:00Z`)
      - new Date(`${dependencyDate}T12:00:00Z`)
    ) / DAY_MS));
    endDate = localDateAtOffset(-randomInt(rng, 1, Math.min(150, dependencyAge - 1)));
  } else {
    endDate = localDateAtOffset(randomInt(rng, lifecycle === 'open' ? 0 : 5, 120));
  }
  const upper = Math.min(
    new Date(CONFIG.anchorDate).getTime(),
    new Date(easternTimestamp(endDate, '20:00:00')).getTime()
  );
  const creationWindowDays = lifecycle === 'ended' ? 120 : 180;
  const lower = Math.max(
    dependencyTimestamp,
    new Date(easternTimestamp(endDate, '20:00:00')).getTime()
      - creationWindowDays * DAY_MS
  );
  const createdAt = new Date(
    lower + Math.floor(rng() * (upper - lower + 1))
  ).toISOString();
  return { endDate, createdAt };
}

function generateFundraisers(rng, world) {
  const fundraisers = anchorFundraisers(world.causes, world.users, world.organizations);
  const causeByName = new Map(world.causes.map((cause) => [cause.name, cause]));
  const userTargets = CONFIG.fundraiserTargets.creators.userByTier;
  const organizationTargets = CONFIG.fundraiserTargets.creators.organizationByTier;
  const userQuotas = creatorQuotas(
    rng, world.users, userTargets, USER_CREATOR_UNIQUES, USER_CREATOR_CAPS,
    new Set(['Maya Ellis', 'David Mercer']), 'displayName'
  );
  const organizationQuotas = creatorQuotas(
    rng, world.organizations, organizationTargets, ORGANIZATION_CREATOR_UNIQUES,
    ORGANIZATION_CREATOR_CAPS,
    new Set(['Riverlight Atlanta', 'Mosaic Meals Collective']), 'name'
  );
  const userCreators = remainingCreatorSequence(
    rng, world.users, userQuotas, ['Maya Ellis', 'David Mercer'], 'displayName'
  );
  const organizationCreators = remainingCreatorSequence(
    rng, world.organizations, organizationQuotas,
    ['Riverlight Atlanta', 'Mosaic Meals Collective'], 'name'
  );
  const beneficiaryCounts = new Map();
  const causeCounts = new Map(world.causes.map((cause) => [cause.name, 0]));
  let userCursor = 0;
  let organizationCursor = 0;

  generatedSlots(rng).forEach((slot, index) => {
    const userCreated = slot.beneficiaryType.startsWith('user_');
    const creator = userCreated
      ? userCreators[userCursor++] : organizationCreators[organizationCursor++];
    let beneficiaryOrganization = null;
    let externalBeneficiary = null;
    let causeName;

    if (slot.beneficiaryType === 'user_linked') {
      const candidates = world.organizations.filter((organization) => (
        organization.causes.some((cause) => creator.causes.includes(cause))
      ));
      beneficiaryOrganization = chooseBalanced(
        rng, candidates, beneficiaryCounts, (item) => item.name,
        (item) => item.causes.filter((cause) => creator.causes.includes(cause)).length
      );
      const shared = beneficiaryOrganization.causes.filter((cause) => creator.causes.includes(cause));
      causeName = chooseBalanced(rng, shared, causeCounts, (name) => name);
    } else if (slot.beneficiaryType === 'user_external') {
      const candidates = EXTERNAL_FUNDRAISER_BENEFICIARIES.filter(
        (item) => creator.causes.includes(item.cause)
      );
      externalBeneficiary = chooseBalanced(
        rng, candidates, beneficiaryCounts, (item) => item.name,
        (item) => 1 / (1 + causeCounts.get(item.cause) / 10)
      );
      causeName = externalBeneficiary.cause;
    } else if (slot.beneficiaryType === 'organization_self') {
      beneficiaryOrganization = creator;
      causeName = chooseBalanced(rng, creator.causes, causeCounts, (name) => name);
    } else if (slot.beneficiaryType === 'organization_other') {
      const candidates = world.organizations.filter((organization) => (
        organization.id !== creator.id
        && organization.causes.some((cause) => creator.causes.includes(cause))
      ));
      beneficiaryOrganization = chooseBalanced(
        rng, candidates, beneficiaryCounts, (item) => item.name,
        (item) => item.causes.filter((cause) => creator.causes.includes(cause)).length
      );
      const shared = beneficiaryOrganization.causes.filter((cause) => creator.causes.includes(cause));
      causeName = chooseBalanced(rng, shared, causeCounts, (name) => name);
    } else {
      const candidates = EXTERNAL_FUNDRAISER_BENEFICIARIES.filter(
        (item) => creator.causes.includes(item.cause)
      );
      externalBeneficiary = chooseBalanced(
        rng, candidates, beneficiaryCounts, (item) => item.name,
        (item) => 1 / (1 + causeCounts.get(item.cause) / 10)
      );
      causeName = externalBeneficiary.cause;
    }

    const beneficiaryName = beneficiaryOrganization?.name || externalBeneficiary.name;
    const theme = FUNDRAISER_THEMES[causeName];
    const baseTitle = pick(rng, theme.titles);
    const title = userCreated
      ? `${baseTitle} for ${beneficiaryName}`
      : `${baseTitle}: ${beneficiaryName}`;
    const story = userCreated
      ? `${theme.userStory} ${creator.displayName} is organizing this campaign for ${beneficiaryName}.`
      : `${theme.organizationStory} ${creator.name} is leading the campaign for ${beneficiaryName}.`;
    const goal = weightedPick(rng, userCreated ? USER_GOALS : ORGANIZATION_GOALS).value;
    const timing = generatedTiming(rng, slot.lifecycle, creator, beneficiaryOrganization);
    const created = {
      title,
      story,
      causeId: causeByName.get(causeName).id,
      creatorUserId: userCreated ? creator.id : null,
      creatorOrganizationId: userCreated ? null : creator.id,
      beneficiaryOrganizationId: beneficiaryOrganization?.id || null,
      beneficiaryName,
      goalAmountCents: goal,
      endDate: timing.endDate,
      imageUrl: chance(rng, CONFIG.fundraiserTargets.imageCoverage)
        ? `/demo-assets/fundraisers/${causeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/campaign-${String(index + 1).padStart(3, '0')}.jpg`
        : null,
      status: slot.lifecycle === 'cancelled' ? 'cancelled' : 'active',
      createdAt: timing.createdAt,
    };
    created.id = deterministicUuid('fundraiser', [
      created.creatorUserId || created.creatorOrganizationId,
      created.beneficiaryName, created.title, created.createdAt,
    ].join('|'));
    fundraisers.push(created);
    beneficiaryCounts.set(beneficiaryName, (beneficiaryCounts.get(beneficiaryName) || 0) + 1);
    causeCounts.set(causeName, causeCounts.get(causeName) + 1);
  });
  return fundraisers;
}

function targetRaised(goalAmountCents, traction, rng) {
  if (traction === 'zero') return 0;
  const percentage = pick(rng, TRACTION_PERCENTAGES[traction]);
  return Math.max(500, Math.round(goalAmountCents * percentage / 100 / 500) * 500);
}

function tractionPlan(rng, fundraisers) {
  const plan = new Map();
  const anchorByTitle = new Map(ANCHOR_FUNDRAISERS.map((item) => [item.title, item]));
  for (const fundraiser of fundraisers.filter((item) => anchorByTitle.has(item.title))) {
    const spec = anchorByTitle.get(fundraiser.title);
    plan.set(fundraiser.id, {
      traction: spec.key === 'riverlight-waterways' ? 'near'
        : spec.key === 'mosaic-summer-meals' ? 'met' : 'midhigh',
      targetRaisedCents: spec.supportAmounts.reduce((sum, value) => sum + value, 0),
      fixedAmounts: spec.supportAmounts,
      requiredSupporter: spec.requiredSupporter || null,
      requiredAmountCents: spec.requiredAmountCents || null,
    });
  }

  const definitions = {
    open: { zero: 25, low: 30, medium: 35, midhigh: 28, near: 19, met: 7, over: 3 },
    ended: { zero: 10, low: 10, medium: 15, midhigh: 15, near: 10, met: 14, over: 5 },
  };
  for (const lifecycle of ['open', 'ended']) {
    const campaigns = fundraisers.filter((item) => (
      lifecycleOf(item) === lifecycle && !plan.has(item.id)
    )).map((fundraiser) => ({ fundraiser, jitter: 0.82 + rng() * 0.36 }))
      .sort((first, second) => (
        second.fundraiser.goalAmountCents * second.jitter
          - first.fundraiser.goalAmountCents * first.jitter
        || first.fundraiser.id.localeCompare(second.fundraiser.id)
      ));
    const classes = Object.entries(definitions[lifecycle]).flatMap(
      ([name, count]) => repeated(name, count)
    ).sort((first, second) => {
      const rank = { zero: 0, low: 1, medium: 2, midhigh: 3, near: 4, met: 5, over: 6 };
      return rank[first] - rank[second];
    });
    campaigns.forEach(({ fundraiser }, index) => {
      const traction = classes[index];
      plan.set(fundraiser.id, {
        traction,
        targetRaisedCents: targetRaised(fundraiser.goalAmountCents, traction, rng),
      });
    });
  }
  for (const fundraiser of fundraisers.filter((item) => lifecycleOf(item) === 'cancelled')) {
    plan.set(fundraiser.id, { traction: 'zero', targetRaisedCents: 0 });
  }
  return plan;
}

function supportCountRange(fundraiser, target) {
  if (target === 0) return { minimum: 0, maximum: 0 };
  const maximumAmount = Math.min(
    fundraiser.goalAmountCents,
    Math.max(...SUPPORT_AMOUNTS.map((item) => item.value))
  );
  return {
    minimum: Math.ceil(target / maximumAmount),
    maximum: Math.min(45, Math.floor(target / 500)),
  };
}

function allocateSupportCounts(rng, fundraisers, plan, lifecycle, targetCount) {
  const campaigns = fundraisers.filter((item) => lifecycleOf(item) === lifecycle);
  const counts = new Map();
  const anchorCounts = new Map([
    ['100 Meal Boxes for Atlanta Families', 10],
    ['Roswell Veterans Resource Day Fund', 15],
    ["Keep Atlanta's Waterways Clean This Fall", 24],
    ['Summer Meal Box Fund', 20],
  ]);
  for (const fundraiser of campaigns) {
    const target = plan.get(fundraiser.id).targetRaisedCents;
    const range = supportCountRange(fundraiser, target);
    const fixed = anchorCounts.get(fundraiser.title);
    counts.set(fundraiser.id, fixed === undefined
      ? Math.max(range.minimum, Math.min(range.maximum, Math.round(target / 18000)))
      : fixed);
  }
  let difference = targetCount - [...counts.values()].reduce((sum, value) => sum + value, 0);
  while (difference !== 0) {
    const direction = difference > 0 ? 1 : -1;
    const candidates = campaigns.filter((fundraiser) => {
      if (anchorCounts.has(fundraiser.title)) return false;
      const range = supportCountRange(fundraiser, plan.get(fundraiser.id).targetRaisedCents);
      return direction > 0
        ? counts.get(fundraiser.id) < range.maximum
        : counts.get(fundraiser.id) > range.minimum;
    });
    if (!candidates.length) throw new Error(`Unable to allocate ${targetCount} ${lifecycle} supports`);
    const selected = weightedPick(rng, candidates.map((fundraiser) => ({
      fundraiser,
      weight: direction > 0
        ? 1 / Math.pow(counts.get(fundraiser.id) + 1, 0.8)
        : Math.pow(counts.get(fundraiser.id), 0.8),
    }))).fundraiser;
    counts.set(selected.id, counts.get(selected.id) + direction);
    difference -= direction;
  }
  return counts;
}

function amountsForTarget(rng, fundraiser, target, count) {
  if (target === 0 && count === 0) return [];
  const options = SUPPORT_AMOUNTS.filter((item) => item.value <= fundraiser.goalAmountCents);
  const units = options.map((item) => ({ ...item, units: item.value / 500 }));
  const targetUnits = target / 500;
  const memo = new Map();
  function canFill(slots, remaining) {
    const key = `${slots}|${remaining}`;
    if (memo.has(key)) return memo.get(key);
    if (slots === 0) return remaining === 0;
    const minimum = units[0].units;
    const maximum = units[units.length - 1].units;
    if (remaining < slots * minimum || remaining > slots * maximum) return false;
    const possible = units.some((item) => canFill(slots - 1, remaining - item.units));
    memo.set(key, possible);
    return possible;
  }
  if (!canFill(count, targetUnits)) {
    throw new Error(`Unable to construct ${count} support amounts totaling ${target}`);
  }
  const amounts = [];
  let remaining = targetUnits;
  for (let slots = count; slots > 0; slots -= 1) {
    const candidates = units.filter((item) => (
      item.units <= remaining && canFill(slots - 1, remaining - item.units)
    ));
    const selected = weightedPick(rng, candidates);
    amounts.push(selected.value);
    remaining -= selected.units;
  }
  return shuffled(rng, amounts);
}

function supporterPool(rng, users) {
  const required = users.filter((user) => ['Maya Ellis', 'David Mercer'].includes(user.displayName));
  const requiredIds = new Set(required.map((user) => user.id));
  const tierWeight = { light: 1, regular: 1.08, highly_active: 1.14, connector: 1.2 };
  return required.concat(weightedSampleWithoutReplacement(
    rng,
    users.filter((user) => !requiredIds.has(user.id)),
    CONFIG.fundraiserTargets.supporterPoolSize - required.length,
    (user) => tierWeight[user.tier]
  ));
}

function supportSignals(world) {
  return {
    userFollows: new Set(world.userFollows.map(
      (row) => `${row.followerUserId}|${row.followedUserId}`
    )),
    organizationFollows: new Set(world.organizationFollows.map(
      (row) => `${row.userId}|${row.organizationId}`
    )),
  };
}

function supportDeadline(fundraiser) {
  const anchor = new Date(CONFIG.anchorDate).getTime();
  const campaignEnd = new Date(easternTimestamp(fundraiser.endDate, '23:59:59')).getTime();
  return Math.min(anchor, campaignEnd);
}

function supporterAffinity(user, fundraiser, existing, maps, signals, supportCounts) {
  const cause = maps.causeById.get(fundraiser.causeId).name;
  let score = user.causes.includes(cause) ? 8 : 0.8;
  if (fundraiser.creatorUserId
    && signals.userFollows.has(`${user.id}|${fundraiser.creatorUserId}`)) score *= 3.1;
  if (fundraiser.creatorOrganizationId
    && signals.organizationFollows.has(`${user.id}|${fundraiser.creatorOrganizationId}`)) score *= 3;
  if (fundraiser.beneficiaryOrganizationId
    && signals.organizationFollows.has(`${user.id}|${fundraiser.beneficiaryOrganizationId}`)) score *= 2.7;
  const followedSupporters = existing.filter((other) => (
    signals.userFollows.has(`${user.id}|${other.id}`)
  )).length;
  score *= 1 + Math.min(followedSupporters, 3) * 0.72;
  if (fundraiser.creatorUserId) {
    const creator = maps.userById.get(fundraiser.creatorUserId);
    if (creator.tier === 'connector') score *= 1.12;
    else if (creator.tier === 'highly_active') score *= 1.06;
  } else {
    const creator = maps.organizationById.get(fundraiser.creatorOrganizationId);
    if (creator.tier === 'high_visibility') score *= 1.12;
    else if (creator.tier === 'established') score *= 1.06;
  }
  return score / Math.pow(1 + supportCounts.get(user.id), 1.35);
}

function generateFundraiserSupports(rng, world, fundraisers) {
  const plan = tractionPlan(rng, fundraisers);
  const counts = new Map([
    ...allocateSupportCounts(
      rng, fundraisers, plan, 'open', CONFIG.fundraiserTargets.supports.open
    ),
    ...allocateSupportCounts(
      rng, fundraisers, plan, 'ended', CONFIG.fundraiserTargets.supports.ended
    ),
  ]);
  for (const fundraiser of fundraisers.filter((item) => lifecycleOf(item) === 'cancelled')) {
    counts.set(fundraiser.id, 0);
  }

  const pool = supporterPool(rng, world.users);
  const supportCounts = new Map(world.users.map((user) => [user.id, 0]));
  const signals = supportSignals(world);
  const maps = {
    userById: new Map(world.users.map((user) => [user.id, user])),
    organizationById: new Map(world.organizations.map((item) => [item.id, item])),
    causeById: new Map(world.causes.map((cause) => [cause.id, cause])),
  };
  const anchorSpecs = new Map(ANCHOR_FUNDRAISERS.map((item) => [item.title, item]));
  const supports = [];

  for (const fundraiser of fundraisers) {
    const supportCount = counts.get(fundraiser.id);
    if (supportCount === 0) continue;
    const details = plan.get(fundraiser.id);
    const spec = anchorSpecs.get(fundraiser.title);
    const amounts = details.fixedAmounts
      ? shuffled(rng, [...details.fixedAmounts])
      : amountsForTarget(
        rng, fundraiser, details.targetRaisedCents, supportCount
      );
    const selected = [];
    const selectedIds = new Set();
    const deadline = supportDeadline(fundraiser);

    if (spec?.requiredSupporter) {
      const required = maps.userById.get(world.users.find(
        (user) => user.displayName === spec.requiredSupporter
      ).id);
      selected.push(required);
      selectedIds.add(required.id);
      supportCounts.set(required.id, supportCounts.get(required.id) + 1);
      const amountIndex = amounts.indexOf(spec.requiredAmountCents);
      [amounts[0], amounts[amountIndex]] = [amounts[amountIndex], amounts[0]];
    }

    while (selected.length < supportCount) {
      let candidates = pool.filter((user) => (
        !selectedIds.has(user.id)
        && user.id !== fundraiser.creatorUserId
        && new Date(user.createdAt).getTime() <= deadline
        && supportCounts.get(user.id) < SUPPORTER_CAPS[user.tier]
      ));
      if (!candidates.length) {
        candidates = world.users.filter((user) => (
          !selectedIds.has(user.id)
          && user.id !== fundraiser.creatorUserId
          && new Date(user.createdAt).getTime() <= deadline
        ));
      }
      if (!candidates.length) throw new Error(`No supporter candidate for ${fundraiser.title}`);
      const supporter = weightedPick(rng, candidates.map((user) => ({
        user,
        weight: supporterAffinity(user, fundraiser, selected, maps, signals, supportCounts),
      }))).user;
      selected.push(supporter);
      selectedIds.add(supporter.id);
      supportCounts.set(supporter.id, supportCounts.get(supporter.id) + 1);
    }

    const supportWindowStart = Math.max(
      new Date(fundraiser.createdAt).getTime(),
      ...selected.map((user) => new Date(user.createdAt).getTime())
    );
    const supportWindow = deadline - supportWindowStart;
    selected.forEach((user, index) => {
      const segmentStart = supportWindowStart
        + Math.floor(supportWindow * index / selected.length);
      const segmentEnd = supportWindowStart
        + Math.floor(supportWindow * (index + 1) / selected.length);
      const supportedAt = new Date(
        segmentStart + Math.floor(rng() * Math.max(1, segmentEnd - segmentStart))
      ).toISOString();
      supports.push({
        id: deterministicUuid('fundraiser-support', `${user.id}|${fundraiser.id}`),
        userId: user.id,
        fundraiserId: fundraiser.id,
        amountCents: amounts[index],
        supportedAt,
      });
    });
  }
  return supports;
}

function generateFundraising(rng, world) {
  const fundraisers = generateFundraisers(rng, world);
  const fundraiserSupports = generateFundraiserSupports(rng, world, fundraisers);
  return { fundraisers, fundraiserSupports };
}

function deriveFundraiserProgress(world) {
  const progress = new Map(world.fundraisers.map((fundraiser) => [fundraiser.id, {
    amountRaisedCents: 0, supporterCount: 0,
  }]));
  for (const support of world.fundraiserSupports) {
    const value = progress.get(support.fundraiserId);
    value.amountRaisedCents += support.amountCents;
    value.supporterCount += 1;
  }
  return new Map(world.fundraisers.map((fundraiser) => {
    const value = progress.get(fundraiser.id);
    return [fundraiser.id, {
      ...value,
      progressPercent: Number(
        (value.amountRaisedCents * 100 / fundraiser.goalAmountCents).toFixed(2)
      ),
    }];
  }));
}

function deriveAmountRaisedByUser(world) {
  const progress = deriveFundraiserProgress(world);
  const totals = new Map(world.users.map((user) => [user.id, 0]));
  for (const fundraiser of world.fundraisers.filter((item) => item.creatorUserId)) {
    totals.set(
      fundraiser.creatorUserId,
      totals.get(fundraiser.creatorUserId) + progress.get(fundraiser.id).amountRaisedCents
    );
  }
  return totals;
}

module.exports = {
  generateFundraising,
  deriveFundraiserProgress,
  deriveAmountRaisedByUser,
  lifecycleOf,
  localCalendarDate,
  easternTimestamp,
};
