'use strict';

const request = require('supertest');

const { createApp } = require('../src/app');
const { query, closePool } = require('../src/db/pool');

const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

const app = createApp();
const sessions = [];

async function newSession() {
  const res = await request(app).post('/api/v1/demo-sessions');
  sessions.push(res.body.sessionId);
  return res.body; // { sessionId, expiresAt, user: { id, name } }
}

async function findIdByName(table, nameColumn, name) {
  const { rows } = await query(`SELECT id FROM ${table} WHERE ${nameColumn} = $1`, [name]);
  if (!rows[0]) {
    throw new Error(`Anchor row not found: ${table}.${nameColumn} = ${name}`);
  }
  return rows[0].id;
}

const userProfile = (id, sessionId) => {
  const req = request(app).get(`/api/v1/users/${id}/profile`);
  return sessionId ? req.set('X-Kynd-Session-Id', sessionId) : req;
};
const organization = (id, sessionId) => {
  const req = request(app).get(`/api/v1/organizations/${id}`);
  return sessionId ? req.set('X-Kynd-Session-Id', sessionId) : req;
};
const followUser = (id, sessionId) => {
  const req = request(app).post(`/api/v1/users/${id}/follow`);
  return sessionId ? req.set('X-Kynd-Session-Id', sessionId) : req;
};
const unfollowUser = (id, sessionId) => {
  const req = request(app).delete(`/api/v1/users/${id}/follow`);
  return sessionId ? req.set('X-Kynd-Session-Id', sessionId) : req;
};
const followOrg = (id, sessionId) => {
  const req = request(app).post(`/api/v1/organizations/${id}/follow`);
  return sessionId ? req.set('X-Kynd-Session-Id', sessionId) : req;
};
const unfollowOrg = (id, sessionId) => {
  const req = request(app).delete(`/api/v1/organizations/${id}/follow`);
  return sessionId ? req.set('X-Kynd-Session-Id', sessionId) : req;
};

