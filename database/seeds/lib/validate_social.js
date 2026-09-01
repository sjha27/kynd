const CONFIG = require('../config');
const { deterministicUuid } = require('./ids');
const { lifecycleOf, easternTimestamp } = require('./fundraisers');
const {
  socialMaps,
  targetDetails,
  joinedRegistration,
  completedCoParticipantActivity,
  relationshipDependencies,
  classifyCommentBody,
} = require('./social');
const { ANCHOR_COMMENTS } = require('../data/social');

const UUID_V5_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REACTION_TYPES = new Set(['like', 'celebrate', 'support']);

function assert(condition, message) {
  if (!condition) throw new Error(`Seed validation failed: ${message}`);
}

function timestamp(label, value) {
  const result = new Date(value).getTime();
  assert(Number.isFinite(result), `${label} has invalid timestamp: ${value}`);
  return result;
}

function targetOf(row, maps) {
  const populated = [
    ['activity', 'activityId', maps.activityById],
    ['opportunity', 'opportunityId', maps.opportunityById],
    ['fundraiser', 'fundraiserId', maps.fundraiserById],
  ].filter(([, key]) => row[key] !== null && row[key] !== undefined);
  assert(populated.length === 1, `social row ${row.id} must have exactly one target`);
  const [type, key, collection] = populated[0];
  const target = collection.get(row[key]);
  assert(target, `social row ${row.id} references missing ${type}: ${row[key]}`);
  return { type, target, key };
}

function countByTarget(rows) {
  return {
    activity: rows.filter((row) => row.activityId !== null).length,
    opportunity: rows.filter((row) => row.opportunityId !== null).length,
    fundraiser: rows.filter((row) => row.fundraiserId !== null).length,
  };
}

function assertCounts(label, actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    assert(actual[key] === value, `${label} ${key} count is ${actual[key]}; expected ${value}`);
  }
}

function validateReactionCounts(world, maps) {
  const targets = CONFIG.socialTargets.reactions;
  assert(world.reactions.length === targets.total,
    `reaction count is ${world.reactions.length}; expected ${targets.total}`);
  assertCounts('reaction target', countByTarget(world.reactions), targets.byTarget);
  for (const [type, expected] of Object.entries(targets.byTargetAndType)) {
    const rows = world.reactions.filter((row) => row[`${type}Id`] !== null);
    const actual = Object.fromEntries([...REACTION_TYPES].map((reactionType) => [
      reactionType, rows.filter((row) => row.reactionType === reactionType).length,
    ]));
    assertCounts(`${type} reaction type`, actual, expected);
  }
  const activityRows = world.reactions.filter((row) => row.activityId !== null);
  assertCounts('activity reaction source', {
    kynd: activityRows.filter((row) => maps.activityById.get(row.activityId).registrationId).length,
    manual: activityRows.filter((row) => !maps.activityById.get(row.activityId).registrationId).length,
  }, targets.activitySource);
  const opportunityRows = world.reactions.filter((row) => row.opportunityId !== null);
  assertCounts('opportunity reaction lifecycle', Object.fromEntries(
    Object.keys(targets.opportunityLifecycle).map((lifecycle) => [
      lifecycle,
      opportunityRows.filter((row) => maps.opportunityById.get(row.opportunityId).timeBucket
        === lifecycle).length,
    ])
  ), targets.opportunityLifecycle);
  const fundraiserRows = world.reactions.filter((row) => row.fundraiserId !== null);
  assertCounts('fundraiser reaction lifecycle', Object.fromEntries(
    Object.keys(targets.fundraiserLifecycle).map((lifecycle) => [
      lifecycle,
      fundraiserRows.filter((row) => lifecycleOf(maps.fundraiserById.get(row.fundraiserId))
        === lifecycle).length,
    ])
  ), targets.fundraiserLifecycle);
}

