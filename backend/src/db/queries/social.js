'use strict';

const { query } = require('../pool');
const {
  visibleUserPredicate,
  visibleOpportunityPredicate,
  visibleFundraiserPredicate,
} = require('../visibility');

/*
 * Reactions, comments and saves share one shape: an actor, a target, and the
 * frozen visibility rule. They are collected here so that shape exists once.
 *
 * The three social tables each carry three nullable target columns with a
 * num_nonnulls(...) = 1 constraint. TARGET_COLUMNS is the ONLY place a
 * target type becomes a column name, and callers may pass only its keys —
 * so a target type never reaches SQL as caller-controlled text.
 */
const TARGET_COLUMNS = Object.freeze({
  activities: 'activity_id',
  opportunities: 'opportunity_id',
  fundraisers: 'fundraiser_id',
});

const TARGET_TYPES = Object.freeze(Object.keys(TARGET_COLUMNS));

const REACTION_TYPES = Object.freeze(['like', 'celebrate', 'support']);

function targetColumn(targetType) {
  const column = TARGET_COLUMNS[targetType];
  if (!column) throw new Error(`Unknown social target type: ${targetType}`);
  return column;
}

/*
 * Whether a target exists AND is addressable by this viewer.
 *
 * Each type reuses the visibility rule that already governs it elsewhere —
 * an activity through its author, an opportunity through its host, a
 * fundraiser through its creator — rather than inventing a fourth rule.
 */
async function targetIsVisible(targetType, targetId, sessionId = null) {
  if (targetType === 'activities') {
    const { rows } = await query(
      `SELECT 1
       FROM activities a
       JOIN users u ON u.id = a.user_id
       WHERE a.id = $2 AND ${visibleUserPredicate('u', '$1')}`,
      [sessionId, targetId]
    );
    return rows.length > 0;
  }

  if (targetType === 'opportunities') {
    const { rows } = await query(
      `SELECT 1
       FROM opportunities o
       LEFT JOIN users hu ON hu.id = o.host_user_id
       WHERE o.id = $2 AND ${visibleOpportunityPredicate('o', 'hu', '$1')}`,
      [sessionId, targetId]
    );
    return rows.length > 0;
  }

  const { rows } = await query(
    `SELECT 1
     FROM fundraisers f
     LEFT JOIN users cu ON cu.id = f.creator_user_id
     WHERE f.id = $2 AND ${visibleFundraiserPredicate('f', 'cu', '$1')}`,
    [sessionId, targetId]
  );
  return rows.length > 0;
}

/*
 * Reaction counts per type, plus whether THIS viewer reacted.
 *
 * Counted through users so another visitor's temporary reaction can never
 * appear in this viewer's totals — the same rule participant counts and
 * follower counts use.
 *
 * COUNT(DISTINCT user_id) rather than COUNT(*): the schema has no unique
 * constraint on (user_id, target), so counting distinct people means a
 * duplicate row could never inflate what is displayed.
 */
async function findReactionSummary(targetType, targetId, sessionId = null) {
  const column = targetColumn(targetType);
  const { rows } = await query(
    `SELECT
       r.reaction_type,
       COUNT(DISTINCT r.user_id)::int AS count,
       COALESCE(BOOL_OR(ru.demo_session_id = $1), false) AS viewer_reacted
     FROM reactions r
     JOIN users ru ON ru.id = r.user_id
     WHERE r.${column} = $2 AND ${visibleUserPredicate('ru', '$1')}
     GROUP BY r.reaction_type`,
    [sessionId, targetId]
  );
  return rows;
}

/*
 * This viewer's single reaction on a target, if any.
 *
 * The schema allows at most ONE reaction per (user, target) — enforced by
 * the partial unique indexes uq_reactions_<type>_user — so reaction types
 * are alternatives, not independent toggles.
 */
async function findViewerReaction({ targetType, targetId, userId }) {
  const column = targetColumn(targetType);
  const { rows } = await query(
    `SELECT id, reaction_type FROM reactions WHERE user_id = $1 AND ${column} = $2`,
    [userId, targetId]
  );
  return rows[0] || null;
}

/*
 * Add a reaction, or change an existing one — one atomic statement.
 *
 * The schema's own note on those indexes is explicit: "Changing a reaction
 * updates the existing row rather than inserting another reaction." So this
 * upserts against the partial unique index rather than deleting and
 * re-inserting, which would mint a new row id and reset created_at (the
 * ordering idx_reactions_user_created_at exists to serve).
 *
 * Inferring the partial index requires repeating its WHERE predicate.
 */
async function upsertReaction({ id, userId, targetType, targetId, reactionType }) {
  const column = targetColumn(targetType);
  await query(
    `INSERT INTO reactions (id, user_id, reaction_type, ${column})
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (${column}, user_id) WHERE ${column} IS NOT NULL
     DO UPDATE SET reaction_type = EXCLUDED.reaction_type`,
    [id, userId, reactionType, targetId]
  );
}

// Scoped to the acting user's own reaction: a caller can only ever remove
// their own.
async function deleteReaction({ userId, targetType, targetId }) {
  const column = targetColumn(targetType);
  const { rowCount } = await query(
    `DELETE FROM reactions WHERE user_id = $1 AND ${column} = $2`,
    [userId, targetId]
  );
  return rowCount > 0;
}

/*
 * Comments on a target. Seeded commenters plus the current visitor's own —
 * another visitor's temporary comment is never returned.
 *
 * Newest first, so a visitor sees the comment they just left without having
 * to page to the end, with a stable id tiebreak.
 */
async function findComments(targetType, targetId, sessionId = null, limit = 20) {
  const column = targetColumn(targetType);
  const { rows } = await query(
    `SELECT
       c.id,
       c.body,
       c.created_at,
       u.id AS user_id,
       u.display_name,
       u.avatar_url,
       COUNT(*) OVER()::int AS total_count
     FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.${column} = $2 AND ${visibleUserPredicate('u', '$1')}
     ORDER BY c.created_at DESC, c.id ASC
     LIMIT $3`,
    [sessionId, targetId, limit]
  );
  return rows;
}

async function insertComment({ id, userId, targetType, targetId, body }) {
  const column = targetColumn(targetType);
  await query(
    `INSERT INTO comments (id, user_id, body, ${column}) VALUES ($1, $2, $3, $4)`,
    [id, userId, body, targetId]
  );
}

/*
 * Save is a plain membership relationship keyed by
 * PRIMARY KEY (user_id, opportunity_id), so saving is idempotent through
 * ON CONFLICT and unsaving is a scoped delete. saved_opportunities is
 * opportunity-specific by design; there is no saved-fundraiser equivalent.
 */
async function insertSave({ userId, opportunityId }) {
  await query(
    `INSERT INTO saved_opportunities (user_id, opportunity_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, opportunity_id) DO NOTHING`,
    [userId, opportunityId]
  );
}

async function deleteSave({ userId, opportunityId }) {
  const { rowCount } = await query(
    `DELETE FROM saved_opportunities WHERE user_id = $1 AND opportunity_id = $2`,
    [userId, opportunityId]
  );
  return rowCount > 0;
}

module.exports = {
  TARGET_TYPES,
  REACTION_TYPES,
  targetIsVisible,
  findReactionSummary,
  findViewerReaction,
  upsertReaction,
  deleteReaction,
  findComments,
  insertComment,
  insertSave,
  deleteSave,
};
