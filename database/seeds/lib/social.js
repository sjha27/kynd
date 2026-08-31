const CONFIG = require('../config');
const { pick, randomInt, weightedPick } = require('./random');
const { deterministicUuid } = require('./ids');
const {
  deriveFundraiserProgress,
  lifecycleOf,
  easternTimestamp,
} = require('./fundraisers');
const {
  COMMENT_TEMPLATES,
  ANCHOR_COMMENTS,
  classifyCommentBody,
} = require('../data/social');

const REACTION_TIER_WEIGHT = Object.freeze({
  light: 0.65, regular: 1.05, highly_active: 1.65, connector: 2.7,
});
const COMMENT_TIER_WEIGHT = Object.freeze({
  light: 0.7, regular: 1.05, highly_active: 1.55, connector: 1.65,
});

function shuffled(rng, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(rng, 0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function weightedSampleWithoutReplacement(rng, values, count, weightFor) {
  return values.map((value) => ({
    value,
    key: -Math.log(Math.max(rng(), Number.EPSILON)) / Math.max(weightFor(value), 0.001),
  })).sort((first, second) => (
    first.key - second.key || first.value.id.localeCompare(second.value.id)
  )).slice(0, count).map(({ value }) => value);
}

function timestampBetween(rng, earliest, latest = CONFIG.anchorDate) {
  const lower = new Date(earliest).getTime();
  const upper = new Date(latest).getTime();
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) {
    throw new Error(`Invalid social timestamp range: ${earliest} to ${latest}`);
  }
  return new Date(lower + Math.floor(rng() * (upper - lower + 1))).toISOString();
}

function maxTimestamp(...values) {
  return new Date(Math.max(...values.filter(Boolean).map((value) => (
    new Date(value).getTime()
  )))).toISOString();
}

function renderTemplate(template, values) {
  const shortened = Object.fromEntries(Object.entries(values).map(([key, value]) => [
    key, String(value || '').length > 44 ? `${String(value).slice(0, 41)}…` : value,
  ]));
  return template.replace(/\{(\w+)\}/g, (_, key) => shortened[key]);
}

function socialMaps(world) {
  const maps = {
    userById: new Map(world.users.map((user) => [user.id, user])),
    organizationById: new Map(world.organizations.map((item) => [item.id, item])),
    causeById: new Map(world.causes.map((cause) => [cause.id, cause])),
    opportunityById: new Map(world.opportunities.map((item) => [item.id, item])),
    registrationById: new Map(world.registrations.map((row) => [row.id, row])),
    activityById: new Map(world.activities.map((item) => [item.id, item])),
    fundraiserById: new Map(world.fundraisers.map((item) => [item.id, item])),
    userFollowByPair: new Map(world.userFollows.map((row) => [
      `${row.followerUserId}|${row.followedUserId}`, row,
    ])),
    organizationFollowByPair: new Map(world.organizationFollows.map((row) => [
      `${row.userId}|${row.organizationId}`, row,
    ])),
    registrationByPair: new Map(world.registrations.map((row) => [
      `${row.userId}|${row.opportunityId}`, row,
    ])),
    saveByPair: new Map(world.savedOpportunities.map((row) => [
      `${row.userId}|${row.opportunityId}`, row,
    ])),
    supportByPair: new Map(world.fundraiserSupports.map((row) => [
      `${row.userId}|${row.fundraiserId}`, row,
    ])),
    registrationsByOpportunity: new Map(world.opportunities.map((item) => [item.id, []])),
    supportsByFundraiser: new Map(world.fundraisers.map((item) => [item.id, []])),
    completedActivityByUserOpportunity: new Map(),
    followerCountByUser: new Map(world.users.map((user) => [user.id, 0])),
  };
  for (const row of world.registrations) maps.registrationsByOpportunity.get(row.opportunityId).push(row);
  for (const row of world.fundraiserSupports) maps.supportsByFundraiser.get(row.fundraiserId).push(row);
  for (const activity of world.activities.filter((item) => item.registrationId)) {
    const registration = maps.registrationById.get(activity.registrationId);
    maps.completedActivityByUserOpportunity.set(
      `${activity.userId}|${registration.opportunityId}`, activity
    );
  }
  for (const row of world.userFollows) maps.followerCountByUser.set(
    row.followedUserId, maps.followerCountByUser.get(row.followedUserId) + 1
  );
  maps.fundraiserProgress = deriveFundraiserProgress(world);
  return maps;
}

function activityContext(activity, maps) {
  if (!activity.registrationId) {
    return {
      cause: maps.causeById.get(activity.manualCauseId), opportunity: null,
      owner: maps.userById.get(activity.userId), hostOrganizationId: activity.manualOrgId,
    };
  }
  const registration = maps.registrationById.get(activity.registrationId);
  const opportunity = maps.opportunityById.get(registration.opportunityId);
  return {
    cause: maps.causeById.get(opportunity.causeId), opportunity,
    owner: maps.userById.get(activity.userId), hostOrganizationId: opportunity.hostOrganizationId,
  };
}

function targetDetails(type, target, maps) {
  if (type === 'activity') {
    const context = activityContext(target, maps);
    return {
      type, target, cause: context.cause, ownerUserId: target.userId,
      hostUserId: null, hostOrganizationId: context.hostOrganizationId,
      createdAt: target.createdAt, context,
    };
  }
  if (type === 'opportunity') {
    return {
      type, target, cause: maps.causeById.get(target.causeId), ownerUserId: null,
      hostUserId: target.hostUserId, hostOrganizationId: target.hostOrganizationId,
      createdAt: target.createdAt,
    };
  }
  return {
    type, target, cause: maps.causeById.get(target.causeId),
    ownerUserId: target.creatorUserId, hostUserId: target.creatorUserId,
    hostOrganizationId: target.creatorOrganizationId, createdAt: target.createdAt,
  };
}

function followsUser(userId, otherUserId, maps) {
  return Boolean(otherUserId && maps.userFollowByPair.has(`${userId}|${otherUserId}`));
}

function followsOrganization(userId, organizationId, maps) {
  return Boolean(organizationId
    && maps.organizationFollowByPair.has(`${userId}|${organizationId}`));
}

function joinedRegistration(userId, opportunityId, maps) {
  const row = maps.registrationByPair.get(`${userId}|${opportunityId}`);
  return row?.status === 'joined' ? row : null;
}

function completedCoParticipantActivity(userId, opportunityId, maps) {
  return maps.completedActivityByUserOpportunity.get(`${userId}|${opportunityId}`) || null;
}

function followedJoinedRegistration(userId, opportunityId, maps) {
  return maps.registrationsByOpportunity.get(opportunityId).find((row) => (
    row.status === 'joined' && followsUser(userId, row.userId, maps)
  )) || null;
}

function followedSupport(userId, fundraiserId, maps) {
  return maps.supportsByFundraiser.get(fundraiserId).find((row) => (
    followsUser(userId, row.userId, maps)
  )) || null;
}

function userCanEngage(user, details) {
  return user.id !== details.ownerUserId && user.id !== details.hostUserId;
}

function targetAttractiveness(type, target, maps, appeal) {
  if (type === 'activity') {
    const context = activityContext(target, maps);
    const ageDays = Math.max(0, (
      new Date(CONFIG.anchorDate) - new Date(target.createdAt)
    ) / 86400000);
    const recency = 1 + Math.max(0, 180 - ageDays) / 75;
    return appeal * recency
      * (target.story ? 1.35 : 1)
      * (target.imageUrl ? 1.3 : 1)
      * (target.story && target.imageUrl ? 1.15 : 1)
      * (1 + Math.min(maps.followerCountByUser.get(context.owner.id), 30) / 50);
  }
  if (type === 'opportunity') {
    const joined = maps.registrationsByOpportunity.get(target.id)
      .filter((row) => row.status === 'joined').length;
    const timing = target.timeBucket === 'upcoming' ? 1.45
      : target.timeBucket === 'recent_past' ? 1.05 : 0.82;
    return appeal * timing * (1 + Math.min(joined, 12) / 10);
  }
  const progress = maps.fundraiserProgress.get(target.id);
  const lifecycle = lifecycleOf(target);
  return appeal * (lifecycle === 'open' ? 1.35 : 0.95)
    * (1 + Math.min(progress.supporterCount, 25) / 15)
    * (1 + Math.min(progress.progressPercent, 125) / 180);
}

function actorAffinity(user, details, maps) {
  let score = user.causes.includes(details.cause.name) ? 5.5 : 0.75;
  if (followsUser(user.id, details.ownerUserId || details.hostUserId, maps)) score *= 3.1;
  if (followsOrganization(user.id, details.hostOrganizationId, maps)) score *= 2.8;

  if (details.type === 'activity') {
    const opportunity = details.context.opportunity;
    if (opportunity && joinedRegistration(user.id, opportunity.id, maps)) score *= 4.2;
    if (details.context.hostOrganizationId
      && followsOrganization(user.id, details.context.hostOrganizationId, maps)) score *= 1.4;
  } else if (details.type === 'opportunity') {
    if (joinedRegistration(user.id, details.target.id, maps)) score *= 4.5;
    if (maps.saveByPair.has(`${user.id}|${details.target.id}`)) score *= 3.2;
    if (followedJoinedRegistration(user.id, details.target.id, maps)) score *= 2.15;
  } else {
    if (maps.supportByPair.has(`${user.id}|${details.target.id}`)) score *= 5;
    if (details.target.beneficiaryOrganizationId
      && followsOrganization(user.id, details.target.beneficiaryOrganizationId, maps)) score *= 2.4;
    if (followedSupport(user.id, details.target.id, maps)) score *= 2.1;
  }
  return score;
}

function relationshipDependencies(user, details, maps) {
  const dependencies = [user.createdAt, details.createdAt];
  const userFollow = maps.userFollowByPair.get(
    `${user.id}|${details.ownerUserId || details.hostUserId}`
  );
  const organizationFollow = maps.organizationFollowByPair.get(
    `${user.id}|${details.hostOrganizationId}`
  );
  if (userFollow) dependencies.push(userFollow.createdAt);
  if (organizationFollow) dependencies.push(organizationFollow.createdAt);
  if (details.type === 'activity' && details.context.opportunity) {
    const registration = joinedRegistration(user.id, details.context.opportunity.id, maps);
    if (registration) dependencies.push(registration.joinedAt);
  } else if (details.type === 'opportunity') {
    const registration = joinedRegistration(user.id, details.target.id, maps);
    const saved = maps.saveByPair.get(`${user.id}|${details.target.id}`);
    const socialRegistration = followedJoinedRegistration(user.id, details.target.id, maps);
    if (registration) dependencies.push(registration.joinedAt);
    if (saved) dependencies.push(saved.savedAt);
    if (socialRegistration) dependencies.push(socialRegistration.joinedAt);
  } else if (details.type === 'fundraiser') {
    const support = maps.supportByPair.get(`${user.id}|${details.target.id}`);
    const beneficiaryFollow = maps.organizationFollowByPair.get(
      `${user.id}|${details.target.beneficiaryOrganizationId}`
    );
    const socialSupport = followedSupport(user.id, details.target.id, maps);
    if (support) dependencies.push(support.supportedAt);
    if (beneficiaryFollow) dependencies.push(beneficiaryFollow.createdAt);
    if (socialSupport) dependencies.push(socialSupport.supportedAt);
  }
  return dependencies;
}

function anchorTargets(world, maps) {
  const maya = world.users.find((user) => user.displayName === 'Maya Ellis');
  const david = world.users.find((user) => user.displayName === 'David Mercer');
  const anchors = {
    maya, david,
    mayaActivity: world.activities.find((item) => (
      item.userId === maya.id && item.manualTitle === 'Westside Community Garden Morning'
    )),
    davidActivity: world.activities.find((item) => {
      if (item.userId !== david.id || !item.registrationId) return false;
      const registration = maps.registrationById.get(item.registrationId);
      return maps.opportunityById.get(registration.opportunityId).title
        === 'Veterans Care Package Assembly';
    }),
    flagshipOpportunity: world.opportunities.find((item) => item.flagship),
    mayaFundraiser: world.fundraisers.find(
      (item) => item.title === '100 Meal Boxes for Atlanta Families'
    ),
    davidFundraiser: world.fundraisers.find(
      (item) => item.title === 'Roswell Veterans Resource Day Fund'
    ),
    riverlightFundraiser: world.fundraisers.find(
      (item) => item.title === "Keep Atlanta's Waterways Clean This Fall"
    ),
    mosaicFundraiser: world.fundraisers.find(
      (item) => item.title === 'Summer Meal Box Fund'
    ),
  };
  for (const key of [
    'mayaActivity', 'davidActivity', 'flagshipOpportunity', 'mayaFundraiser',
    'davidFundraiser', 'riverlightFundraiser', 'mosaicFundraiser',
  ]) if (!anchors[key]) throw new Error(`Missing social anchor target: ${key}`);
  return anchors;
}

function fixedCountsFor(type, anchors, kind) {
  const counts = CONFIG.socialTargets.anchors;
  const entries = type === 'activity'
    ? [['mayaActivity', anchors.mayaActivity], ['davidActivity', anchors.davidActivity]]
    : type === 'opportunity'
      ? [['flagshipOpportunity', anchors.flagshipOpportunity]]
      : [
        ['mayaFundraiser', anchors.mayaFundraiser],
        ['davidFundraiser', anchors.davidFundraiser],
        ['riverlightFundraiser', anchors.riverlightFundraiser],
        ['mosaicFundraiser', anchors.mosaicFundraiser],
      ];
  return new Map(entries.map(([key, target]) => [target.id, counts[key][kind]]));
}

function allocateTargetCounts(
  rng, candidates, total, activeCount, fixedCounts, attractiveness, preferredIds = null
) {
  const counts = new Map(candidates.map((target) => [target.id, 0]));
  const fixedIds = new Set();
  for (const [id, count] of fixedCounts) {
    if (!counts.has(id)) continue;
    counts.set(id, count);
    fixedIds.add(id);
  }
  const needed = activeCount - fixedIds.size;
  const selected = [...candidates.filter((target) => fixedIds.has(target.id))];
  selected.push(...weightedSampleWithoutReplacement(
    rng,
    candidates.filter((target) => !fixedIds.has(target.id)),
    needed,
    (target) => attractiveness.get(target.id)
      * (preferredIds?.has(target.id) ? 3.5 : 1)
  ));
  for (const target of selected) if (!fixedIds.has(target.id)) counts.set(target.id, 1);
  let remaining = total - [...counts.values()].reduce((sum, value) => sum + value, 0);
  while (remaining > 0) {
    const eligible = selected.filter((target) => !fixedIds.has(target.id));
    const selectedTarget = weightedPick(rng, eligible.map((target) => ({
      target,
      weight: attractiveness.get(target.id) / Math.pow(counts.get(target.id) + 0.5, 1.18),
    }))).target;
    counts.set(selectedTarget.id, counts.get(selectedTarget.id) + 1);
    remaining -= 1;
  }
  return counts;
}

function socialSegments(world, kind) {
  const targets = CONFIG.socialTargets[kind];
  return [
    {
      key: 'activityKynd', type: 'activity', total: targets.activitySource.kynd,
      active: targets.activeTargets.activityKynd,
      candidates: world.activities.filter((item) => item.registrationId !== null),
    },
    {
      key: 'activityManual', type: 'activity', total: targets.activitySource.manual,
      active: targets.activeTargets.activityManual,
      candidates: world.activities.filter((item) => item.registrationId === null),
    },
    ...['upcoming', 'recent_past', 'farther_future'].map((lifecycle) => ({
      key: `opportunity${lifecycle}`,
      type: 'opportunity', total: targets.opportunityLifecycle[lifecycle],
      active: targets.activeTargets[`opportunity${lifecycle === 'recent_past'
        ? 'RecentPast' : lifecycle === 'farther_future' ? 'FartherFuture' : 'Upcoming'}`],
      candidates: world.opportunities.filter((item) => item.timeBucket === lifecycle),
    })),
    ...['open', 'ended'].map((lifecycle) => ({
      key: `fundraiser${lifecycle}`,
      type: 'fundraiser', total: targets.fundraiserLifecycle[lifecycle],
      active: targets.activeTargets[`fundraiser${lifecycle === 'open' ? 'Open' : 'Ended'}`],
      candidates: world.fundraisers.filter((item) => lifecycleOf(item) === lifecycle),
    })),
  ];
}

function inactiveUserIds(rng, world, kind, protectedIds) {
  const targets = CONFIG.socialTargets[kind].inactiveUsersByTier;
  return new Set(Object.entries(targets).flatMap(([tier, count]) => (
    shuffled(rng, world.users.filter((user) => (
      user.tier === tier && !protectedIds.has(user.id)
    ))).slice(0, count).map((user) => user.id)
  )));
}

function requiredReactionActors(anchors) {
  return new Map([
    [anchors.mayaActivity.id, [{ user: anchors.david, reactionType: 'celebrate' }]],
    [anchors.davidActivity.id, [{ user: anchors.maya, reactionType: 'celebrate' }]],
    [anchors.flagshipOpportunity.id, [{ user: anchors.maya, reactionType: 'support' }]],
    [anchors.mayaFundraiser.id, [{ user: anchors.david, reactionType: 'celebrate' }]],
    [anchors.davidFundraiser.id, [{ user: anchors.maya, reactionType: 'celebrate' }]],
  ]);
}

function selectActors(
  rng, world, maps, details, count, inactiveIds, usage, required = [], reactionPairs = null
) {
  const selected = [...required.map((item) => item.user || item)];
  const selectedIds = new Set(selected.map((user) => user.id));
  const pairFor = (user) => `${user.id}|${details.type}|${details.target.id}`;
  const overlapGoal = reactionPairs ? Math.round(count * 0.7) : 0;
  while (selected.length < count) {
    const allCandidates = world.users.filter((user) => (
      !inactiveIds.has(user.id) && !selectedIds.has(user.id) && userCanEngage(user, details)
    ));
    const currentOverlap = selected.filter((user) => reactionPairs?.has(pairFor(user))).length;
    const reactingCandidates = allCandidates.filter((user) => reactionPairs?.has(pairFor(user)));
    const candidates = currentOverlap < overlapGoal && reactingCandidates.length
      ? reactingCandidates : allCandidates;
    if (!candidates.length) throw new Error(`No social actor candidates for ${details.target.id}`);
    const chosen = weightedPick(rng, candidates.map((user) => ({
      user,
      weight: actorAffinity(user, details, maps)
        * (reactionPairs ? COMMENT_TIER_WEIGHT[user.tier] : REACTION_TIER_WEIGHT[user.tier])
        * (reactionPairs?.has(pairFor(user)) ? 2 : 1)
        / Math.pow(1 + usage.get(user.id), 1.22),
    }))).user;
    selected.push(chosen);
    selectedIds.add(chosen.id);
  }
  for (const user of selected) usage.set(user.id, usage.get(user.id) + 1);
  return selected;
}

function reactionRow(rng, user, details, maps) {
  const row = {
    id: deterministicUuid('reaction', `${user.id}|${details.type}|${details.target.id}`),
    userId: user.id,
    reactionType: null,
    activityId: details.type === 'activity' ? details.target.id : null,
    opportunityId: details.type === 'opportunity' ? details.target.id : null,
    fundraiserId: details.type === 'fundraiser' ? details.target.id : null,
    createdAt: timestampBetween(rng, maxTimestamp(...relationshipDependencies(user, details, maps))),
  };
  return row;
}

function reactionSignalScore(row, type, maps) {
  const user = maps.userById.get(row.userId);
  const target = type === 'activity' ? maps.activityById.get(row.activityId)
    : type === 'opportunity' ? maps.opportunityById.get(row.opportunityId)
      : maps.fundraiserById.get(row.fundraiserId);
  const details = targetDetails(type, target, maps);
  if (type === 'activity') {
    return {
      celebrate: (target.story ? 4 : 0) + (target.imageUrl ? 3 : 0)
        + (followsUser(user.id, target.userId, maps) ? 2 : 0),
      support: (user.causes.includes(details.cause.name) ? 3 : 0)
        + (details.context.opportunity
          && joinedRegistration(user.id, details.context.opportunity.id, maps) ? 2 : 0),
    };
  }
  if (type === 'opportunity') {
    return {
      celebrate: target.timeBucket === 'recent_past' ? 5 : 0,
      support: (joinedRegistration(user.id, target.id, maps) ? 5 : 0)
        + (maps.saveByPair.has(`${user.id}|${target.id}`) ? 3 : 0)
        + (user.causes.includes(details.cause.name) ? 2 : 0),
    };
  }
  const progress = maps.fundraiserProgress.get(target.id);
  return {
    celebrate: (lifecycleOf(target) === 'ended' ? 4 : 0)
      + (progress.progressPercent >= 100 ? 6 : 0)
      + (maps.supportByPair.has(`${user.id}|${target.id}`) ? 2 : 0),
    support: -Infinity,
  };
}

function assignReactionTypes(rows, type, anchors, maps) {
  const quotas = { ...CONFIG.socialTargets.reactions.byTargetAndType[type] };
  const required = requiredReactionActors(anchors);
  const fixed = new Set();
  for (const row of rows) {
    const targetId = row.activityId || row.opportunityId || row.fundraiserId;
    const match = (required.get(targetId) || []).find((item) => item.user.id === row.userId);
    if (match) {
      row.reactionType = match.reactionType;
      quotas[match.reactionType] -= 1;
      fixed.add(row.id);
    }
  }
  if (type === 'fundraiser') {
    const authoredCelebrateCounts = new Map([
      [anchors.mayaFundraiser.id, 3],
      [anchors.davidFundraiser.id, 4],
      [anchors.riverlightFundraiser.id, 6],
      [anchors.mosaicFundraiser.id, 15],
    ]);
    for (const [targetId, desiredCount] of authoredCelebrateCounts) {
      const targetRows = rows.filter((row) => row.fundraiserId === targetId)
        .sort((first, second) => first.id.localeCompare(second.id));
      const already = targetRows.filter((row) => row.reactionType === 'celebrate').length;
      for (const row of targetRows.filter((item) => item.reactionType === null)
        .slice(0, desiredCount - already)) {
        row.reactionType = 'celebrate';
        quotas.celebrate -= 1;
        fixed.add(row.id);
      }
    }
  }
  const available = rows.filter((row) => !fixed.has(row.id));
  const sortedCelebrate = [...available].sort((first, second) => (
    reactionSignalScore(second, type, maps).celebrate
      - reactionSignalScore(first, type, maps).celebrate
    || first.id.localeCompare(second.id)
  ));
  const celebrate = new Set(sortedCelebrate.slice(0, quotas.celebrate).map((row) => row.id));
  for (const row of available) if (celebrate.has(row.id)) row.reactionType = 'celebrate';
  const remaining = available.filter((row) => row.reactionType === null);
  const sortedSupport = [...remaining].sort((first, second) => (
    reactionSignalScore(second, type, maps).support
      - reactionSignalScore(first, type, maps).support
    || first.id.localeCompare(second.id)
  ));
  const support = new Set(sortedSupport.slice(0, quotas.support).map((row) => row.id));
  for (const row of remaining) row.reactionType = support.has(row.id) ? 'support' : 'like';
}

function generateReactions(rng, world, maps, anchors, attractiveness) {
  const required = requiredReactionActors(anchors);
  const inactive = inactiveUserIds(
    rng, world, 'reactions', new Set(world.users.filter((user) => user.anchor).map((user) => user.id))
  );
  const usage = new Map(world.users.map((user) => [user.id, 0]));
  const fixedByType = {
    activity: fixedCountsFor('activity', anchors, 'reactions'),
    opportunity: fixedCountsFor('opportunity', anchors, 'reactions'),
    fundraiser: fixedCountsFor('fundraiser', anchors, 'reactions'),
  };
  const rows = [];
  for (const segment of socialSegments(world, 'reactions')) {
    const fixed = new Map([...fixedByType[segment.type]].filter(([id]) => (
      segment.candidates.some((target) => target.id === id)
    )));
    const counts = allocateTargetCounts(
      rng, segment.candidates, segment.total, segment.active, fixed, attractiveness
    );
    for (const target of segment.candidates.filter((item) => counts.get(item.id) > 0)) {
      const details = targetDetails(segment.type, target, maps);
      const actors = selectActors(
        rng, world, maps, details, counts.get(target.id), inactive, usage,
        required.get(target.id) || []
      );
      for (const user of actors) rows.push(reactionRow(rng, user, details, maps));
    }
  }
  for (const type of ['activity', 'opportunity', 'fundraiser']) {
    assignReactionTypes(rows.filter((row) => row[`${type}Id`] !== null), type, anchors, maps);
  }
  return rows;
}

function availableCommentCategories(user, details, maps) {
  if (details.type === 'activity') {
    const categories = [];
    if (details.context.opportunity
      && completedCoParticipantActivity(user.id, details.context.opportunity.id, maps)) {
      categories.push({ category: 'activity_co_participant', weight: 5 });
    }
    if (followsUser(user.id, details.target.userId, maps)) {
      categories.push({ category: 'activity_follower', weight: 3.5 });
    }
    if (!details.target.registrationId) categories.push({ category: 'activity_manual', weight: 2.2 });
    if (user.causes.includes(details.cause.name)) {
      categories.push({ category: 'activity_cause_aligned', weight: 2.8 });
    }
    categories.push({ category: 'activity_encouragement', weight: 1 });
    return categories;
  }
  if (details.type === 'opportunity') {
    const categories = [];
    if (['upcoming', 'farther_future'].includes(details.target.timeBucket)
      && joinedRegistration(user.id, details.target.id, maps)) {
      categories.push({ category: 'opportunity_joined', weight: 6 });
    }
    if (maps.saveByPair.has(`${user.id}|${details.target.id}`)) {
      categories.push({ category: 'opportunity_saved', weight: 4 });
    }
    if (followsUser(user.id, details.target.hostUserId, maps)
      || followsOrganization(user.id, details.target.hostOrganizationId, maps)) {
      categories.push({ category: 'opportunity_host_follower', weight: 3.5 });
    }
    if (followedJoinedRegistration(user.id, details.target.id, maps)) {
      categories.push({ category: 'opportunity_attendee_social', weight: 3 });
    }
    if (user.causes.includes(details.cause.name)) {
      categories.push({ category: 'opportunity_cause_aligned', weight: 2.5 });
    }
    return categories.length ? categories : [{ category: 'opportunity_cause_aligned', weight: 1 }];
  }
  const categories = [];
  if (maps.supportByPair.has(`${user.id}|${details.target.id}`)) {
    categories.push({ category: 'fundraiser_supporter', weight: 7 });
  }
  if (followsUser(user.id, details.target.creatorUserId, maps)
    || followsOrganization(user.id, details.target.creatorOrganizationId, maps)) {
    categories.push({ category: 'fundraiser_creator_follower', weight: 3.5 });
  }
  if (followsOrganization(user.id, details.target.beneficiaryOrganizationId, maps)) {
    categories.push({ category: 'fundraiser_beneficiary_follower', weight: 3.2 });
  }
  if (lifecycleOf(details.target) === 'ended'
    && maps.fundraiserProgress.get(details.target.id).progressPercent >= 100) {
    categories.push({ category: 'fundraiser_ended_success', weight: 5 });
  }
  if (user.causes.includes(details.cause.name)) {
    categories.push({ category: 'fundraiser_cause_aligned', weight: 2.7 });
  }
  categories.push({ category: 'fundraiser_encouragement', weight: 1 });
  return categories;
}

function commentCategoryDependency(category, user, details, maps) {
  if (category === 'activity_co_participant') {
    return completedCoParticipantActivity(
      user.id, details.context.opportunity.id, maps
    ).createdAt;
  }
  if (category === 'opportunity_joined') {
    return joinedRegistration(user.id, details.target.id, maps).joinedAt;
  }
  if (category === 'opportunity_saved') {
    return maps.saveByPair.get(`${user.id}|${details.target.id}`).savedAt;
  }
  if (category === 'fundraiser_supporter') {
    return maps.supportByPair.get(`${user.id}|${details.target.id}`).supportedAt;
  }
  if (category === 'fundraiser_ended_success') {
    return easternTimestamp(details.target.endDate, '23:59:59');
  }
  return null;
}

function commentValues(details, maps) {
  const target = details.target;
  const creator = target.creatorUserId
    ? maps.userById.get(target.creatorUserId).displayName
    : target.creatorOrganizationId
      ? maps.organizationById.get(target.creatorOrganizationId).name : null;
  const host = target.hostUserId
    ? maps.userById.get(target.hostUserId).displayName
    : target.hostOrganizationId
      ? maps.organizationById.get(target.hostOrganizationId).name : null;
  const activityTitle = details.type === 'activity'
    ? details.context.opportunity?.title || target.manualTitle : null;
  return {
    title: activityTitle || target.title,
    cause: details.cause.name,
    owner: details.type === 'activity' ? details.context.owner.displayName : null,
    host,
    creator,
    beneficiary: target.beneficiaryName,
  };
}

function requiredComments(anchors, maps) {
  const riverlightSupporter = maps.userById.get(
    maps.supportsByFundraiser.get(anchors.riverlightFundraiser.id)[0].userId
  );
  const mosaicSupporter = maps.userById.get(
    maps.supportsByFundraiser.get(anchors.mosaicFundraiser.id)[0].userId
  );
  return new Map([
    [anchors.mayaActivity.id, [{ user: anchors.david, body: ANCHOR_COMMENTS.mayaActivityByDavid }]],
    [anchors.davidActivity.id, [{ user: anchors.maya, body: ANCHOR_COMMENTS.davidActivityByMaya }]],
    [anchors.flagshipOpportunity.id, [{ user: anchors.maya, body: ANCHOR_COMMENTS.flagshipByMaya }]],
    [anchors.mayaFundraiser.id, [{ user: anchors.david, body: ANCHOR_COMMENTS.mayaFundraiserByDavid }]],
    [anchors.davidFundraiser.id, [{ user: anchors.maya, body: ANCHOR_COMMENTS.davidFundraiserByMaya }]],
    [anchors.riverlightFundraiser.id, [{
      user: riverlightSupporter,
      body: 'Proud to support this work for Riverlight Atlanta.',
    }]],
    [anchors.mosaicFundraiser.id, [{
      user: mosaicSupporter,
      body: 'Amazing to see this campaign reach its goal — worth celebrating.',
    }]],
  ]);
}

function commentRow(rng, user, details, maps, authoredBody = null) {
  const options = availableCommentCategories(user, details, maps);
  const category = authoredBody
    ? classifyCommentBody(authoredBody, details.type)
    : weightedPick(rng, options).category;
  const body = authoredBody || renderTemplate(
    pick(rng, COMMENT_TEMPLATES[category]), commentValues(details, maps)
  );
  const dependencies = relationshipDependencies(user, details, maps);
  const categoryDependency = commentCategoryDependency(category, user, details, maps);
  if (categoryDependency) dependencies.push(categoryDependency);
  return {
    id: deterministicUuid('comment', `${user.id}|${details.type}|${details.target.id}`),
    userId: user.id,
    body,
    activityId: details.type === 'activity' ? details.target.id : null,
    opportunityId: details.type === 'opportunity' ? details.target.id : null,
    fundraiserId: details.type === 'fundraiser' ? details.target.id : null,
    createdAt: timestampBetween(rng, maxTimestamp(...dependencies)),
  };
}

function generateComments(rng, world, maps, anchors, attractiveness, reactions) {
  const required = requiredComments(anchors, maps);
  const protectedIds = new Set([anchors.maya.id, anchors.david.id]);
  const inactive = inactiveUserIds(rng, world, 'comments', protectedIds);
  const usage = new Map(world.users.map((user) => [user.id, 0]));
  const reactionPairs = new Set(reactions.map((row) => {
    const type = row.activityId ? 'activity' : row.opportunityId ? 'opportunity' : 'fundraiser';
    return `${row.userId}|${type}|${row.activityId || row.opportunityId || row.fundraiserId}`;
  }));
  const reactedTargetIds = new Set(reactions.map((row) => (
    row.activityId || row.opportunityId || row.fundraiserId
  )));
  const fixedByType = {
    activity: fixedCountsFor('activity', anchors, 'comments'),
    opportunity: fixedCountsFor('opportunity', anchors, 'comments'),
    fundraiser: fixedCountsFor('fundraiser', anchors, 'comments'),
  };
  const rows = [];
  for (const segment of socialSegments(world, 'comments')) {
    const fixed = new Map([...fixedByType[segment.type]].filter(([id]) => (
      segment.candidates.some((target) => target.id === id)
    )));
    const counts = allocateTargetCounts(
      rng, segment.candidates, segment.total, segment.active, fixed,
      attractiveness, reactedTargetIds
    );
    for (const target of segment.candidates.filter((item) => counts.get(item.id) > 0)) {
      const details = targetDetails(segment.type, target, maps);
      const authored = required.get(target.id) || [];
      const actors = selectActors(
        rng, world, maps, details, counts.get(target.id), inactive, usage,
        authored, reactionPairs
      );
      const bodyByUserId = new Map(authored.map((item) => [item.user.id, item.body]));
      for (const user of actors) rows.push(
        commentRow(rng, user, details, maps, bodyByUserId.get(user.id) || null)
      );
    }
  }
  return rows;
}

function generateSocial(rng, world) {
  const maps = socialMaps(world);
  const anchors = anchorTargets(world, maps);
  const appeal = {
    activity: new Map(world.activities.map((item) => [item.id, 0.78 + rng() * 0.54])),
    opportunity: new Map(world.opportunities.map((item) => [item.id, 0.78 + rng() * 0.54])),
    fundraiser: new Map(world.fundraisers.map((item) => [item.id, 0.78 + rng() * 0.54])),
  };
  const attractiveness = new Map();
  for (const [type, collection] of [
    ['activity', world.activities], ['opportunity', world.opportunities],
    ['fundraiser', world.fundraisers],
  ]) for (const target of collection) attractiveness.set(
    target.id, targetAttractiveness(type, target, maps, appeal[type].get(target.id))
  );
  const reactions = generateReactions(rng, world, maps, anchors, attractiveness);
  const comments = generateComments(rng, world, maps, anchors, attractiveness, reactions);
  return { reactions, comments };
}

module.exports = {
  generateSocial,
  socialMaps,
  targetDetails,
  activityContext,
  joinedRegistration,
  completedCoParticipantActivity,
  followedJoinedRegistration,
  followedSupport,
  relationshipDependencies,
  classifyCommentBody,
};
