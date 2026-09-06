'use strict';

const crypto = require('node:crypto');
const request = require('supertest');

const { createApp } = require('../src/app');
const { query, closePool } = require('../src/db/pool');

const app = createApp();
const sessions = [];

async function newSession() {
  const res = await request(app).post('/api/v1/demo-sessions');
  sessions.push(res.body.sessionId);
  return res.body;
}

const join = (id, sessionId) =>
  request(app).post(`/api/v1/opportunities/${id}/join`).set('X-Kynd-Session-Id', sessionId);
const leave = (id, sessionId) =>
  request(app).delete(`/api/v1/opportunities/${id}/join`).set('X-Kynd-Session-Id', sessionId);
const detail = (id, sessionId) =>
  request(app).get(`/api/v1/opportunities/${id}`).set('X-Kynd-Session-Id', sessionId);
const activity = (sessionId) =>
  request(app).get('/api/v1/activity').set('X-Kynd-Session-Id', sessionId);

describe('Leave opportunity', () => {
  let futureId;
  let pastId;

  beforeAll(async () => {
    const future = await query(
      `SELECT id FROM opportunities
       WHERE status = 'published' AND starts_at > now()
       ORDER BY starts_at ASC LIMIT 1`
    );
    futureId = future.rows[0].id;

    const past = await query(
      `SELECT id FROM opportunities WHERE status = 'published' AND ends_at < now() LIMIT 1`
    );
    pastId = past.rows[0].id;
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

  it('requires a session', async () => {
    const res = await request(app).delete(`/api/v1/opportunities/${futureId}/join`);
    expect(res.status).toBe(401);
  });

  it('cancels the registration without deleting it, and frees the spot', async () => {
    const { sessionId, user } = await newSession();

    const joined = await join(futureId, sessionId);
    expect(joined.status).toBe(200);
    const joinedCount = joined.body.participantCount;

    const res = await leave(futureId, sessionId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      joined: false,
      capacity: joined.body.capacity,
      participantCount: joinedCount - 1,
      availableSpots: joined.body.availableSpots + 1,
    });

    // The row survives as 'cancelled' — no second relationship, no delete.
    const rows = await query(
      `SELECT status, cancelled_at FROM registrations WHERE user_id = $1 AND opportunity_id = $2`,
      [user.id, futureId]
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].status).toBe('cancelled');
    expect(rows.rows[0].cancelled_at).not.toBeNull();
  });

  it('propagates to detail, Upcoming, and the attendee preview', async () => {
    const { sessionId, user } = await newSession();
    await join(futureId, sessionId);

    const before = await detail(futureId, sessionId);
    expect(before.body.opportunity.viewerJoined).toBe(true);
    expect(before.body.opportunity.participants.preview.map((p) => p.id)).toContain(user.id);
    const beforeAvailable = before.body.opportunity.participants.available;

    const beforeActivity = await activity(sessionId);
    expect(beforeActivity.body.upcoming.map((o) => o.id)).toContain(futureId);

    await leave(futureId, sessionId);

    const after = await detail(futureId, sessionId);
    expect(after.body.opportunity.viewerJoined).toBe(false);
    // Gone from "Who's going".
    expect(after.body.opportunity.participants.preview.map((p) => p.id)).not.toContain(user.id);
    expect(after.body.opportunity.participants.available).toBe(beforeAvailable + 1);

    const afterActivity = await activity(sessionId);
    expect(afterActivity.body.upcoming.map((o) => o.id)).not.toContain(futureId);
  });

  it('is idempotent, and safe on an opportunity never joined', async () => {
    const { sessionId, user } = await newSession();

    // Never joined at all.
    const untouched = await leave(futureId, sessionId);
    expect(untouched.status).toBe(200);
    expect(untouched.body.joined).toBe(false);
    const none = await query(`SELECT COUNT(*)::int n FROM registrations WHERE user_id = $1`, [
      user.id,
    ]);
    expect(none.rows[0].n).toBe(0);

    await join(futureId, sessionId);
    const first = await leave(futureId, sessionId);
    const second = await leave(futureId, sessionId);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });

  it('rejoining reactivates the SAME registration row', async () => {
    const { sessionId, user } = await newSession();

    await join(futureId, sessionId);
    const original = await query(
      `SELECT id FROM registrations WHERE user_id = $1 AND opportunity_id = $2`,
      [user.id, futureId]
    );
    const originalId = original.rows[0].id;

    await leave(futureId, sessionId);
    const rejoined = await join(futureId, sessionId);
    expect(rejoined.status).toBe(200);

    const after = await query(
      `SELECT id, status, cancelled_at FROM registrations WHERE user_id = $1 AND opportunity_id = $2`,
      [user.id, futureId]
    );
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0].id).toBe(originalId);
    expect(after.rows[0].status).toBe('joined');
    expect(after.rows[0].cancelled_at).toBeNull();

    const view = await detail(futureId, sessionId);
    expect(view.body.opportunity.viewerJoined).toBe(true);
  });

  it('refuses to leave a participation that already became history', async () => {
    const { sessionId, user } = await newSession();

    // A genuinely ended, joined registration — the only way to reach the
    // normal completion path, since Join only accepts future opportunities.
    await query(
      `INSERT INTO registrations (id, user_id, opportunity_id, status)
       VALUES ($1, $2, $3, 'joined')`,
      [crypto.randomUUID(), user.id, pastId]
    );
    const completed = await request(app)
      .post(`/api/v1/opportunities/${pastId}/complete`)
      .set('X-Kynd-Session-Id', sessionId)
      .send({ hours: 2 });
    expect(completed.status).toBe(200);

    const res = await leave(pastId, sessionId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('opportunity_already_completed');

    // The history and the registration beneath it are both intact.
    const reg = await query(
      `SELECT status FROM registrations WHERE user_id = $1 AND opportunity_id = $2`,
      [user.id, pastId]
    );
    expect(reg.rows[0].status).toBe('joined');
    const acts = await query(`SELECT COUNT(*)::int n FROM activities WHERE user_id = $1`, [user.id]);
    expect(acts.rows[0].n).toBe(1);

    const view = await activity(sessionId);
    expect(view.body.completed.map((a) => a.opportunityId)).toContain(pastId);
  });

  it("another session's participation is unaffected", async () => {
    const a = await newSession();
    const b = await newSession();

    await join(futureId, a.sessionId);
    await join(futureId, b.sessionId);

    const bBefore = await detail(futureId, b.sessionId);
    expect(bBefore.body.opportunity.viewerJoined).toBe(true);

    await leave(futureId, a.sessionId);

    const bAfter = await detail(futureId, b.sessionId);
    expect(bAfter.body.opportunity.viewerJoined).toBe(true);
    // Each visitor only ever sees seeded participants plus themselves, so
    // A's departure cannot move B's count.
    expect(bAfter.body.opportunity.participants.joined).toBe(
      bBefore.body.opportunity.participants.joined
    );

    const bActivity = await activity(b.sessionId);
    expect(bActivity.body.upcoming.map((o) => o.id)).toContain(futureId);
  });

  it('needs no new privilege: registrations keeps UPDATE and no DELETE', async () => {
    const { pool } = require('../src/db/pool');
    const { rows } = await pool.query(
      `SELECT
         has_table_privilege('kynd_app', 'registrations', 'INSERT') AS ins,
         has_table_privilege('kynd_app', 'registrations', 'UPDATE') AS upd,
         has_table_privilege('kynd_app', 'registrations', 'DELETE') AS del`
    );
    expect(rows[0]).toEqual({ ins: true, upd: true, del: false });
  });
});
