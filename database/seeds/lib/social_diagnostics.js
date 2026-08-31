const CONFIG = require('../config');
const {
  deriveProfileMetrics,
  buildOrganizationPublicImpact,
} = require('./activities');
const {
  deriveFundraiserProgress,
  deriveAmountRaisedByUser,
  lifecycleOf,
  easternTimestamp,
} = require('./fundraisers');
const {
  socialMaps,
  targetDetails,
  joinedRegistration,
  completedCoParticipantActivity,
  followedJoinedRegistration,
  followedSupport,
  relationshipDependencies,
  classifyCommentBody,
} = require('./social');

function rounded(value) {
  return Number((value || 0).toFixed(2));
}

function percentage(numerator, denominator) {
  return rounded(denominator ? numerator * 100 / denominator : 0);
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

function distribution(values) {
  return {
    average: rounded(values.reduce((sum, value) => sum + value, 0) / values.length),
    median: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    p90: percentile(values, 0.9),
    maximum: Math.max(...values),
    zero: values.filter((value) => value === 0).length,
  };
}

function bucketCounts(values) {
  return {
    '0': values.filter((value) => value === 0).length,
    '1–2': values.filter((value) => value >= 1 && value <= 2).length,
    '3–5': values.filter((value) => value >= 3 && value <= 5).length,
    '6–10': values.filter((value) => value >= 6 && value <= 10).length,
    '11+': values.filter((value) => value >= 11).length,
  };
}

function targetType(row) {
  return row.activityId ? 'activity' : row.opportunityId ? 'opportunity' : 'fundraiser';
}

function targetId(row) {
  return row.activityId || row.opportunityId || row.fundraiserId;
}

function socialPair(row) {
  return `${row.userId}|${targetType(row)}|${targetId(row)}`;
}

function targetKey(row) {
  return `${targetType(row)}|${targetId(row)}`;
}

function targetCollection(type, world) {
  return type === 'activity' ? world.activities
    : type === 'opportunity' ? world.opportunities : world.fundraisers;
}

function userDistribution(world, rows) {
  const counts = new Map(world.users.map((user) => [user.id, 0]));
  for (const row of rows) counts.set(row.userId, counts.get(row.userId) + 1);
  const values = [...counts.values()];
  return {
    ...distribution(values),
    byTier: Object.fromEntries(CONFIG.userTiers.map(({ name }) => {
      const users = world.users.filter((user) => user.tier === name);
      const tierValues = users.map((user) => counts.get(user.id));
      return [name, {
        users: users.length,
        rows: tierValues.reduce((sum, value) => sum + value, 0),
        averagePerUser: rounded(tierValues.reduce((sum, value) => sum + value, 0) / users.length),
        median: percentile(tierValues, 0.5),
        zeroUsers: tierValues.filter((value) => value === 0).length,
      }];
    })),
    topUsers: world.users.map((user) => ({
      name: user.displayName, tier: user.tier, rows: counts.get(user.id),
    })).sort((first, second) => (
      second.rows - first.rows || first.name.localeCompare(second.name)
    )).slice(0, 12),
  };
}

function targetDistribution(world, rows) {
  return Object.fromEntries(['activity', 'opportunity', 'fundraiser'].map((type) => {
    const collection = targetCollection(type, world);
    const counts = new Map(collection.map((item) => [item.id, 0]));
    for (const row of rows.filter((item) => targetType(item) === type)) {
      counts.set(targetId(row), counts.get(targetId(row)) + 1);
    }
    const values = [...counts.values()];
    return [type, {
      targets: collection.length,
      distinctEngaged: values.filter((value) => value > 0).length,
      ...distribution(values),
      buckets: bucketCounts(values),
    }];
  }));
}

function followsHost(userId, details, maps) {
  return details.hostUserId
    ? maps.userFollowByPair.has(`${userId}|${details.hostUserId}`)
    : maps.organizationFollowByPair.has(`${userId}|${details.hostOrganizationId}`);
}

function affinityDiagnostics(type, rows, maps) {
  const signals = {
    followsOwnerOrHost: 0,
    sharesCause: 0,
    coParticipant: 0,
    followsOriginatingOrganization: 0,
    registered: 0,
    saved: 0,
    followsJoinedAttendee: 0,
    financialSupporter: 0,
    followsBeneficiary: 0,
    followsAnotherSupporter: 0,
  };
  for (const row of rows) {
    const user = maps.userById.get(row.userId);
    const target = type === 'activity' ? maps.activityById.get(row.activityId)
      : type === 'opportunity' ? maps.opportunityById.get(row.opportunityId)
        : maps.fundraiserById.get(row.fundraiserId);
    const details = targetDetails(type, target, maps);
    if (followsHost(user.id, details, maps)
      || (details.ownerUserId
        && maps.userFollowByPair.has(`${user.id}|${details.ownerUserId}`))) {
      signals.followsOwnerOrHost += 1;
    }
    if (user.causes.includes(details.cause.name)) signals.sharesCause += 1;
    if (type === 'activity') {
      if (details.context.opportunity
        && completedCoParticipantActivity(user.id, details.context.opportunity.id, maps)) {
        signals.coParticipant += 1;
      }
      if (details.context.hostOrganizationId
        && maps.organizationFollowByPair.has(
          `${user.id}|${details.context.hostOrganizationId}`
        )) signals.followsOriginatingOrganization += 1;
    } else if (type === 'opportunity') {
      if (joinedRegistration(user.id, target.id, maps)) signals.registered += 1;
      if (maps.saveByPair.has(`${user.id}|${target.id}`)) signals.saved += 1;
      if (followedJoinedRegistration(user.id, target.id, maps)) {
        signals.followsJoinedAttendee += 1;
      }
    } else {
      if (maps.supportByPair.has(`${user.id}|${target.id}`)) signals.financialSupporter += 1;
      if (target.beneficiaryOrganizationId
        && maps.organizationFollowByPair.has(
          `${user.id}|${target.beneficiaryOrganizationId}`
        )) signals.followsBeneficiary += 1;
      if (followedSupport(user.id, target.id, maps)) signals.followsAnotherSupporter += 1;
    }
  }
  const common = {
    followsOwnerOrHostPercent: percentage(signals.followsOwnerOrHost, rows.length),
    sharesCausePercent: percentage(signals.sharesCause, rows.length),
  };
  if (type === 'activity') return {
    ...common,
    coParticipantPercent: percentage(signals.coParticipant, rows.length),
    followsOriginatingOrganizationPercent: percentage(
      signals.followsOriginatingOrganization, rows.length
    ),
  };
  if (type === 'opportunity') return {
    ...common,
    registeredPercent: percentage(signals.registered, rows.length),
    savedPercent: percentage(signals.saved, rows.length),
    followsJoinedAttendeePercent: percentage(signals.followsJoinedAttendee, rows.length),
  };
  return {
    ...common,
    financialSupporterPercent: percentage(signals.financialSupporter, rows.length),
    followsBeneficiaryPercent: percentage(signals.followsBeneficiary, rows.length),
    followsAnotherSupporterPercent: percentage(signals.followsAnotherSupporter, rows.length),
  };
}

const TRUTH_AWARE_CATEGORIES = Object.freeze([
  'activity_co_participant',
  'opportunity_joined',
  'opportunity_saved',
  'fundraiser_supporter',
  'fundraiser_ended_success',
]);

function occursAtOrAfter(createdAt, dependency) {
  const created = new Date(createdAt).getTime();
  const required = new Date(dependency).getTime();
  return Number.isFinite(created) && Number.isFinite(required) && created >= required;
}

function truthAwareRelationshipValid(row, category, maps) {
  if (category === 'activity_co_participant') {
    const target = maps.activityById.get(row.activityId);
    if (!target) return false;
    const details = targetDetails('activity', target, maps);
    if (!details.context.opportunity) return false;
    const completedActivity = completedCoParticipantActivity(
      row.userId, details.context.opportunity.id, maps
    );
    return Boolean(completedActivity
      && occursAtOrAfter(row.createdAt, completedActivity.createdAt));
  }
  if (category === 'opportunity_joined') {
    const target = maps.opportunityById.get(row.opportunityId);
    if (!target || !['upcoming', 'farther_future'].includes(target.timeBucket)) return false;
    const registration = joinedRegistration(row.userId, target.id, maps);
    return Boolean(registration && occursAtOrAfter(row.createdAt, registration.joinedAt));
  }
  if (category === 'opportunity_saved') {
    const saved = maps.saveByPair.get(`${row.userId}|${row.opportunityId}`);
    return Boolean(saved && occursAtOrAfter(row.createdAt, saved.savedAt));
  }
  if (category === 'fundraiser_supporter') {
    const support = maps.supportByPair.get(`${row.userId}|${row.fundraiserId}`);
    return Boolean(support && occursAtOrAfter(row.createdAt, support.supportedAt));
  }
  if (category === 'fundraiser_ended_success') {
    const target = maps.fundraiserById.get(row.fundraiserId);
    const progress = target ? maps.fundraiserProgress.get(target.id) : null;
    return Boolean(target && lifecycleOf(target) === 'ended'
      && progress?.progressPercent >= 100
      && occursAtOrAfter(row.createdAt, easternTimestamp(target.endDate, '23:59:59')));
  }
  return true;
}

function overlapDiagnostics(world) {
  const reactionPairs = new Set(world.reactions.map(socialPair));
  const commentPairs = new Set(world.comments.map(socialPair));
  const reactionTargets = new Set(world.reactions.map(targetKey));
  const commentTargets = new Set(world.comments.map(targetKey));
  function forType(type = null) {
    const comments = type
      ? world.comments.filter((row) => targetType(row) === type) : world.comments;
    const reactions = type
      ? world.reactions.filter((row) => targetType(row) === type) : world.reactions;
    const commented = new Set(comments.map(targetKey));
    const reacted = new Set(reactions.map(targetKey));
    return {
      commentersAlsoReactedPercent: percentage(
        comments.filter((row) => reactionPairs.has(socialPair(row))).length,
        comments.length
      ),
      commentedTargetsWithReactionPercent: percentage(
        [...commented].filter((key) => reactionTargets.has(key)).length,
        commented.size
      ),
      reactedTargetsWithCommentPercent: percentage(
        [...reacted].filter((key) => commentTargets.has(key)).length,
        reacted.size
      ),
    };
  }
  return {
    overall: forType(),
    byTargetType: Object.fromEntries(
      ['activity', 'opportunity', 'fundraiser'].map((type) => [type, forType(type)])
    ),
    distinctUserTargetReactionPairs: reactionPairs.size,
    distinctUserTargetCommentPairs: commentPairs.size,
  };
}

function activityTitle(activity, maps) {
  if (!activity.registrationId) return activity.manualTitle;
  const registration = maps.registrationById.get(activity.registrationId);
  return maps.opportunityById.get(registration.opportunityId).title;
}

function targetName(type, target, maps) {
  return type === 'activity' ? activityTitle(target, maps) : target.title;
}

function describeRow(row, maps) {
  const type = targetType(row);
  const target = type === 'activity' ? maps.activityById.get(row.activityId)
    : type === 'opportunity' ? maps.opportunityById.get(row.opportunityId)
      : maps.fundraiserById.get(row.fundraiserId);
  const details = targetDetails(type, target, maps);
  const user = maps.userById.get(row.userId);
  const relatedOpportunity = type === 'activity'
    ? details.context.opportunity : type === 'opportunity' ? target : null;
  const registration = relatedOpportunity
    ? joinedRegistration(user.id, relatedOpportunity.id, maps) : null;
  const saved = type === 'opportunity'
    ? maps.saveByPair.get(`${user.id}|${target.id}`) : null;
  const financialSupport = type === 'fundraiser'
    ? maps.supportByPair.get(`${user.id}|${target.id}`) : null;
  return {
    kind: row.reactionType ? 'reaction' : 'comment',
    actor: user.displayName,
    actorTier: user.tier,
    targetType: type,
    target: targetName(type, target, maps),
    cause: details.cause.name,
    reactionType: row.reactionType || null,
    commentCategory: row.body ? classifyCommentBody(row.body, type) : null,
    body: row.body || null,
    createdAt: row.createdAt,
    context: {
      followsOwnerOrHost: followsHost(user.id, details, maps)
        || Boolean(details.ownerUserId
          && maps.userFollowByPair.has(`${user.id}|${details.ownerUserId}`)),
      sharesCause: user.causes.includes(details.cause.name),
      registeredOrCoParticipant: type === 'activity'
        ? Boolean(details.context.opportunity
          && completedCoParticipantActivity(user.id, details.context.opportunity.id, maps))
        : type === 'opportunity' ? Boolean(joinedRegistration(user.id, target.id, maps)) : false,
      saved: type === 'opportunity'
        ? maps.saveByPair.has(`${user.id}|${target.id}`) : false,
      financialSupporter: type === 'fundraiser'
        ? maps.supportByPair.has(`${user.id}|${target.id}`) : false,
      joinedAt: registration?.joinedAt || null,
      savedAt: saved?.savedAt || null,
      financialSupportAmountDollars: financialSupport
        ? financialSupport.amountCents / 100 : null,
      financiallySupportedAt: financialSupport?.supportedAt || null,
    },
  };
}

function anchorDiagnostics(world, maps, target, type) {
  const reactions = world.reactions.filter((row) => row[`${type}Id`] === target.id);
  const comments = world.comments.filter((row) => row[`${type}Id`] === target.id);
  return {
    target: targetName(type, target, maps),
    reactionCount: reactions.length,
    reactionTypes: Object.fromEntries(['like', 'celebrate', 'support'].map((reactionType) => [
      reactionType, reactions.filter((row) => row.reactionType === reactionType).length,
    ])),
    reactions: reactions.map((row) => describeRow(row, maps)),
    commentCount: comments.length,
    comments: comments.map((row) => describeRow(row, maps)),
  };
}

function representativeStories(world, maps) {
  const selected = [];
  const used = new Set();
  function add(rows, predicate) {
    const row = rows.find((candidate) => !used.has(candidate.id) && predicate(
      candidate, describeRow(candidate, maps)
    ));
    if (row) {
      used.add(row.id);
      selected.push(describeRow(row, maps));
    }
  }
  add(world.reactions, (row, item) => item.targetType === 'activity'
    && !maps.activityById.get(row.activityId).registrationId);
  add(world.comments, (row, item) => item.commentCategory === 'activity_manual');
  add(world.comments, (row, item) => item.commentCategory === 'activity_co_participant');
  add(world.reactions, (row, item) => item.targetType === 'activity' && item.context.followsOwnerOrHost);
  add(world.comments, (row, item) => item.commentCategory === 'opportunity_joined');
  add(world.reactions, (row, item) => item.targetType === 'opportunity' && item.context.saved);
  add(world.comments, (row, item) => item.commentCategory === 'opportunity_host_follower');
  add(world.comments, (row, item) => item.commentCategory === 'opportunity_attendee_social');
  add(world.reactions, (row, item) => item.targetType === 'fundraiser'
    && item.context.financialSupporter);
  add(world.comments, (row, item) => item.commentCategory === 'fundraiser_supporter');
  add(world.reactions, (row, item) => item.targetType === 'fundraiser'
    && item.context.sharesCause && !item.context.financialSupporter);
  add(world.comments, (row, item) => item.commentCategory === 'fundraiser_ended_success');
  add(world.comments, (row) => row.body === 'Love seeing this, Maya — such a good way to spend a morning.');
  add(world.comments, (row) => row.body === 'Such a practical way to show up for veterans and their families.');
  const reactionCounts = new Map();
  for (const row of world.reactions) reactionCounts.set(
    targetKey(row), (reactionCounts.get(targetKey(row)) || 0) + 1
  );
  const lowKey = [...reactionCounts].find(([, count]) => count === 1)?.[0];
  const highKey = [...reactionCounts].sort((first, second) => second[1] - first[1])[0]?.[0];
  add(world.reactions, (row) => targetKey(row) === lowKey);
  add(world.reactions, (row) => targetKey(row) === highKey);
  while (selected.length < 18) add(
    selected.length % 2 ? world.comments : world.reactions,
    () => true
  );
  return selected;
}

function metricIsolation(world) {
  const withoutSocial = { ...world, reactions: [], comments: [] };
  const serialize = (value) => JSON.stringify(value instanceof Map ? [...value] : value);
  function opportunityState(input) {
    const counts = new Map(input.opportunities.map((item) => [item.id, 0]));
    for (const row of input.registrations.filter((item) => item.status === 'joined')) {
      counts.set(row.opportunityId, counts.get(row.opportunityId) + 1);
    }
    return input.opportunities.map((item) => ({
      id: item.id, participants: counts.get(item.id), available: item.capacity - counts.get(item.id),
    }));
  }
  return {
    profileMetricsUnchanged: serialize(deriveProfileMetrics(world))
      === serialize(deriveProfileMetrics(withoutSocial)),
    amountRaisedProfilesUnchanged: serialize(deriveAmountRaisedByUser(world))
      === serialize(deriveAmountRaisedByUser(withoutSocial)),
    organizationPublicImpactUnchanged: serialize(buildOrganizationPublicImpact(world))
      === serialize(buildOrganizationPublicImpact(withoutSocial)),
    opportunityParticipantAvailabilityUnchanged: serialize(opportunityState(world))
      === serialize(opportunityState(withoutSocial)),
    fundraiserProgressUnchanged: serialize(deriveFundraiserProgress(world))
      === serialize(deriveFundraiserProgress(withoutSocial)),
  };
}

function buildSocialDiagnostics(world) {
  const maps = socialMaps(world);
  const reactionsByType = Object.fromEntries(['activity', 'opportunity', 'fundraiser'].map((type) => [
    type, world.reactions.filter((row) => targetType(row) === type),
  ]));
  const commentsByType = Object.fromEntries(['activity', 'opportunity', 'fundraiser'].map((type) => [
    type, world.comments.filter((row) => targetType(row) === type),
  ]));
  const reactionMatrix = Object.fromEntries(Object.entries(reactionsByType).map(([type, rows]) => [
    type, Object.fromEntries(['like', 'celebrate', 'support'].map((reactionType) => [
      reactionType, rows.filter((row) => row.reactionType === reactionType).length,
    ])),
  ]));
  const maya = world.users.find((user) => user.displayName === 'Maya Ellis');
  const david = world.users.find((user) => user.displayName === 'David Mercer');
  const mayaActivity = world.activities.find((item) => (
    item.userId === maya.id && item.manualTitle === 'Westside Community Garden Morning'
  ));
  const davidActivity = world.activities.find((item) => (
    item.userId === david.id && activityTitle(item, maps) === 'Veterans Care Package Assembly'
  ));
  const flagship = world.opportunities.find((item) => item.flagship);
  const anchorFundraiser = (title) => world.fundraisers.find((item) => item.title === title);
  const categoryCounts = {};
  let truthAware = 0;
  for (const row of world.comments) {
    const category = classifyCommentBody(row.body, targetType(row));
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    if (TRUTH_AWARE_CATEGORIES.includes(category)) truthAware += 1;
  }
  let relationshipDependencyFailures = 0;
  let totalCausalityFailures = 0;
  const truthCausality = Object.fromEntries(TRUTH_AWARE_CATEGORIES.map(
    (category) => [category, { rows: 0, failures: 0 }]
  ));
  for (const row of [...world.reactions, ...world.comments]) {
    const type = targetType(row);
    const target = type === 'activity' ? maps.activityById.get(row.activityId)
      : type === 'opportunity' ? maps.opportunityById.get(row.opportunityId)
        : maps.fundraiserById.get(row.fundraiserId);
    const details = targetDetails(type, target, maps);
    const user = maps.userById.get(row.userId);
    const relationshipFailure = relationshipDependencies(user, details, maps).some(
      (dependency) => new Date(row.createdAt) < new Date(dependency)
    );
    if (relationshipFailure) relationshipDependencyFailures += 1;
    let truthFailure = false;
    if (row.body) {
      const category = classifyCommentBody(row.body, type);
      if (truthCausality[category]) {
        truthCausality[category].rows += 1;
        truthFailure = !truthAwareRelationshipValid(row, category, maps);
        if (truthFailure) truthCausality[category].failures += 1;
      }
    }
    if (relationshipFailure || truthFailure) totalCausalityFailures += 1;
  }
  const truthAwareFailures = Object.values(truthCausality).reduce(
    (sum, value) => sum + value.failures, 0
  );

  return {
    reactions: {
      total: world.reactions.length,
      byTarget: Object.fromEntries(Object.entries(reactionsByType).map(
        ([type, rows]) => [type, rows.length]
      )),
      byReactionType: Object.fromEntries(['like', 'celebrate', 'support'].map((type) => [
        type, world.reactions.filter((row) => row.reactionType === type).length,
      ])),
      targetByReactionType: reactionMatrix,
      activitySource: {
        kynd: reactionsByType.activity.filter((row) => maps.activityById.get(row.activityId).registrationId).length,
        manual: reactionsByType.activity.filter((row) => !maps.activityById.get(row.activityId).registrationId).length,
      },
      opportunityLifecycle: Object.fromEntries(
        ['upcoming', 'recent_past', 'farther_future', 'cancelled'].map((lifecycle) => [
          lifecycle, reactionsByType.opportunity.filter((row) => (
            maps.opportunityById.get(row.opportunityId).timeBucket === lifecycle
          )).length,
        ])
      ),
      fundraiserLifecycle: Object.fromEntries(['open', 'ended', 'cancelled'].map((lifecycle) => [
        lifecycle, reactionsByType.fundraiser.filter((row) => (
          lifecycleOf(maps.fundraiserById.get(row.fundraiserId)) === lifecycle
        )).length,
      ])),
      users: userDistribution(world, world.reactions),
      targets: targetDistribution(world, world.reactions),
    },
    comments: {
      total: world.comments.length,
      byTarget: Object.fromEntries(Object.entries(commentsByType).map(
        ([type, rows]) => [type, rows.length]
      )),
      activitySource: {
        kynd: commentsByType.activity.filter((row) => maps.activityById.get(row.activityId).registrationId).length,
        manual: commentsByType.activity.filter((row) => !maps.activityById.get(row.activityId).registrationId).length,
      },
      opportunityLifecycle: Object.fromEntries(
        ['upcoming', 'recent_past', 'farther_future', 'cancelled'].map((lifecycle) => [
          lifecycle, commentsByType.opportunity.filter((row) => (
            maps.opportunityById.get(row.opportunityId).timeBucket === lifecycle
          )).length,
        ])
      ),
      fundraiserLifecycle: Object.fromEntries(['open', 'ended', 'cancelled'].map((lifecycle) => [
        lifecycle, commentsByType.fundraiser.filter((row) => (
          lifecycleOf(maps.fundraiserById.get(row.fundraiserId)) === lifecycle
        )).length,
      ])),
      users: userDistribution(world, world.comments),
      targets: targetDistribution(world, world.comments),
      categories: categoryCounts,
      bodyLength: distribution(world.comments.map((row) => row.body.length)),
      bodiesWithin20To120: world.comments.filter((row) => (
        row.body.length >= 20 && row.body.length <= 120
      )).length,
      truthAwareRows: truthAware,
      truthAwareRelationshipsValidPercent: percentage(
        truthAware - truthAwareFailures, truthAware
      ),
    },
    overlap: overlapDiagnostics(world),
    affinity: {
      activity: {
        reactions: affinityDiagnostics('activity', reactionsByType.activity, maps),
        comments: affinityDiagnostics('activity', commentsByType.activity, maps),
        bySource: Object.fromEntries(['kynd', 'manual'].map((source) => {
          const predicate = (row) => Boolean(maps.activityById.get(row.activityId).registrationId)
            === (source === 'kynd');
          return [source, {
            reactions: affinityDiagnostics(
              'activity', reactionsByType.activity.filter(predicate), maps
            ),
            comments: affinityDiagnostics(
              'activity', commentsByType.activity.filter(predicate), maps
            ),
          }];
        })),
      },
      opportunity: {
        reactions: affinityDiagnostics('opportunity', reactionsByType.opportunity, maps),
        comments: affinityDiagnostics('opportunity', commentsByType.opportunity, maps),
        byLifecycle: Object.fromEntries(
          ['upcoming', 'recent_past', 'farther_future'].map((lifecycle) => {
            const predicate = (row) => (
              maps.opportunityById.get(row.opportunityId).timeBucket === lifecycle
            );
            return [lifecycle, {
              reactions: affinityDiagnostics(
                'opportunity', reactionsByType.opportunity.filter(predicate), maps
              ),
              comments: affinityDiagnostics(
                'opportunity', commentsByType.opportunity.filter(predicate), maps
              ),
            }];
          })
        ),
      },
      fundraiser: {
        reactions: affinityDiagnostics('fundraiser', reactionsByType.fundraiser, maps),
        comments: affinityDiagnostics('fundraiser', commentsByType.fundraiser, maps),
        byLifecycle: Object.fromEntries(['open', 'ended'].map((lifecycle) => {
          const predicate = (row) => (
            lifecycleOf(maps.fundraiserById.get(row.fundraiserId)) === lifecycle
          );
          return [lifecycle, {
            reactions: affinityDiagnostics(
              'fundraiser', reactionsByType.fundraiser.filter(predicate), maps
            ),
            comments: affinityDiagnostics(
              'fundraiser', commentsByType.fundraiser.filter(predicate), maps
            ),
          }];
        })),
      },
    },
    causality: {
      relationshipDependencyFailures,
      truthAwareRelationshipFailures: truthAwareFailures,
      totalCausalityFailures,
      socialProofUsesOnlyEarlierRelationships: totalCausalityFailures === 0,
      byTruthAwareCategory: truthCausality,
    },
    anchors: {
      mayaActivity: anchorDiagnostics(world, maps, mayaActivity, 'activity'),
      davidActivity: anchorDiagnostics(world, maps, davidActivity, 'activity'),
      flagshipOpportunity: anchorDiagnostics(world, maps, flagship, 'opportunity'),
      mayaFundraiser: anchorDiagnostics(world, maps,
        anchorFundraiser('100 Meal Boxes for Atlanta Families'), 'fundraiser'),
      davidFundraiser: anchorDiagnostics(world, maps,
        anchorFundraiser('Roswell Veterans Resource Day Fund'), 'fundraiser'),
      riverlightFundraiser: anchorDiagnostics(world, maps,
        anchorFundraiser("Keep Atlanta's Waterways Clean This Fall"), 'fundraiser'),
      mosaicFundraiser: anchorDiagnostics(world, maps,
        anchorFundraiser('Summer Meal Box Fund'), 'fundraiser'),
    },
    representativeStories: representativeStories(world, maps),
    metricIsolation: metricIsolation(world),
    fundraiserSupportReactions: world.reactions.filter((row) => (
      row.fundraiserId && row.reactionType === 'support'
    )).length,
  };
}

module.exports = { buildSocialDiagnostics, metricIsolation };