function validateCommentCounts(world, maps) {
  const targets = CONFIG.socialTargets.comments;
  assert(world.comments.length === targets.total,
    `comment count is ${world.comments.length}; expected ${targets.total}`);
  assertCounts('comment target', countByTarget(world.comments), targets.byTarget);
  const activityRows = world.comments.filter((row) => row.activityId !== null);
  assertCounts('activity comment source', {
    kynd: activityRows.filter((row) => maps.activityById.get(row.activityId).registrationId).length,
    manual: activityRows.filter((row) => !maps.activityById.get(row.activityId).registrationId).length,
  }, targets.activitySource);
  const opportunityRows = world.comments.filter((row) => row.opportunityId !== null);
  assertCounts('opportunity comment lifecycle', Object.fromEntries(
    Object.keys(targets.opportunityLifecycle).map((lifecycle) => [
      lifecycle,
      opportunityRows.filter((row) => maps.opportunityById.get(row.opportunityId).timeBucket
        === lifecycle).length,
    ])
  ), targets.opportunityLifecycle);
  const fundraiserRows = world.comments.filter((row) => row.fundraiserId !== null);
  assertCounts('fundraiser comment lifecycle', Object.fromEntries(
    Object.keys(targets.fundraiserLifecycle).map((lifecycle) => [
      lifecycle,
      fundraiserRows.filter((row) => lifecycleOf(maps.fundraiserById.get(row.fundraiserId))
        === lifecycle).length,
    ])
  ), targets.fundraiserLifecycle);
}

function validateActiveTargetCounts(world, maps) {
  function distinct(rows, key) {
    return new Set(rows.map((row) => row[key])).size;
  }
  for (const [kind, rows] of [['reactions', world.reactions], ['comments', world.comments]]) {
    const expected = CONFIG.socialTargets[kind].activeTargets;
    const activity = rows.filter((row) => row.activityId !== null);
    const opportunity = rows.filter((row) => row.opportunityId !== null);
    const fundraiser = rows.filter((row) => row.fundraiserId !== null);
    const actual = {
      activityKynd: distinct(activity.filter((row) => (
        maps.activityById.get(row.activityId).registrationId !== null
      )), 'activityId'),
      activityManual: distinct(activity.filter((row) => (
        maps.activityById.get(row.activityId).registrationId === null
      )), 'activityId'),
      opportunityUpcoming: distinct(opportunity.filter((row) => (
        maps.opportunityById.get(row.opportunityId).timeBucket === 'upcoming'
      )), 'opportunityId'),
      opportunityRecentPast: distinct(opportunity.filter((row) => (
        maps.opportunityById.get(row.opportunityId).timeBucket === 'recent_past'
      )), 'opportunityId'),
      opportunityFartherFuture: distinct(opportunity.filter((row) => (
        maps.opportunityById.get(row.opportunityId).timeBucket === 'farther_future'
      )), 'opportunityId'),
      fundraiserOpen: distinct(fundraiser.filter((row) => (
        lifecycleOf(maps.fundraiserById.get(row.fundraiserId)) === 'open'
      )), 'fundraiserId'),
      fundraiserEnded: distinct(fundraiser.filter((row) => (
        lifecycleOf(maps.fundraiserById.get(row.fundraiserId)) === 'ended'
      )), 'fundraiserId'),
    };
    assertCounts(`${kind} active target`, actual, expected);
  }
}

function validateReactionRows(world, maps) {
  const ids = new Set();
  const pairs = new Set();
  const anchor = timestamp('configured anchor', CONFIG.anchorDate);
  for (const row of world.reactions) {
    assert(UUID_V5_PATTERN.test(row.id), `reaction has invalid UUIDv5: ${row.id}`);
    assert(!ids.has(row.id), `duplicate reaction ID: ${row.id}`);
    ids.add(row.id);
    const user = maps.userById.get(row.userId);
    assert(user, `reaction ${row.id} references missing user`);
    assert(REACTION_TYPES.has(row.reactionType), `reaction ${row.id} has invalid type`);
    const { type, target } = targetOf(row, maps);
    const details = targetDetails(type, target, maps);
    const pair = `${row.userId}|${type}|${target.id}`;
    assert(!pairs.has(pair), `duplicate user-target reaction: ${pair}`);
    pairs.add(pair);
    assert(row.id === deterministicUuid('reaction', pair),
      `reaction ${row.id} identity is not deterministic`);
    assert(row.userId !== details.ownerUserId && row.userId !== details.hostUserId,
      `reaction ${row.id} is seeded self-engagement`);
    if (type === 'fundraiser') {
      assert(row.reactionType !== 'support', `fundraiser ${target.id} has support reaction`);
      assert(lifecycleOf(target) !== 'cancelled', `cancelled fundraiser ${target.id} has reaction`);
    }
    if (type === 'opportunity') {
      assert(target.status !== 'cancelled', `cancelled opportunity ${target.id} has reaction`);
    }
    const createdAt = timestamp(`${row.id} createdAt`, row.createdAt);
    assert(createdAt >= timestamp(`${row.id} user creation`, user.createdAt),
      `reaction ${row.id} predates user`);
    assert(createdAt >= timestamp(`${row.id} target creation`, target.createdAt),
      `reaction ${row.id} predates target`);
    assert(createdAt <= anchor, `reaction ${row.id} is after anchor`);
    assert(relationshipDependencies(user, details, maps).every((dependency) => (
      createdAt >= timestamp(`${row.id} relationship dependency`, dependency)
    )), `reaction ${row.id} predates an affinity relationship`);
  }
}

