const CONFIG = require('../config');
const { randomInt, weightedPick } = require('./random');
const { deterministicUuid } = require('./ids');

const REGION_CITIES = new Set([
  'Atlanta', 'Decatur', 'Sandy Springs', 'Brookhaven', 'Marietta',
  'Smyrna', 'Roswell', 'Alpharetta',
]);
const JOIN_BASE = Object.freeze({ light: 8, regular: 16, highly_active: 28, connector: 42 });
const CANCEL_BASE = Object.freeze({ light: 0.8, regular: 1.5, highly_active: 2.7, connector: 4 });
const SAVE_BASE = Object.freeze({ light: 4.2, regular: 4, highly_active: 3.8, connector: 3.5 });

function shuffled(rng, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(rng, 0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function allocateExactQuotas(
  rng, users, target, baseByTier, overrides = new Map(), variance = [0.78, 1.22]
) {
  const remainingTarget = target - [...overrides.values()].reduce((sum, value) => sum + value, 0);
  const flexible = users.filter((user) => !overrides.has(user.id)).map((user) => ({
    id: user.id,
    raw: baseByTier[user.tier] * (variance[0] + rng() * (variance[1] - variance[0])),
  }));
  const rawTotal = flexible.reduce((sum, item) => sum + item.raw, 0);
  const allocations = flexible.map((item) => {
    const scaled = item.raw * remainingTarget / rawTotal;
    return { id: item.id, count: Math.floor(scaled), remainder: scaled % 1 };
  });
  let unallocated = remainingTarget - allocations.reduce((sum, item) => sum + item.count, 0);
  allocations.sort((first, second) => (
    second.remainder - first.remainder || first.id.localeCompare(second.id)
  ));
  for (let index = 0; index < unallocated; index += 1) allocations[index].count += 1;
  return new Map([...allocations.map(({ id, count }) => [id, count]), ...overrides]);
}

function allocateOpportunityCounts(rng, opportunities, total, appeal, options = {}) {
  const counts = new Map(opportunities.map((item) => [item.id, 0]));
  const limits = new Map(opportunities.map((item) => [
    item.id, Math.min(item.capacity, options.normalLimit || 10),
  ]));
  const reserved = new Set();

  for (const [id, count] of options.fixed || []) {
    counts.set(id, count);
    limits.set(id, count);
    reserved.add(id);
  }

  const selectable = shuffled(rng, opportunities.filter((item) => !reserved.has(item.id)));
  if (options.activeCount) {
    const active = new Set(selectable.slice(0, options.activeCount).map((item) => item.id));
    for (const item of selectable) if (!active.has(item.id)) limits.set(item.id, 0);
  }

  if (options.fullCount) {
    const candidates = selectable.filter((item) => limits.get(item.id) > 0 && item.capacity <= 20);
    for (const item of candidates.slice(0, options.fullCount)) {
      counts.set(item.id, item.capacity);
      limits.set(item.id, item.capacity);
      reserved.add(item.id);
    }
  }
  if (options.nearFullCount) {
    const candidates = selectable.filter((item) => (
      !reserved.has(item.id) && limits.get(item.id) > 0 && item.capacity <= 30
    ));
    for (const item of candidates.slice(0, options.nearFullCount)) {
      const count = Math.max(1, Math.ceil(item.capacity * 0.84));
      counts.set(item.id, count);
      limits.set(item.id, count);
      reserved.add(item.id);
    }
  }

  let remaining = total - [...counts.values()].reduce((sum, count) => sum + count, 0);
  while (remaining > 0) {
    const candidates = opportunities.filter((item) => counts.get(item.id) < limits.get(item.id));
    if (!candidates.length) throw new Error(`Unable to allocate ${total} opportunity relationships`);
    const selected = weightedPick(rng, candidates.map((item) => ({
      item,
      weight: appeal.get(item.id) / Math.pow(1 + counts.get(item.id), 1.15),
    }))).item;
    counts.set(selected.id, counts.get(selected.id) + 1);
    remaining -= 1;
  }
  return counts;
}

function overlap(first, second) {
  return new Date(first.startsAt) < new Date(second.endsAt)
    && new Date(second.startsAt) < new Date(first.endsAt);
}

function region(entity) {
  return REGION_CITIES.has(entity.city) ? 'atlanta_metro' : 'other_georgia';
}

function buildSignals(world) {
  return {
    organizationFollows: new Set(world.organizationFollows.map(
      (row) => `${row.userId}|${row.organizationId}`
    )),
    userFollows: new Set(world.userFollows.map(
      (row) => `${row.followerUserId}|${row.followedUserId}`
    )),
  };
}

function affinity(user, opportunity, participants, signals, causeById, appeal) {
  let score = user.causes.includes(causeById.get(opportunity.causeId).name) ? 6 : 0.65;
  if (opportunity.hostOrganizationId
    && signals.organizationFollows.has(`${user.id}|${opportunity.hostOrganizationId}`)) score *= 3.2;
  if (opportunity.hostUserId
    && signals.userFollows.has(`${user.id}|${opportunity.hostUserId}`)) score *= 3.2;

  if (opportunity.isOnline) score *= 1.35;
  else if (user.city === opportunity.city) score *= 4;
  else if (region(user) === opportunity.geography) score *= 1.8;
  else score *= 0.12;

  let followedParticipants = 0;
  let followerParticipants = 0;
  for (const participantId of participants) {
    if (signals.userFollows.has(`${user.id}|${participantId}`)) followedParticipants += 1;
    if (signals.userFollows.has(`${participantId}|${user.id}`)) followerParticipants += 1;
  }
  score *= 1 + Math.min(followedParticipants, 3) * 0.75 + Math.min(followerParticipants, 2) * 0.18;
  return score * appeal.get(opportunity.id);
}

function registrationDate(rng, user, opportunity, status) {
  const anchor = new Date(CONFIG.anchorDate).getTime();
  const start = new Date(opportunity.startsAt).getTime();
  const lower = Math.max(new Date(user.createdAt).getTime(), new Date(opportunity.createdAt).getTime());
  const upper = Math.min(anchor, start - 60000);
  const joinedAtMs = lower + Math.floor(rng() * (upper - lower + 1));
  const joinedAt = new Date(joinedAtMs).toISOString();
  if (status === 'joined') return { joinedAt, cancelledAt: null };
  const cancelledAtMs = joinedAtMs + Math.floor(rng() * (upper - joinedAtMs + 1));
  return { joinedAt, cancelledAt: new Date(cancelledAtMs).toISOString() };
}

function savedDate(rng, user, opportunity) {
  const lower = Math.max(new Date(user.createdAt).getTime(), new Date(opportunity.createdAt).getTime());
  const upper = Math.min(new Date(CONFIG.anchorDate).getTime(), new Date(opportunity.startsAt).getTime() - 60000);
  return new Date(lower + Math.floor(rng() * (upper - lower + 1))).toISOString();
}

function generateParticipation(rng, world) {
  const usersByName = new Map(world.users.map((user) => [user.displayName, user]));
  const opportunityById = new Map(world.opportunities.map((item) => [item.id, item]));
  const causeById = new Map(world.causes.map((cause) => [cause.id, cause]));
  const maya = usersByName.get('Maya Ellis');
  const david = usersByName.get('David Mercer');
  const flagship = world.opportunities.find((item) => item.flagship);
  const davidHosted = world.opportunities.find((item) => item.davidAnchor);
  const signals = buildSignals(world);
  const appeal = new Map(world.opportunities.map((item) => {
    const hostBonus = item.hostOrganizationId ? 1.08 : 0.96;
    const typeBonus = item.opportunityType === 'volunteer' ? 1.05 : 0.95;
    return [item.id, (0.82 + rng() * 0.36) * hostBonus * typeBonus];
  }));

  const targets = CONFIG.participationTargets.registrations;
  const joinedTargets = new Map();
  const cancelledTargets = new Map();
  for (const [bucket, key] of [
    ['recent_past', 'recentPast'], ['upcoming', 'upcoming'],
    ['farther_future', 'fartherFuture'], ['cancelled', 'cancelled'],
  ]) {
    const items = world.opportunities.filter((item) => item.timeBucket === bucket);
    const fixed = [];
    if (bucket === 'upcoming') {
      fixed.push([flagship.id, CONFIG.participationTargets.flagshipJoined]);
      fixed.push([davidHosted.id, Math.min(8, davidHosted.capacity)]);
    }
    const joined = allocateOpportunityCounts(rng, items, targets[key].joined, appeal, {
      fixed,
      normalLimit: bucket === 'recent_past' ? 10 : 7,
      activeCount: bucket === 'recent_past' ? 610 : bucket === 'upcoming' ? 700 : 170,
      fullCount: bucket === 'upcoming' ? 10 : 0,
      nearFullCount: bucket === 'upcoming' ? 30 : 0,
    });
    const cancelled = allocateOpportunityCounts(rng, items, targets[key].cancelled, appeal, {
      normalLimit: 3,
      activeCount: Math.min(items.length, targets[key].cancelled),
    });
    for (const item of items) {
      joinedTargets.set(item.id, joined.get(item.id));
      cancelledTargets.set(item.id, cancelled.get(item.id));
    }
  }

  const joinedQuota = allocateExactQuotas(rng, world.users, CONFIG.counts.registrations - 750, JOIN_BASE,
    new Map([[maya.id, 7], [david.id, 13]]));
  const cancelledQuota = allocateExactQuotas(rng, world.users, 750, CANCEL_BASE,
    new Map([[maya.id, 1], [david.id, 2]]));
  const remainingJoined = new Map(joinedQuota);
  const remainingCancelled = new Map(cancelledQuota);
  const registrations = [];
  const pairSet = new Set();
  const joinedByUser = new Map(world.users.map((user) => [user.id, []]));
  const participantsByOpportunity = new Map(world.opportunities.map((item) => [item.id, []]));
  const assignedJoined = new Map(world.opportunities.map((item) => [item.id, 0]));
  const assignedCancelled = new Map(world.opportunities.map((item) => [item.id, 0]));

  function canAssign(user, opportunity, status) {
    if (`${user.id}` === `${opportunity.hostUserId}`) return false;
    if (pairSet.has(`${user.id}|${opportunity.id}`)) return false;
    if ((status === 'joined' ? remainingJoined : remainingCancelled).get(user.id) <= 0) return false;
    if (Math.max(new Date(user.createdAt), new Date(opportunity.createdAt))
      >= new Date(opportunity.startsAt)) return false;
    return status !== 'joined' || !joinedByUser.get(user.id).some((other) => overlap(other, opportunity));
  }

  function assign(user, opportunity, status) {
    if (!canAssign(user, opportunity, status)) return false;
    const dates = registrationDate(rng, user, opportunity, status);
    registrations.push({
      id: deterministicUuid('registration', `${user.id}|${opportunity.id}`),
      userId: user.id,
      opportunityId: opportunity.id,
      status,
      ...dates,
    });
    pairSet.add(`${user.id}|${opportunity.id}`);
    if (status === 'joined') {
      remainingJoined.set(user.id, remainingJoined.get(user.id) - 1);
      assignedJoined.set(opportunity.id, assignedJoined.get(opportunity.id) + 1);
      joinedByUser.get(user.id).push(opportunity);
      participantsByOpportunity.get(opportunity.id).push(user.id);
    } else {
      remainingCancelled.set(user.id, remainingCancelled.get(user.id) - 1);
      assignedCancelled.set(opportunity.id, assignedCancelled.get(opportunity.id) + 1);
    }
    return true;
  }

  function bestOpportunities(user, bucket, status, count, excluded = new Set()) {
    const targetMap = status === 'joined' ? joinedTargets : cancelledTargets;
    const assignedMap = status === 'joined' ? assignedJoined : assignedCancelled;
    for (let index = 0; index < count; index += 1) {
      const candidates = world.opportunities.filter((item) => (
        item.timeBucket === bucket && !excluded.has(item.id)
        && assignedMap.get(item.id) < targetMap.get(item.id) && canAssign(user, item, status)
      ));
      if (!candidates.length) throw new Error(`Unable to build anchor participation for ${user.displayName}`);
      candidates.sort((first, second) => (
        affinity(user, second, participantsByOpportunity.get(second.id), signals, causeById, appeal)
          - affinity(user, first, participantsByOpportunity.get(first.id), signals, causeById, appeal)
        || first.id.localeCompare(second.id)
      ));
      assign(user, candidates[0], status);
      excluded.add(candidates[0].id);
    }
  }

  assign(maya, flagship, 'joined');
  const flagshipCandidates = world.users.filter((user) => canAssign(user, flagship, 'joined'))
    .sort((first, second) => {
      const storyScore = (user) => (
        (user.causes.includes('Environment') ? 20 : 0)
        + (region(user) === 'atlanta_metro' ? 10 : 0)
        + (user.city === 'Atlanta' ? 4 : 0)
        + (signals.userFollows.has(`${user.id}|${maya.id}`) ? 12 : 0)
      );
      return storyScore(second) - storyScore(first) || first.id.localeCompare(second.id);
    });
  for (const user of flagshipCandidates.slice(0, 4)) assign(user, flagship, 'joined');
  bestOpportunities(maya, 'recent_past', 'joined', 5);
  bestOpportunities(maya, 'upcoming', 'joined', 1, new Set([flagship.id]));
  bestOpportunities(maya, 'recent_past', 'cancelled', 1);
  bestOpportunities(david, 'recent_past', 'joined', 10);
  bestOpportunities(david, 'upcoming', 'joined', 2, new Set([davidHosted.id]));
  bestOpportunities(david, 'farther_future', 'joined', 1);
  bestOpportunities(david, 'recent_past', 'cancelled', 1);
  bestOpportunities(david, 'upcoming', 'cancelled', 1, new Set([davidHosted.id]));

  function fill(status) {
    const targetMap = status === 'joined' ? joinedTargets : cancelledTargets;
    const assignedMap = status === 'joined' ? assignedJoined : assignedCancelled;
    const quotaMap = status === 'joined' ? remainingJoined : remainingCancelled;
    const ordered = [...world.opportunities].sort((first, second) => (
      status === 'cancelled'
        ? new Date(first.startsAt) - new Date(second.startsAt) || first.id.localeCompare(second.id)
        : (targetMap.get(second.id) - assignedMap.get(second.id))
          - (targetMap.get(first.id) - assignedMap.get(first.id)) || first.id.localeCompare(second.id)
    ));
    for (const opportunity of ordered) {
      let needed = targetMap.get(opportunity.id) - assignedMap.get(opportunity.id);
      while (needed > 0) {
        const candidates = world.users.filter((user) => canAssign(user, opportunity, status));
        if (!candidates.length) throw new Error(`No candidate for ${status} on ${opportunity.title}`);
        const participantIds = participantsByOpportunity.get(opportunity.id);
        const selected = weightedPick(rng, candidates.map((user) => ({
          user,
          weight: affinity(user, opportunity, participantIds, signals, causeById, appeal)
            * (0.8 + quotaMap.get(user.id) * 0.08),
        }))).user;
        assign(selected, opportunity, status);
        needed -= 1;
      }
    }
    const remaining = [...quotaMap.values()].reduce((sum, count) => sum + count, 0);
    if (remaining !== 0) throw new Error(`${remaining} ${status} user quotas remain`);
  }

  fill('cancelled');
  fill('joined');

  const saveQuota = allocateExactQuotas(
    rng, world.users, CONFIG.participationTargets.savedOpportunities, SAVE_BASE,
    new Map([[maya.id, 4], [david.id, 3]]), [0.1, 1.9]
  );
  const savedOpportunities = [];
  for (const user of world.users) {
    const selectedIds = new Set();
    for (let index = 0; index < saveQuota.get(user.id); index += 1) {
      const candidates = world.opportunities.filter((item) => (
        item.status === 'published'
        && ['upcoming', 'farther_future'].includes(item.timeBucket)
        && item.hostUserId !== user.id
        && !pairSet.has(`${user.id}|${item.id}`)
        && !selectedIds.has(item.id)
        && !joinedByUser.get(user.id).some((joinedItem) => overlap(joinedItem, item))
      ));
      const weighted = candidates.map((item) => ({
        item,
        weight: affinity(user, item, participantsByOpportunity.get(item.id), signals, causeById, appeal),
      }));
      const selected = user.anchor
        ? weighted.sort((first, second) => second.weight - first.weight
          || first.item.id.localeCompare(second.item.id))[0].item
        : weightedPick(rng, weighted).item;
      selectedIds.add(selected.id);
      savedOpportunities.push({
        userId: user.id,
        opportunityId: selected.id,
        savedAt: savedDate(rng, user, selected),
      });
    }
  }

  return { registrations, savedOpportunities };
}

module.exports = { generateParticipation, buildSignals, region };
