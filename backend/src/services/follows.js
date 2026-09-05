'use strict';

const followsQueries = require('../db/queries/follows');
const usersQueries = require('../db/queries/users');
const organizationsQueries = require('../db/queries/organizations');
const { NotFoundError, ConflictError } = require('../errors');

/*
 * Follow a user. The acting user comes only from the resolved session
 * (never the request body), same rule as Join.
 *
 * Self-follow is checked before the target lookup: it is the one case
 * where a temporary visitor's own id is genuinely "visible" to
 * findUserById (the visibility predicate allows seeded users OR the
 * current session's own user), so without this check a self-follow would
 * reach the database and fail on chk_user_follows_not_self instead of
 * producing a clean product error.
 *
 * After the self-check, any target findUserById resolves is guaranteed
 * seeded: the predicate's only non-seeded match is the caller's own user,
 * which was just excluded. This is what keeps "temporary visitors may only
 * follow seeded users" true without a second, separate check.
 */
async function followUser({ targetUserId, sessionId, userId }) {
  if (targetUserId === userId) {
    throw new ConflictError('You cannot follow yourself.', 'follow_invalid_self');
  }

  const target = await usersQueries.findUserById(targetUserId, sessionId);
  if (!target) {
    // Covers both a genuinely unknown id and another session's temporary
    // user — deliberately indistinguishable, same reasoning as demo-session
    // resolution: no response may reveal that a UUID belongs to someone
    // else's session.
    throw new NotFoundError('User not found');
  }

  await followsQueries.followUser(userId, targetUserId);
  const followerCount = await usersQueries.countFollowers(targetUserId, sessionId);
  return { following: true, followerCount };
}

/*
 * Unfollow is a plain, idempotent DELETE. No existence/visibility check is
 * needed: a follow edge to anyone other than a seeded user (or, via the
 * self-check above, the caller) could never have been created in the first
 * place, so there is nothing unsafe about a no-op delete against any id.
 */
async function unfollowUser({ targetUserId, sessionId, userId }) {
  await followsQueries.unfollowUser(userId, targetUserId);
  const followerCount = await usersQueries.countFollowers(targetUserId, sessionId);
  return { following: false, followerCount };
}

async function followOrganization({ organizationId, sessionId, userId }) {
  const org = await organizationsQueries.findOrganizationById(organizationId);
  if (!org) {
    throw new NotFoundError('Organization not found');
  }

  await followsQueries.followOrganization(userId, organizationId);
  const followerCount = await organizationsQueries.countFollowers(organizationId, sessionId);
  return { following: true, followerCount };
}

async function unfollowOrganization({ organizationId, sessionId, userId }) {
  await followsQueries.unfollowOrganization(userId, organizationId);
  const followerCount = await organizationsQueries.countFollowers(organizationId, sessionId);
  return { following: false, followerCount };
}

module.exports = {
  followUser,
  unfollowUser,
  followOrganization,
  unfollowOrganization,
};