function validateTruthAwareComment(row, type, target, category, maps) {
  const createdAt = timestamp(`${row.id} createdAt`, row.createdAt);
  if (category === 'activity_co_participant') {
    const details = targetDetails(type, target, maps);
    assert(details.context.opportunity,
      `co-participant comment ${row.id} targets manual activity`);
    const completedActivity = completedCoParticipantActivity(
      row.userId, details.context.opportunity.id, maps
    );
    assert(completedActivity,
      `co-participant comment ${row.id} lacks completed shared participation`);
    assert(createdAt >= timestamp(`${row.id} co-participant Activity`, completedActivity.createdAt),
      `co-participant comment ${row.id} predates completed shared participation`);
  } else if (category === 'opportunity_joined') {
    const registration = joinedRegistration(row.userId, target.id, maps);
    assert(registration, `joined comment ${row.id} lacks joined registration`);
    assert(['upcoming', 'farther_future'].includes(target.timeBucket),
      `joined comment ${row.id} targets an opportunity that already occurred`);
    assert(createdAt >= timestamp(`${row.id} joinedAt`, registration.joinedAt),
      `joined comment ${row.id} predates registration`);
  } else if (category === 'opportunity_saved') {
    const saved = maps.saveByPair.get(`${row.userId}|${target.id}`);
    assert(saved, `saved comment ${row.id} lacks saved-opportunity relationship`);
    assert(createdAt >= timestamp(`${row.id} savedAt`, saved.savedAt),
      `saved comment ${row.id} predates save`);
  } else if (category === 'fundraiser_supporter') {
    const support = maps.supportByPair.get(`${row.userId}|${target.id}`);
    assert(support, `supporter comment ${row.id} lacks financial support`);
    assert(createdAt >= timestamp(`${row.id} supportedAt`, support.supportedAt),
      `supporter comment ${row.id} predates financial support`);
  } else if (category === 'fundraiser_ended_success') {
    assert(lifecycleOf(target) === 'ended'
      && maps.fundraiserProgress.get(target.id).progressPercent >= 100,
    `ended-success comment ${row.id} lacks successful ended campaign`);
    assert(createdAt >= timestamp(
      `${row.id} fundraiser end`, easternTimestamp(target.endDate, '23:59:59')
    ), `ended-success comment ${row.id} predates campaign end`);
  }
}

function validateCommentRows(world, maps) {
  const ids = new Set();
  const pairs = new Set();
  const anchor = timestamp('configured anchor', CONFIG.anchorDate);
  for (const row of world.comments) {
    assert(UUID_V5_PATTERN.test(row.id), `comment has invalid UUIDv5: ${row.id}`);
    assert(!ids.has(row.id), `duplicate comment ID: ${row.id}`);
    ids.add(row.id);
    const user = maps.userById.get(row.userId);
    assert(user, `comment ${row.id} references missing user`);
    assert(typeof row.body === 'string' && row.body.trim() === row.body
      && row.body.length > 0 && row.body.length <= 1000,
    `comment ${row.id} has invalid body`);
    const { type, target } = targetOf(row, maps);
    const details = targetDetails(type, target, maps);
    const pair = `${row.userId}|${type}|${target.id}`;
    assert(!pairs.has(pair), `duplicate seeded user-target comment: ${pair}`);
    pairs.add(pair);
    assert(row.id === deterministicUuid('comment', pair),
      `comment ${row.id} identity is not deterministic`);
    assert(row.userId !== details.ownerUserId && row.userId !== details.hostUserId,
      `comment ${row.id} is seeded self-engagement`);
    if (type === 'fundraiser') {
      assert(lifecycleOf(target) !== 'cancelled', `cancelled fundraiser ${target.id} has comment`);
    }
    if (type === 'opportunity') {
      assert(target.status !== 'cancelled', `cancelled opportunity ${target.id} has comment`);
    }
    const createdAt = timestamp(`${row.id} createdAt`, row.createdAt);
    assert(createdAt >= timestamp(`${row.id} user creation`, user.createdAt),
      `comment ${row.id} predates user`);
    assert(createdAt >= timestamp(`${row.id} target creation`, target.createdAt),
      `comment ${row.id} predates target`);
    assert(createdAt <= anchor, `comment ${row.id} is after anchor`);
    assert(relationshipDependencies(user, details, maps).every((dependency) => (
      createdAt >= timestamp(`${row.id} relationship dependency`, dependency)
    )), `comment ${row.id} predates an affinity relationship`);
    const category = classifyCommentBody(row.body, type);
    assert(category, `comment ${row.id} is outside controlled social copy`);
    validateTruthAwareComment(row, type, target, category, maps);
  }
}

