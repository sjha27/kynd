'use strict';

const usersQueries = require('../db/queries/users');
const followsQueries = require('../db/queries/follows');
const activitiesService = require('./activities');
const { NotFoundError } = require('../errors');

/*
 * sessionId scopes visibility (which target is addressable, and which
 * followers are visible); viewerUserId is the acting user's own id, used
 * only to answer "does the viewer follow this profile" — the two are
 * different values (a demo_sessions id vs. a users id) and both are needed.
 */
async function getUserProfile(id, { sessionId = null, viewerUserId = null } = {}) {
  const user = await usersQueries.findUserById(id, sessionId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const [
    causes,
    followerCount,
    followingCount,
    activityMetrics,
    organizationCount,
    amountRaisedCents,
    viewerFollowing,
    activities,
  ] = await Promise.all([
    usersQueries.findUserCauses(id),
    usersQueries.countFollowers(id, sessionId),
    usersQueries.countFollowing(id, sessionId),
    usersQueries.getActivityMetrics(id),
    usersQueries.countProfileOrganizations(id),
    usersQueries.getAmountRaisedCents(id, sessionId),
    viewerUserId ? followsQueries.isFollowingUser(viewerUserId, id) : Promise.resolve(false),
    // Contribution history travels with the profile, so Impact History works
    // for ANY addressable person rather than only for the current visitor.
    activitiesService.listActivitiesForUser(id),
  ]);

  return {
    id: user.id,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    bio: user.bio,
    city: user.city,
    state: user.state,
    causes,
    followerCount,
    followingCount,
    // Derived on the server from the session; the browser must never infer
    // this from follower counts, same rule as viewerJoined.
    viewerFollowing,
    metrics: {
      hours: Number(activityMetrics.hours),
      activities: activityMetrics.activities,
      organizations: organizationCount,
      amountRaisedCents: Number(amountRaisedCents),
    },
    activities,
  };
}

module.exports = { getUserProfile };
