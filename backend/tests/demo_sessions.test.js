'use strict';

const request = require('supertest');

const { createApp } = require('../src/app');
const { pool, query, closePool } = require('../src/db/pool');
const demoSessionQueries = require('../src/db/queries/demo_sessions');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

const app = createApp();
const createSession = () => request(app).post('/api/v1/demo-sessions');
const currentSession = (id) => {
  const req = request(app).get('/api/v1/demo-sessions/current');
  return id === undefined ? req : req.set('X-Kynd-Session-Id', id);
};

// Every session this file creates is removed afterwards, so the suite leaves
// the shared Neon baseline exactly as it found it. The users cascade removes
// the temporary users along with them.
const createdSessionIds = [];

async function trackedSession() {
  const res = await createSession();
  if (res.status === 201) createdSessionIds.push(res.body.sessionId);
  return res;
}

describe('demo sessions', () => {
  afterAll(async () => {
    if (createdSessionIds.length > 0) {
      await query(`DELETE FROM demo_sessions WHERE id = ANY($1::uuid[])`, [createdSessionIds]);
    }
    await closePool();
  });

  describe('creation', () => {
    it('creates a session and its temporary user', async () => {
      const res = await trackedSession();

      expect(res.status).toBe(201);
      expect(res.body.sessionId).toMatch(UUID);
      expect(res.body.user.id).toMatch(UUID);
      expect(res.body.user.name).toBe('Frank Enstien');

      // Product-facing shape only — no database bookkeeping leaks out.
      expect(Object.keys(res.body).sort()).toEqual(['expiresAt', 'sessionId', 'user']);
      expect(Object.keys(res.body.user).sort()).toEqual(['id', 'name']);
    });

    it('links exactly one temporary user to the session', async () => {
      const res = await trackedSession();

      const { rows } = await query(
        `SELECT id, display_name, demo_session_id FROM users WHERE demo_session_id = $1`,
        [res.body.sessionId]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(res.body.user.id);
    });

    it('expires approximately 24 hours from now in real time', async () => {
      const before = Date.now();
      const res = await trackedSession();
      const hours = (new Date(res.body.expiresAt).getTime() - before) / 3600000;

      // Real infrastructure time, not the synthetic world reference date.
      expect(hours).toBeGreaterThan(23.9);
      expect(hours).toBeLessThan(24.1);
      expect(new Date(res.body.expiresAt).getFullYear()).toBe(new Date().getFullYear());
    });

    it('generates ids on the backend that the caller cannot influence', async () => {
      const res = await request(app)
        .post('/api/v1/demo-sessions')
        .send({ sessionId: UNKNOWN_UUID, user: { id: UNKNOWN_UUID, name: 'Maya Ellis' } });

      if (res.status === 201) {
        createdSessionIds.push(res.body.sessionId);
        expect(res.body.sessionId).not.toBe(UNKNOWN_UUID);
        expect(res.body.user.id).not.toBe(UNKNOWN_UUID);
        expect(res.body.user.name).toBe('Frank Enstien');
      } else {
        // Rate limited is an acceptable outcome; the assertion above is the point.
        expect(res.status).toBe(429);
      }
    });

    it('does not touch seeded users', async () => {
      const before = await query(`SELECT COUNT(*)::int n FROM users WHERE demo_session_id IS NULL`);
      await trackedSession();
      const after = await query(`SELECT COUNT(*)::int n FROM users WHERE demo_session_id IS NULL`);

      expect(after.rows[0].n).toBe(before.rows[0].n);
      expect(before.rows[0].n).toBe(500);
    });

    it('rolls back the session when temporary-user creation fails', async () => {
      // A duplicate user id forces the second insert to fail after the
      // session row already exists, which is exactly the partial state the
      // transaction must prevent.
      const existing = await query(`SELECT id FROM users LIMIT 1`);
      const sessionId = crypto.randomUUID();

      await expect(
        demoSessionQueries.createSessionWithUser({
          sessionId,
          userId: existing.rows[0].id,
          displayName: 'Kynd Visitor',
          city: 'Atlanta',
          state: 'GA',
        })
      ).rejects.toThrow();

      const orphan = await query(`SELECT 1 FROM demo_sessions WHERE id = $1`, [sessionId]);
      expect(orphan.rowCount).toBe(0);
    });
  });

  describe('resolution', () => {
    it('resolves a valid session to its own temporary user', async () => {
      const created = await trackedSession();
      const res = await currentSession(created.body.sessionId);

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(created.body.sessionId);
      expect(res.body.user.id).toBe(created.body.user.id);
    });

    // Missing, malformed, unknown and expired are deliberately identical so
    // the endpoint cannot be used to probe which session ids exist.
    it.each([
      ['missing header', undefined],
      ['malformed uuid', 'not-a-uuid'],
      ['empty header', ''],
      ['unknown session', UNKNOWN_UUID],
    ])('rejects %s with 401', async (_label, headerValue) => {
      const res = await currentSession(headerValue);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('demo_session_invalid');
    });

    it('rejects an expired session', async () => {
      const sessionId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      // Both rows are created in one statement (a data-modifying CTE), not
      // two separate round trips. This test's session is legitimately
      // already-expired the instant it exists, so with two separate inserts
      // another test file's concurrent, real opportunistic cleanup
      // (deleteExpiredSessions, triggered by any session creation elsewhere)
      // can delete it in the gap between them, and the second insert then
      // fails its foreign key. One atomic statement removes that gap without
      // touching the cleanup behavior itself.
      await query(
        `WITH session AS (
           INSERT INTO demo_sessions (id, created_at, expires_at)
           VALUES ($1, now() - interval '48 hours', now() - interval '24 hours')
           RETURNING id
         )
         INSERT INTO users (id, demo_session_id, display_name, city, state)
         SELECT $2, id, 'Kynd Visitor', 'Atlanta', 'GA' FROM session`,
        [sessionId, userId]
      );

      const res = await currentSession(sessionId);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('demo_session_invalid');

      await query(`DELETE FROM demo_sessions WHERE id = $1`, [sessionId]);
    });
  });

  describe('isolation', () => {
    it('gives two visitors separate sessions and users', async () => {
      const a = await trackedSession();
      const b = await trackedSession();

      expect(a.body.sessionId).not.toBe(b.body.sessionId);
      expect(a.body.user.id).not.toBe(b.body.user.id);

      const resolvedA = await currentSession(a.body.sessionId);
      const resolvedB = await currentSession(b.body.sessionId);

      expect(resolvedA.body.user.id).toBe(a.body.user.id);
      expect(resolvedB.body.user.id).toBe(b.body.user.id);
      expect(resolvedA.body.user.id).not.toBe(resolvedB.body.user.id);
    });
  });

  describe('expired-session cleanup', () => {
    it('removes expired sessions and their users, leaving seeded users intact', async () => {
      const expiredId = crypto.randomUUID();
      const expiredUserId = crypto.randomUUID();
      // Single atomic statement — see the comment on the equivalent insert
      // in the 'resolution' describe block above for why.
      await query(
        `WITH session AS (
           INSERT INTO demo_sessions (id, created_at, expires_at)
           VALUES ($1, now() - interval '48 hours', now() - interval '24 hours')
           RETURNING id
         )
         INSERT INTO users (id, demo_session_id, display_name, city, state)
         SELECT $2, id, 'Kynd Visitor', 'Atlanta', 'GA' FROM session`,
        [expiredId, expiredUserId]
      );

      const live = await trackedSession();
      const seededBefore = await query(
        `SELECT COUNT(*)::int n FROM users WHERE demo_session_id IS NULL`
      );

      await demoSessionQueries.deleteExpiredSessions();

      // Expired session gone, and its user removed by ON DELETE CASCADE.
      expect((await query(`SELECT 1 FROM demo_sessions WHERE id=$1`, [expiredId])).rowCount).toBe(0);
      expect((await query(`SELECT 1 FROM users WHERE id=$1`, [expiredUserId])).rowCount).toBe(0);

      // Unexpired session untouched.
      expect(
        (await query(`SELECT 1 FROM demo_sessions WHERE id=$1`, [live.body.sessionId])).rowCount
      ).toBe(1);

      // Seeded users never participate in cleanup.
      const seededAfter = await query(
        `SELECT COUNT(*)::int n FROM users WHERE demo_session_id IS NULL`
      );
      expect(seededAfter.rows[0].n).toBe(seededBefore.rows[0].n);
      expect(seededAfter.rows[0].n).toBe(500);
    });
  });

  describe('runtime role privileges', () => {
    it('has only the approved session writes plus existing reads', async () => {
      const { rows } = await pool.query(`
        SELECT tablename,
          has_table_privilege(current_user, ('public.'||tablename)::regclass,'INSERT')   AS ins,
          has_table_privilege(current_user, ('public.'||tablename)::regclass,'UPDATE')   AS upd,
          has_table_privilege(current_user, ('public.'||tablename)::regclass,'DELETE')   AS del,
          has_table_privilege(current_user, ('public.'||tablename)::regclass,'TRUNCATE') AS trunc
        FROM pg_tables WHERE schemaname='public'`);

      const writable = {};
      for (const r of rows) {
        const verbs = [r.ins && 'INSERT', r.upd && 'UPDATE', r.del && 'DELETE', r.trunc && 'TRUNCATE']
          .filter(Boolean);
        if (verbs.length) writable[r.tablename] = verbs.sort();
      }

      const isOwner = (await pool.query(`SELECT current_user = 'neondb_owner' AS owner`)).rows[0].owner;
      if (isOwner) {
        // Running against the owner credential locally; the restricted-role
        // boundary is asserted in the branch below and in production.
        expect(Object.keys(writable).length).toBeGreaterThan(0);
        return;
      }

      // The full approved write surface after the starter-persona slice.
      // registrations has INSERT (new join) and UPDATE (reactivate a
      // cancelled one) but deliberately no DELETE or TRUNCATE — Join never
      // removes history. user_follows/organization_follows have INSERT and
      // DELETE only — a follow edge has no status column to reactivate, so
      // Unfollow is a real delete and there is nothing to UPDATE. user_causes
      // has INSERT only — the starter cause rows are created once at session
      // creation and removed only via the user's ON DELETE CASCADE, never
      // updated or deleted directly.
      expect(writable).toEqual({
        demo_sessions: ['DELETE', 'INSERT'],
        registrations: ['INSERT', 'UPDATE'],
        users: ['INSERT'],
        user_follows: ['DELETE', 'INSERT'],
        organization_follows: ['DELETE', 'INSERT'],
        user_causes: ['INSERT'],
      });
    });
  });
});