function validateAnchorTarget(world, targetId, expected, label) {
  const reactions = world.reactions.filter((row) => (
    row.activityId === targetId || row.opportunityId === targetId || row.fundraiserId === targetId
  ));
  const comments = world.comments.filter((row) => (
    row.activityId === targetId || row.opportunityId === targetId || row.fundraiserId === targetId
  ));
  assert(reactions.length === expected.reactions,
    `${label} reaction count is ${reactions.length}; expected ${expected.reactions}`);
  assert(comments.length === expected.comments,
    `${label} comment count is ${comments.length}; expected ${expected.comments}`);
  return { reactions, comments };
}

function validateAnchors(world, maps) {
  const maya = world.users.find((user) => user.displayName === 'Maya Ellis');
  const david = world.users.find((user) => user.displayName === 'David Mercer');
  const mayaActivity = world.activities.find((item) => (
    item.userId === maya.id && item.manualTitle === 'Westside Community Garden Morning'
  ));
  const davidActivity = world.activities.find((item) => {
    if (item.userId !== david.id || !item.registrationId) return false;
    const registration = maps.registrationById.get(item.registrationId);
    return registration.opportunityId
      === deterministicUuid('opportunity', 'generated-0580');
  });
  const flagship = world.opportunities.find((item) => item.flagship);
  const mayaFundraiser = world.fundraisers.find(
    (item) => item.title === '100 Meal Boxes for Atlanta Families'
  );
  const davidFundraiser = world.fundraisers.find(
    (item) => item.title === 'Roswell Veterans Resource Day Fund'
  );
  const riverlight = world.fundraisers.find(
    (item) => item.title === "Keep Atlanta's Waterways Clean This Fall"
  );
  const mosaic = world.fundraisers.find((item) => item.title === 'Summer Meal Box Fund');
  const expected = CONFIG.socialTargets.anchors;

  const mayaActivitySocial = validateAnchorTarget(
    world, mayaActivity.id, expected.mayaActivity, 'Maya Activity'
  );
  assert(mayaActivitySocial.reactions.some((row) => (
    row.userId === david.id && row.reactionType === 'celebrate'
  )), 'Maya Activity is missing David Celebrate');
  assert(mayaActivitySocial.comments.some((row) => (
    row.userId === david.id && row.body === ANCHOR_COMMENTS.mayaActivityByDavid
  )), 'Maya Activity is missing David authored comment');
  assert(![...mayaActivitySocial.reactions, ...mayaActivitySocial.comments]
    .some((row) => row.userId === maya.id), 'Maya self-engages on her Activity');

  const davidActivitySocial = validateAnchorTarget(
    world, davidActivity.id, expected.davidActivity, 'David Activity'
  );
  assert(davidActivitySocial.reactions.some((row) => (
    row.userId === maya.id && row.reactionType === 'celebrate'
  )), 'David Activity is missing Maya Celebrate');
  assert(davidActivitySocial.comments.some((row) => (
    row.userId === maya.id && row.body === ANCHOR_COMMENTS.davidActivityByMaya
  )), 'David Activity is missing Maya authored comment');
  assert(![...davidActivitySocial.reactions, ...davidActivitySocial.comments]
    .some((row) => row.userId === david.id), 'David self-engages on his Activity');

  const flagshipSocial = validateAnchorTarget(
    world, flagship.id, expected.flagshipOpportunity, 'flagship Opportunity'
  );
  assert(flagshipSocial.reactions.some((row) => (
    row.userId === maya.id && row.reactionType === 'support'
  )), 'flagship is missing Maya Support reaction');
  const mayaFlagshipComment = flagshipSocial.comments.find((row) => (
    row.userId === maya.id && row.body === ANCHOR_COMMENTS.flagshipByMaya
  ));
  assert(mayaFlagshipComment, 'flagship is missing Maya joined-backed comment');
  const joined = maps.registrationByPair.get(`${maya.id}|${flagship.id}`);
  assert(joined?.status === 'joined'
    && timestamp('Maya flagship comment', mayaFlagshipComment.createdAt)
      >= timestamp('Maya flagship join', joined.joinedAt),
  'Maya flagship comment is not backed by prior joined registration');
  const joinedIds = new Set(maps.registrationsByOpportunity.get(flagship.id)
    .filter((row) => row.status === 'joined' && row.userId !== maya.id)
    .map((row) => row.userId));
  assert([...flagshipSocial.reactions, ...flagshipSocial.comments]
    .some((row) => joinedIds.has(row.userId)),
  'flagship lacks engagement from another joined participant');

  for (const [label, target, creator, requiredActor, targetKey, body] of [
    ['Maya fundraiser', mayaFundraiser, maya, david, 'mayaFundraiser', ANCHOR_COMMENTS.mayaFundraiserByDavid],
    ['David fundraiser', davidFundraiser, david, maya, 'davidFundraiser', ANCHOR_COMMENTS.davidFundraiserByMaya],
  ]) {
    const social = validateAnchorTarget(world, target.id, expected[targetKey], label);
    assert(social.reactions.some((row) => (
      row.userId === requiredActor.id && row.reactionType === 'celebrate'
    )), `${label} is missing required Celebrate`);
    const comment = social.comments.find((row) => row.userId === requiredActor.id && row.body === body);
    const support = maps.supportByPair.get(`${requiredActor.id}|${target.id}`);
    assert(comment && support
      && timestamp(`${label} comment`, comment.createdAt)
        >= timestamp(`${label} support`, support.supportedAt),
    `${label} required comment is not backed by prior $50 support`);
    assert(!social.reactions.some((row) => row.reactionType === 'support'),
      `${label} has social support reaction`);
    assert(![...social.reactions, ...social.comments].some((row) => row.userId === creator.id),
      `${label} has creator self-engagement`);
  }

  const riverlightSocial = validateAnchorTarget(
    world, riverlight.id, expected.riverlightFundraiser, 'Riverlight fundraiser'
  );
  assert(!riverlightSocial.reactions.some((row) => row.reactionType === 'support'),
    'Riverlight fundraiser has support reaction');
  const mosaicSocial = validateAnchorTarget(
    world, mosaic.id, expected.mosaicFundraiser, 'Mosaic fundraiser'
  );
  assert(!mosaicSocial.reactions.some((row) => row.reactionType === 'support'),
    'Mosaic fundraiser has support reaction');
  assert(lifecycleOf(mosaic) === 'ended'
    && maps.fundraiserProgress.get(mosaic.id).progressPercent === 110,
  'Mosaic ended-success context changed');
  const mosaicEndedSuccess = mosaicSocial.comments.find((row) => (
    classifyCommentBody(row.body, 'fundraiser') === 'fundraiser_ended_success'
  ));
  assert(mosaicEndedSuccess, 'Mosaic fundraiser lacks ended-success comment');
  assert(timestamp('Mosaic ended-success comment', mosaicEndedSuccess.createdAt)
    >= timestamp('Mosaic fundraiser end', easternTimestamp(mosaic.endDate, '23:59:59')),
  'Mosaic ended-success comment predates the Summer Meal Box Fund end date');
}

function validateSocial(world) {
  const maps = socialMaps(world);
  validateReactionCounts(world, maps);
  validateCommentCounts(world, maps);
  validateActiveTargetCounts(world, maps);
  validateReactionRows(world, maps);
  validateCommentRows(world, maps);
  validateAnchors(world, maps);
  return true;
}

module.exports = { validateSocial };
