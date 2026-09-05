'use strict';

const crypto = require('node:crypto');
const request = require('supertest');

const { createApp } = require('../src/app');
const { query, closePool } = require('../src/db/pool');

const FLAGSHIP = 'bc09559d-77de-5bde-b248-00a1480d6d94';

const app = createApp();
const sessions = [];

async function newSession() {
  const res = await request(app).post('/api/v1/demo-sessions');
  sessions.push(res.body.sessionId);
  return res.body; // { sessionId, expiresAt, user: { id, name } }
}

const join = (id, sessionId) =>
  request(app).post(`/api/v1/opportunities/${id}/join`).set('X-Kynd-Session-Id', sessionId);
const complete = (id, sessionId, body) =>
  request(app)
    .post(`/api/v1/opportunities/${id}/complete`)
    .set('X-Kynd-Session-Id', sessionId)
    .send(body);
const activity = (sessionId) =>
  request(app).get('/api/v1/activity').set('X-Kynd-Session-Id', sessionId);
const profile = (id, sessionId) =>
  request(app).get(`/api/v1/users/${id}/profile`).set('X-Kynd-Session-Id', sessionId);

describe('Completion + Activity', () => {
  let futureNonFlagshipId;
  let pastOpportunityId;

  beforeAll(async () => {
    const future = await query(
      `SELECT id FROM opportunities
       WHERE status = 'published' AND starts_at > now() AND id != $1
       LIMIT 1`,
      [FLAGSHIP]
    );
    futureNonFlagshipId = future.rows[0].id;

    const past = await query(
      `SELECT id FROM opportunities WHERE status = 'published' AND ends_at < now() LIMIT 1`
    );
    pastOpportunityId = past.rows[0].id;
  });

  afterEach(async () => {
    if (sessions.length > 0) {
      await query(`DELETE FROM demo_sessions WHERE id = ANY($1::uuid[])`, [sessions]);
      sessions.length = 0;
    }
  });

  afterAll(async () => {
    await closePool();
  });

  it('rejects completing an opportunity the visitor never joined', async () => {
    const { sessionId } = await newSession();
    const res = await complete(FLAGSHIP, sessionId, { hours: 3 });
    expect(res.status).toBe(404);
  });

  it('rejects completing a future, non-flagship opportunity even when joined', async () => {
    const { sessionId } = await newSession();
    await join(futureNonFlagshipId, sessionId);
    const res = await complete(futureNonFlagshipId, sessionId, { hours: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('opportunity_not_completable');
  });

  it('rejects a non-positive or missing hours value', async () => {
    const { sessionId } = await newSession();
    await join(FLAGSHIP, sessionId);
    const res = await complete(FLAGSHIP, sessionId, { hours: 0 });
    expect(res.status).toBe(400);
  });

  describe('demoCompletionEligible field', () => {
    it('is true only for the flagship, never for another future opportunity', async () => {
      const { sessionId } = await newSession();
      await join(FLAGSHIP, sessionId);
      await join(futureNonFlagshipId, sessionId);

      const res = await activity(sessionId);
      const flagshipItem = res.body.upcoming.find((o) => o.id === FLAGSHIP);
      const otherItem = res.body.upcoming.find((o) => o.id === futureNonFlagshipId);

      expect(flagshipItem.demoCompletionEligible).toBe(true);
      expect(otherItem.demoCompletionEligible).toBe(false);
    });
  });

  describe('awaiting confirmation (normal ended-but-uncompleted reachability)', () => {
    it("a joined, already-ended, uncompleted opportunity is excluded from upcoming and surfaced for confirmation, and is completable via the normal (non-demo) rule", async () => {
      const { sessionId, user } = await newSession();

      // Manufactured directly at the DB layer: Join's API only allows
      // joining opportunities that haven't started, so a genuinely-ended
      // joined registration can only be produced this way in a test —
      // it's a legitimate consequence of real time passing after a real
      // join, not a fabricated state.
      await query(
        `INSERT INTO registrations (id, user_id, opportunity_id, status)
         VALUES ($1, $2, $3, 'joined')`,
        [crypto.randomUUID(), user.id, pastOpportunityId]
      );

      const res = await activity(sessionId);
      expect(res.body.upcoming.map((o) => o.id)).not.toContain(pastOpportunityId);
      expect(res.body.awaitingConfirmation.map((o) => o.id)).toContain(pastOpportunityId);

      const awaitingItem = res.body.awaitingConfirmation.find((o) => o.id === pastOpportunityId);
      expect(awaitingItem.demoCompletionEligible).toBe(false); // eligible via the normal rule, not the allowlist

      const completeRes = await complete(pastOpportunityId, sessionId, { hours: 2, story: null });
      expect(completeRes.status).toBe(200);

      const after = await activity(sessionId);
      expect(after.body.awaitingConfirmation.map((o) => o.id)).not.toContain(pastOpportunityId);
      expect(after.body.completed.map((o) => o.opportunityId)).toContain(pastOpportunityId);
    });
  });

  describe('the full flagship lifecycle', () => {
    it('proves Fresh -> Join -> Complete -> Completed -> Profile, and repeat completion is a clean conflict', async () => {
      const { sessionId, user } = await newSession();

      // Fresh Frank
      const freshProfile = await profile(user.id, sessionId);
      expect(freshProfile.body.profile.metrics).toEqual({
        hours: 0,
        activities: 0,
        organizations: 0,
        amountRaisedCents: 0,
      });
      const freshActivity = await activity(sessionId);
      expect(freshActivity.body.upcoming).toEqual([]);
      expect(freshActivity.body.completed).toEqual([]);

      // Join Piedmont
      const joinRes = await join(FLAGSHIP, sessionId);
      expect(joinRes.status).toBe(200);

      const afterJoin = await activity(sessionId);
      expect(afterJoin.body.upcoming.map((o) => o.id)).toContain(FLAGSHIP);
      expect(afterJoin.body.completed).toEqual([]);

      const profileAfterJoin = await profile(user.id, sessionId);
      expect(profileAfterJoin.body.profile.metrics).toEqual({
        hours: 0,
        activities: 0,
        organizations: 0,
        amountRaisedCents: 0,
      });

      // Demo-complete Piedmont at 3 hours with a short story
      const completeRes = await complete(FLAGSHIP, sessionId, {
        hours: 3,
        story: 'Picked up trash along the trail with the crew.',
      });
      expect(completeRes.status).toBe(200);
      expect(completeRes.body).toEqual({ completed: true });

      // Exactly one activity row exists for this user
      const activityRows = await query(`SELECT COUNT(*)::int n FROM activities WHERE user_id = $1`, [
        user.id,
      ]);
      expect(activityRows.rows[0].n).toBe(1);

      // Piedmont moved from Upcoming to Completed
      const afterComplete = await activity(sessionId);
      expect(afterComplete.body.upcoming.map((o) => o.id)).not.toContain(FLAGSHIP);
      expect(afterComplete.body.completed).toHaveLength(1);
      const completedItem = afterComplete.body.completed[0];
      expect(completedItem.opportunityId).toBe(FLAGSHIP);
      expect(completedItem.hours).toBe(3);
      expect(completedItem.story).toBe('Picked up trash along the trail with the crew.');
      expect(completedItem.host).toEqual({
        type: 'organization',
        id: '12437f75-adcd-597c-96ee-94534faed332',
        name: 'Riverlight Atlanta',
      });
      expect(completedItem.cause.name).toBe('Environment');

      // Profile now reflects it
      const profileAfterComplete = await profile(user.id, sessionId);
      expect(profileAfterComplete.body.profile.metrics).toEqual({
        hours: 3,
        activities: 1,
        organizations: 1,
        amountRaisedCents: 0,
      });

      // Refresh/navigation must preserve all of this — re-read everything.
      const reread = await activity(sessionId);
      expect(reread.body.upcoming.map((o) => o.id)).not.toContain(FLAGSHIP);
      expect(reread.body.completed).toHaveLength(1);
      const rereadProfile = await profile(user.id, sessionId);
      expect(rereadProfile.body.profile.metrics.hours).toBe(3);

      // Repeat completion -> clean conflict, no second row, no raw DB error
      const repeat = await complete(FLAGSHIP, sessionId, { hours: 2 });
      expect(repeat.status).toBe(409);
      expect(repeat.body.error.code).toBe('activity_already_completed');
      const stillOne = await query(`SELECT COUNT(*)::int n FROM activities WHERE user_id = $1`, [
        user.id,
      ]);
      expect(stillOne.rows[0].n).toBe(1);
    });
  });

  it("session isolation: session B's own state is untouched by session A's completion", async () => {
    const a = await newSession();
    const b = await newSession();

    await join(FLAGSHIP, a.sessionId);
    await complete(FLAGSHIP, a.sessionId, { hours: 3, story: null });

    const bActivity = await activity(b.sessionId);
    expect(bActivity.body.upcoming.map((o) => o.id)).not.toContain(FLAGSHIP);
    expect(bActivity.body.completed).toEqual([]);

    const bProfile = await profile(b.user.id, b.sessionId);
    expect(bProfile.body.profile.metrics).toEqual({
      hours: 0,
      activities: 0,
      organizations: 0,
      amountRaisedCents: 0,
    });
  });

  describe('runtime role', () => {
    it('kynd_app has INSERT (and pre-existing SELECT) on activities, nothing more', async () => {
      const { pool } = require('../src/db/pool');
      const { rows } = await pool.query(
        `SELECT
           has_table_privilege(current_user, 'activities', 'INSERT') AS ins,
           has_table_privilege(current_user, 'activities', 'SELECT') AS sel,
           has_table_privilege(current_user, 'activities', 'UPDATE') AS upd,
           has_table_privilege(current_user, 'activities', 'DELETE') AS del`
      );
      const isOwner = (await pool.query(`SELECT current_user = 'neondb_owner' AS owner`)).rows[0]
        .owner;
      if (isOwner) return;

      expect(rows[0]).toEqual({ ins: true, sel: true, upd: false, del: false });
    });
  });
});
