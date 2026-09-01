'use strict';

const usersQueries = require('../db/queries/users');
const { NotFoundError } = require('../errors');

async function getUserProfile(id) {
  const user = await usersQueries.findUserById(id);
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
  ] = await Promise.all([
    usersQueries.findUserCauses(id),
    usersQueries.countFollowers(id),
    usersQueries.countFollowing(id),
    usersQueries.getActivityMetrics(id),
    usersQueries.countProfileOrganizations(id),
    usersQueries.getAmountRaisedCents(id),
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
    metrics: {
      hours: Number(activityMetrics.hours),
      activities: activityMetrics.activities,
      organizations: organizationCount,
      amountRaisedCents: Number(amountRaisedCents),
    },
  };
}

module.exports = { getUserProfile };