describe('social graph — follow/unfollow', () => {
  let mayaId;
  let riverlightId;
  let mayaSeededFollowers;
  let riverlightSeededFollowers;

  beforeAll(async () => {
    mayaId = await findIdByName('users', 'display_name', 'Maya Ellis');
    riverlightId = await findIdByName('organizations', 'name', 'Riverlight Atlanta');

    const anon = await userProfile(mayaId);
    mayaSeededFollowers = anon.body.profile.followerCount;

    const anonOrg = await organization(riverlightId);
    riverlightSeededFollowers = anonOrg.body.organization.followerCount;
  });

  // Cleaned after every test, not just at the end: several tests assert
  // against a fixed seeded baseline, so a prior test's session (and its
  // follow edges) must not still exist when the next one starts. Deleting
  // demo_sessions cascades away the temporary user and their follow edges,
  // restoring the seeded world exactly like Join's cleanup does for
  // registrations.
  afterEach(async () => {
    if (sessions.length > 0) {
      await query(`DELETE FROM demo_sessions WHERE id = ANY($1::uuid[])`, [sessions]);
      sessions.length = 0;
    }
  });

  afterAll(async () => {
    await closePool();
  });

  describe('scenario 1-2: user follow isolation (Maya)', () => {
    it('A follows Maya: A sees N+1/Following, B sees N/Follow, anonymous sees N', async () => {
      const a = await newSession();
      const b = await newSession();

      const before = await userProfile(mayaId, a.sessionId);
      expect(before.body.profile.followerCount).toBe(mayaSeededFollowers);
      expect(before.body.profile.viewerFollowing).toBe(false);

      const res = await followUser(mayaId, a.sessionId);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        following: true,
        followerCount: mayaSeededFollowers + 1,
      });

      const aView = await userProfile(mayaId, a.sessionId);
      expect(aView.body.profile.followerCount).toBe(mayaSeededFollowers + 1);
      expect(aView.body.profile.viewerFollowing).toBe(true);

      const bView = await userProfile(mayaId, b.sessionId);
      expect(bView.body.profile.followerCount).toBe(mayaSeededFollowers);
      expect(bView.body.profile.viewerFollowing).toBe(false);

      const anonView = await userProfile(mayaId);
      expect(anonView.body.profile.followerCount).toBe(mayaSeededFollowers);
      expect(anonView.body.profile.viewerFollowing).toBe(false);
    });

    it('B also follows Maya: B sees N+1, A still N+1, neither sees N+2', async () => {
      const a = await newSession();
      const b = await newSession();

      await followUser(mayaId, a.sessionId);
      const bRes = await followUser(mayaId, b.sessionId);

      expect(bRes.body.followerCount).toBe(mayaSeededFollowers + 1);

      const aView = await userProfile(mayaId, a.sessionId);
      expect(aView.body.profile.followerCount).toBe(mayaSeededFollowers + 1);

      const bView = await userProfile(mayaId, b.sessionId);
      expect(bView.body.profile.followerCount).toBe(mayaSeededFollowers + 1);

      const raw = await query(
        `SELECT COUNT(*)::int AS count FROM user_follows WHERE followed_user_id = $1`,
        [mayaId]
      );
      expect(raw.rows[0].count).toBe(mayaSeededFollowers + 2);
    });
  });

  describe('scenario 3: organization follow isolation (Riverlight)', () => {
    it('mirrors the user isolation scenario for an organization', async () => {
      const a = await newSession();
      const b = await newSession();

      const beforeA = await organization(riverlightId, a.sessionId);
      expect(beforeA.body.organization.followerCount).toBe(riverlightSeededFollowers);
      expect(beforeA.body.organization.viewerFollowing).toBe(false);

      const aRes = await followOrg(riverlightId, a.sessionId);
      expect(aRes.body).toEqual({
        following: true,
        followerCount: riverlightSeededFollowers + 1,
      });

      const bView = await organization(riverlightId, b.sessionId);
      expect(bView.body.organization.followerCount).toBe(riverlightSeededFollowers);
      expect(bView.body.organization.viewerFollowing).toBe(false);

      const bRes = await followOrg(riverlightId, b.sessionId);
      expect(bRes.body.followerCount).toBe(riverlightSeededFollowers + 1);

      const aView = await organization(riverlightId, a.sessionId);
      expect(aView.body.organization.followerCount).toBe(riverlightSeededFollowers + 1);
      expect(aView.body.organization.viewerFollowing).toBe(true);

      const raw = await query(
        `SELECT COUNT(*)::int AS count FROM organization_follows WHERE organization_id = $1`,
        [riverlightId]
      );
      expect(raw.rows[0].count).toBe(riverlightSeededFollowers + 2);
    });
  });

  describe('scenario 4-5: target-user visibility', () => {
    it("returns 404 for another session's temporary user, to both a session and anonymous", async () => {
      const a = await newSession();
      const b = await newSession();

      const anonRes = await userProfile(b.user.id);
      expect(anonRes.status).toBe(404);

      const aRes = await userProfile(b.user.id, a.sessionId);
      expect(aRes.status).toBe(404);
    });

    it("a session may retrieve its own temporary user's profile", async () => {
      const a = await newSession();
      const res = await userProfile(a.user.id, a.sessionId);
      expect(res.status).toBe(200);
      expect(res.body.profile.id).toBe(a.user.id);
    });

    it("cannot follow another temporary visitor even with its real UUID", async () => {
      const a = await newSession();
      const b = await newSession();

      const res = await followUser(b.user.id, a.sessionId);
      expect(res.status).toBe(404);

      // No edge was created despite a resolvable, real UUID being supplied.
      const raw = await query(
        `SELECT COUNT(*)::int AS count FROM user_follows WHERE follower_user_id = $1 AND followed_user_id = $2`,
        [a.user.id, b.user.id]
      );
      expect(raw.rows[0].count).toBe(0);
    });

    it('an unknown uuid also returns 404, indistinguishable from a foreign temp user', async () => {
      const a = await newSession();
      const res = await followUser(UNKNOWN_UUID, a.sessionId);
      expect(res.status).toBe(404);
    });
  });

  describe('scenario 6: self-follow', () => {
    it("returns a clean conflict for the visitor's own id", async () => {
      const a = await newSession();
      const res = await followUser(a.user.id, a.sessionId);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('follow_invalid_self');

      const raw = await query(
        `SELECT COUNT(*)::int AS count FROM user_follows WHERE follower_user_id = $1 AND followed_user_id = $1`,
        [a.user.id]
      );
      expect(raw.rows[0].count).toBe(0);
    });
  });

  describe('scenario 7: authoritative response contract', () => {
    it('Follow and Unfollow both return following + viewer-visible followerCount, no second GET required', async () => {
      const a = await newSession();

      const followRes = await followUser(mayaId, a.sessionId);
      expect(followRes.body).toEqual({
        following: true,
        followerCount: mayaSeededFollowers + 1,
      });

      const unfollowRes = await unfollowUser(mayaId, a.sessionId);
      expect(unfollowRes.body).toEqual({
        following: false,
        followerCount: mayaSeededFollowers,
      });
    });
  });

  describe('scenario 8: idempotency', () => {
    it('repeated Follow is idempotent', async () => {
      const a = await newSession();

      const first = await followUser(mayaId, a.sessionId);
      const second = await followUser(mayaId, a.sessionId);

      expect(first.body).toEqual({ following: true, followerCount: mayaSeededFollowers + 1 });
      expect(second.body).toEqual({ following: true, followerCount: mayaSeededFollowers + 1 });

      const raw = await query(
        `SELECT COUNT(*)::int AS count FROM user_follows WHERE follower_user_id = $1 AND followed_user_id = $2`,
        [a.user.id, mayaId]
      );
      expect(raw.rows[0].count).toBe(1);
    });

    it('repeated Unfollow of a user is idempotent', async () => {
      const a = await newSession();
      await followUser(mayaId, a.sessionId);

      const first = await unfollowUser(mayaId, a.sessionId);
      const second = await unfollowUser(mayaId, a.sessionId);

      expect(first.body).toEqual({ following: false, followerCount: mayaSeededFollowers });
      expect(second.body).toEqual({ following: false, followerCount: mayaSeededFollowers });
    });

    it('repeated Follow/Unfollow of an organization is idempotent', async () => {
      const a = await newSession();

      const first = await followOrg(riverlightId, a.sessionId);
      const second = await followOrg(riverlightId, a.sessionId);
      expect(first.body).toEqual(second.body);

      const firstOff = await unfollowOrg(riverlightId, a.sessionId);
      const secondOff = await unfollowOrg(riverlightId, a.sessionId);
      expect(firstOff.body).toEqual({ following: false, followerCount: riverlightSeededFollowers });
      expect(secondOff.body).toEqual({ following: false, followerCount: riverlightSeededFollowers });
    });
  });

  describe('session requirements', () => {
    it('rejects follow/unfollow without a session', async () => {
      const res = await followUser(mayaId);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('demo_session_invalid');
    });

    it('rejects malformed target ids', async () => {
      const a = await newSession();
      const res = await request(app)
        .post('/api/v1/users/not-a-uuid/follow')
        .set('X-Kynd-Session-Id', a.sessionId);
      expect(res.status).toBe(400);
    });
  });
});
