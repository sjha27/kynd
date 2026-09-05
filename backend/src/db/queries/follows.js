'use strict';

const { query } = require('../pool');

/*
 * Follow edges have no status column and nothing to reactivate — the row
 * either exists or it doesn't. ON CONFLICT DO NOTHING makes a repeat Follow
 * a no-op instead of an error; a plain DELETE makes a repeat Unfollow a
 * no-op the same way (0 rows affected, no error either way).
 */

async function isFollowingUser(followerUserId, followedUserId) {
  const { rows } = await query(
    `SELECT EXISTS(
       SELECT 1 FROM user_follows
       WHERE follower_user_id = $1 AND followed_user_id = $2
     ) AS following`,
    [followerUserId, followedUserId]
  );
  return rows[0].following;
}

async function isFollowingOrganization(userId, organizationId) {
  const { rows } = await query(
    `SELECT EXISTS(
       SELECT 1 FROM organization_follows
       WHERE user_id = $1 AND organization_id = $2
     ) AS following`,
    [userId, organizationId]
  );
  return rows[0].following;
}

async function followUser(followerUserId, followedUserId) {
  await query(
    `INSERT INTO user_follows (follower_user_id, followed_user_id)
     VALUES ($1, $2)
     ON CONFLICT (follower_user_id, followed_user_id) DO NOTHING`,
    [followerUserId, followedUserId]
  );
}

async function unfollowUser(followerUserId, followedUserId) {
  await query(
    `DELETE FROM user_follows WHERE follower_user_id = $1 AND followed_user_id = $2`,
    [followerUserId, followedUserId]
  );
}

async function followOrganization(userId, organizationId) {
  await query(
    `INSERT INTO organization_follows (user_id, organization_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, organization_id) DO NOTHING`,
    [userId, organizationId]
  );
}

async function unfollowOrganization(userId, organizationId) {
  await query(
    `DELETE FROM organization_follows WHERE user_id = $1 AND organization_id = $2`,
    [userId, organizationId]
  );
}

module.exports = {
  isFollowingUser,
  isFollowingOrganization,
  followUser,
  unfollowUser,
  followOrganization,
  unfollowOrganization,
};
