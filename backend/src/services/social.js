'use strict';

const crypto = require('node:crypto');

const socialQueries = require('../db/queries/social');
const { NotFoundError, ValidationError } = require('../errors');

const { TARGET_TYPES, REACTION_TYPES } = socialQueries;

const MAX_COMMENT_LENGTH = 1000; // matches chk_comments_body_length
const COMMENT_PAGE_SIZE = 20;

function assertTargetType(targetType) {
  if (!TARGET_TYPES.includes(targetType)) {
    throw new NotFoundError('Unknown content type');
  }
}

/*
 * Fundraiser "support" is monetary and lives in fundraiser_supports, so the
 * schema forbids a social `support` reaction on a fundraiser
 * (chk_reactions_no_support_on_fundraiser). Rejecting it here means the rule
 * surfaces as a clear product error rather than a raw constraint violation —
 * and the frontend simply never offers the option.
 */
function assertReactionAllowed(targetType, reactionType) {
  if (!REACTION_TYPES.includes(reactionType)) {
    throw new ValidationError('That reaction type does not exist.');
  }
  if (targetType === 'fundraisers' && reactionType === 'support') {
    throw new ValidationError(
      'Supporting a fundraiser is a contribution, not a reaction. Use Support instead.'
    );
  }
}

function toReactionSummary(rows, targetType) {
  const byType = new Map(rows.map((r) => [r.reaction_type, r]));
  const available = REACTION_TYPES.filter(
    (type) => !(targetType === 'fundraisers' && type === 'support')
  );

  return available.map((type) => ({
    type,
    count: byType.get(type)?.count ?? 0,
    // Derived on the server from the session; never inferred in the browser.
    viewerReacted: byType.get(type)?.viewer_reacted === true,
  }));
}

function toComment(row) {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    author: { id: row.user_id, name: row.display_name, avatarUrl: row.avatar_url },
  };
}

async function assertVisibleTarget(targetType, targetId, sessionId) {
  assertTargetType(targetType);
  const visible = await socialQueries.targetIsVisible(targetType, targetId, sessionId);
  if (!visible) {
    // A target that exists but belongs to another visitor's temporary world
    // is indistinguishable from one that never existed.
    throw new NotFoundError('Content not found');
  }
}

/*
 * Everything the engagement surface needs for one piece of content, in one
 * read: reaction counts, this viewer's reaction state, and the comments.
 *
 * Deliberately a sub-resource rather than being embedded into the
 * opportunity/fundraiser/activity payloads, so no existing read contract
 * changes and one implementation serves all three target types.
 */
async function getEngagement({ targetType, targetId, sessionId = null }) {
  await assertVisibleTarget(targetType, targetId, sessionId);

  const [reactionRows, commentRows] = await Promise.all([
    socialQueries.findReactionSummary(targetType, targetId, sessionId),
    socialQueries.findComments(targetType, targetId, sessionId, COMMENT_PAGE_SIZE),
  ]);

  return {
    reactions: toReactionSummary(reactionRows, targetType),
    comments: commentRows.map(toComment),
    commentCount: commentRows.length > 0 ? commentRows[0].total_count : 0,
  };
}

/*
 * One-tap reaction, following the schema's own model.
 *
 * The partial unique indexes allow at most ONE reaction per (user, target),
 * so the three types are alternatives rather than independent toggles:
 *
 *   no reaction yet        -> add it
 *   same type tapped again -> remove it   (familiar un-react)
 *   different type tapped  -> change it   (the schema's documented "changing
 *                                          a reaction updates the row")
 *
 * The acting user always comes from the resolved session, so a caller can
 * neither react as someone else nor remove someone else's reaction.
 */
async function toggleReaction({ targetType, targetId, sessionId, userId, reactionType }) {
  await assertVisibleTarget(targetType, targetId, sessionId);
  assertReactionAllowed(targetType, reactionType);

  const existing = await socialQueries.findViewerReaction({ targetType, targetId, userId });
  const removing = existing?.reaction_type === reactionType;

  if (removing) {
    await socialQueries.deleteReaction({ targetType, targetId, userId });
  } else {
    await socialQueries.upsertReaction({
      id: crypto.randomUUID(),
      userId,
      targetType,
      targetId,
      reactionType,
    });
  }

  const rows = await socialQueries.findReactionSummary(targetType, targetId, sessionId);
  return { reactions: toReactionSummary(rows, targetType), reacted: !removing };
}

async function addComment({ targetType, targetId, sessionId, userId, body }) {
  await assertVisibleTarget(targetType, targetId, sessionId);

  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) throw new ValidationError('A comment cannot be empty.');
  if (text.length > MAX_COMMENT_LENGTH) {
    throw new ValidationError(`A comment must be ${MAX_COMMENT_LENGTH} characters or fewer.`);
  }

  await socialQueries.insertComment({
    id: crypto.randomUUID(),
    userId,
    targetType,
    targetId,
    body: text,
  });

  const rows = await socialQueries.findComments(targetType, targetId, sessionId, COMMENT_PAGE_SIZE);
  return {
    comments: rows.map(toComment),
    commentCount: rows.length > 0 ? rows[0].total_count : 0,
  };
}

/*
 * Save / unsave an opportunity. Idempotent in both directions: saving twice
 * is one membership row, unsaving something that was never saved is not an
 * error, because in both cases the visitor's intent is already satisfied.
 */
async function saveOpportunity({ opportunityId, sessionId, userId }) {
  await assertVisibleTarget('opportunities', opportunityId, sessionId);
  await socialQueries.insertSave({ userId, opportunityId });
  return { saved: true };
}

async function unsaveOpportunity({ opportunityId, sessionId, userId }) {
  await assertVisibleTarget('opportunities', opportunityId, sessionId);
  await socialQueries.deleteSave({ userId, opportunityId });
  return { saved: false };
}

module.exports = {
  getEngagement,
  toggleReaction,
  addComment,
  saveOpportunity,
  unsaveOpportunity,
  MAX_COMMENT_LENGTH,
};
