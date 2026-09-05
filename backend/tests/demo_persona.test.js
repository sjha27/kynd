'use strict';

const crypto = require('node:crypto');
const request = require('supertest');

const { createApp } = require('../src/app');
const { query, closePool } = require('../src/db/pool');
const demoSessionQueries = require('../src/db/queries/demo_sessions');
const {
  STARTER_CAUSE_IDS,
  STARTER_FOLLOWED_USER_IDS,
  STARTER_FOLLOWED_ORGANIZATION_IDS,
} = require('../src/config/demo_persona');

const FLAGSHIP = 'bc09559d-77de-5bde-b248-00a1480d6d94';
const MAYA = '58243c7d-9b1c-57fd-8e66-ad79f9fe7967';
const RIVERLIGHT = '12437f75-adcd-597c-96ee-94534faed332';

const app = createApp();
const sessions = [];

async function newSession() {
  const res = await request(app).post('/api/v1/demo-sessions');
  sessions.push(res.body.sessionId);
  return res.body; // { sessionId, expiresAt, user: { id, name } }
}

describe('demo persona starter state', () => {
  afterEach(async () => {
    if (sessions.length > 0) {
      await query(`DELETE FROM demo_sessions WHERE id = ANY($1::uuid[])`, [sessions]);
      sessions.length = 0;
    }
  });

  afterAll(async () => {
    await closePool();
  });

  it('creates Frank Enstien with the monogram-fallback conditions', async () => {
    const { user } = await newSession();
    expect(user.name).toBe('Frank Enstien');

    const { rows } = await query(
      `SELECT avatar_url, bio, city, state FROM users WHERE id = $1`,
      [user.id]
    );
    expect(rows[0].avatar_url).toBeNull();
    expect(rows[0].bio).toBeNull();
    expect(rows[0].city).toBe('Atlanta');
    expect(rows[0].state).toBe('GA');
  });

  it('has exactly the 3 starter causes', async () => {
    const { user } = await newSession();
    const { rows } = await query(`SELECT cause_id FROM user_causes WHERE user_id = $1`, [user.id]);
    expect(rows.map((r) => r.cause_id).sort()).toEqual([...STARTER_CAUSE_IDS].sort());
  });

  it('follows exactly the 2 selected users', async () => {
    const { user } = await newSession();
    const { rows } = await query(
      `SELECT followed_user_id FROM user_follows WHERE follower_user_id = $1`,
      [user.id]
    );
    expect(rows.map((r) => r.followed_user_id).sort()).toEqual(
      [...STARTER_FOLLOWED_USER_IDS].sort()
    );
  });

  it('follows exactly the 3 selected organizations', async () => {
    const { user } = await newSession();
    const { rows } = await query(
      `SELECT organization_id FROM organization_follows WHERE user_id = $1`,
      [user.id]
    );
    expect(rows.map((r) => r.organization_id).sort()).toEqual(
      [...STARTER_FOLLOWED_ORGANIZATION_IDS].sort()
    );
  });

  it('creates no activities or registrations', async () => {
    const { user } = await newSession();
    const activities = await query(`SELECT COUNT(*)::int n FROM activities WHERE user_id = $1`, [
      user.id,
    ]);
    const registrations = await query(
      `SELECT COUNT(*)::int n FROM registrations WHERE user_id = $1`,
      [user.id]
    );
    expect(activities.rows[0].n).toBe(0);
    expect(registrations.rows[0].n).toBe(0);
  });

  it('leaves the flagship not joined: 5 joined / 20 available, viewerJoined=false', async () => {
    const { sessionId } = await newSession();
    const res = await request(app)
      .get(`/api/v1/opportunities/${FLAGSHIP}`)
      .set('X-Kynd-Session-Id', sessionId);

    expect(res.body.opportunity.participants.joined).toBe(5);
    expect(res.body.opportunity.participants.available).toBe(20);
    expect(res.body.opportunity.viewerJoined).toBe(false);
  });

  it('Activity → Upcoming is empty', async () => {
    const { sessionId } = await newSession();
    const res = await request(app).get('/api/v1/activity').set('X-Kynd-Session-Id', sessionId);
    expect(res.body.upcoming).toEqual([]);
  });

  it('Maya initially returns viewerFollowing=true', async () => {
    const { sessionId } = await newSession();
    const res = await request(app)
      .get(`/api/v1/users/${MAYA}/profile`)
      .set('X-Kynd-Session-Id', sessionId);
    expect(res.body.profile.viewerFollowing).toBe(true);
  });

  it('Riverlight initially returns viewerFollowing=true', async () => {
    const { sessionId } = await newSession();
    const res = await request(app)
      .get(`/api/v1/organizations/${RIVERLIGHT}`)
      .set('X-Kynd-Session-Id', sessionId);
    expect(res.body.organization.viewerFollowing).toBe(true);
  });

  it("session A's starter follow does not inflate session B beyond B's own starter state", async () => {
    await newSession(); // A
    const b = await newSession();

    const anon = await request(app).get(`/api/v1/users/${MAYA}/profile`);
    const bView = await request(app)
      .get(`/api/v1/users/${MAYA}/profile`)
      .set('X-Kynd-Session-Id', b.sessionId);

    // Both A and B independently follow Maya in the raw database, but B must
    // only ever see the seeded baseline plus its OWN one starter edge.
    expect(bView.body.profile.followerCount).toBe(anon.body.profile.followerCount + 1);
  });

  it('deleting the session cascades away the starter causes and follows', async () => {
    const { sessionId, user } = await newSession();

    await query(`DELETE FROM demo_sessions WHERE id = $1`, [sessionId]);

    const remainingUser = await query(`SELECT 1 FROM users WHERE id = $1`, [user.id]);
    const remainingCauses = await query(`SELECT 1 FROM user_causes WHERE user_id = $1`, [user.id]);
    const remainingFollows = await query(
      `SELECT 1 FROM user_follows WHERE follower_user_id = $1`,
      [user.id]
    );
    const remainingOrgFollows = await query(
      `SELECT 1 FROM organization_follows WHERE user_id = $1`,
      [user.id]
    );

    expect(remainingUser.rowCount).toBe(0);
    expect(remainingCauses.rowCount).toBe(0);
    expect(remainingFollows.rowCount).toBe(0);
    expect(remainingOrgFollows.rowCount).toBe(0);
  });

  it('leaves all 500 seeded users and their relationships unchanged', async () => {
    const seededBefore = await query(`SELECT COUNT(*)::int n FROM users WHERE demo_session_id IS NULL`);
    // The anonymous (seeded-only) read, not a raw unscoped COUNT — other
    // test files may legitimately have their own temporary visitors' starter
    // follows live at the same moment under parallel test execution.
    const anonBefore = await request(app).get(`/api/v1/users/${MAYA}/profile`);

    await newSession();

    const seededAfter = await query(`SELECT COUNT(*)::int n FROM users WHERE demo_session_id IS NULL`);
    expect(seededAfter.rows[0].n).toBe(500);
    expect(seededAfter.rows[0].n).toBe(seededBefore.rows[0].n);

    // Anonymous (seeded-only) follower count must be unaffected by this
    // temporary visitor's starter follow.
    const anonAfter = await request(app).get(`/api/v1/users/${MAYA}/profile`);
    expect(anonAfter.body.profile.followerCount).toBe(anonBefore.body.profile.followerCount);
  });

  it('rolls back the entire session if starter-state creation fails', async () => {
    const sessionId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const bogusCauseId = '00000000-0000-4000-8000-000000000000'; // no such cause row

    await expect(
      demoSessionQueries.createSessionWithUser({
        sessionId,
        userId,
        displayName: 'Frank Enstien',
        city: 'Atlanta',
        state: 'GA',
        causeIds: [bogusCauseId],
        followedUserIds: [],
        followedOrganizationIds: [],
      })
    ).rejects.toThrow();

    const sessionRow = await query(`SELECT 1 FROM demo_sessions WHERE id = $1`, [sessionId]);
    const userRow = await query(`SELECT 1 FROM users WHERE id = $1`, [userId]);
    expect(sessionRow.rowCount).toBe(0);
    expect(userRow.rowCount).toBe(0);
  });
});
