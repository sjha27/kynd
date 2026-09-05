'use strict';

const request = require('supertest');

const { createApp } = require('../src/app');
const { query, closePool } = require('../src/db/pool');

const FLAGSHIP = 'bc09559d-77de-5bde-b248-00a1480d6d94';
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

const app = createApp();
const sessions = [];

async function newSession() {
  const res = await request(app).post('/api/v1/demo-sessions');
  sessions.push(res.body.sessionId);
  return res.body;
}

const detail = (id, sessionId) => {
  const req = request(app).get(`/api/v1/opportunities/${id}`);
  return sessionId ? req.set('X-Kynd-Session-Id', sessionId) : req;
};
const join = (id, sessionId) => {
  const req = request(app).post(`/api/v1/opportunities/${id}/join`);
  return sessionId ? req.set('X-Kynd-Session-Id', sessionId) : req;
};
const activity = (sessionId) => {
  const req = request(app).get('/api/v1/activity');
  return sessionId ? req.set('X-Kynd-Session-Id', sessionId) : req;
};

describe('join + activity', () => {
  afterAll(async () => {
    // Deleting the sessions cascades away their temporary users, and those
    // users' registrations cascade in turn, so the seeded world is restored.
    if (sessions.length > 0) {
      await query(`DELETE FROM demo_sessions WHERE id = ANY($1::uuid[])`, [sessions]);
    }
    await closePool();
  });

  describe('join success', () => {
    it('creates a registration and returns updated visible state', async () => {
      const { sessionId } = await newSession();

      const before = await detail(FLAGSHIP, sessionId);
      expect(before.body.opportunity.participants.joined).toBe(5);
      expect(before.body.opportunity.participants.available).toBe(20);
      expect(before.body.opportunity.viewerJoined).toBe(false);

      const res = await join(FLAGSHIP, sessionId);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        joined: true,
        capacity: 25,
        participantCount: 6,
        availableSpots: 19,
      });

      const after = await detail(FLAGSHIP, sessionId);
      expect(after.body.opportunity.participants.joined).toBe(6);
      expect(after.body.opportunity.participants.available).toBe(19);
      expect(after.body.opportunity.viewerJoined).toBe(true);
    });

    it('includes the visitor in the attendee preview alongside seeded people', async () => {
      const { sessionId } = await newSession();
      await join(FLAGSHIP, sessionId);

      const names = (await detail(FLAGSHIP, sessionId)).body.opportunity.participants.preview
        .map((p) => p.name);
      expect(names).toContain('Maya Ellis');
      expect(names).toContain('Kynd Visitor');
    });
  });

  describe('idempotency', () => {
    it('joining repeatedly leaves exactly one registration and does not double count', async () => {
      const { sessionId, user } = await newSession();

      const first = await join(FLAGSHIP, sessionId);
      const second = await join(FLAGSHIP, sessionId);
      const third = await join(FLAGSHIP, sessionId);

      expect(first.body.participantCount).toBe(6);
      expect(second.status).toBe(200);
      expect(second.body.participantCount).toBe(6);
      expect(third.body.participantCount).toBe(6);

      const rows = await query(
        `SELECT status FROM registrations WHERE user_id = $1 AND opportunity_id = $2`,
        [user.id, FLAGSHIP]
      );
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0].status).toBe('joined');
    });

    it('survives concurrent joins from the same session', async () => {
      const { sessionId, user } = await newSession();

      const results = await Promise.all([
        join(FLAGSHIP, sessionId),
        join(FLAGSHIP, sessionId),
        join(FLAGSHIP, sessionId),
      ]);
      for (const res of results) {
        expect([200, 409]).toContain(res.status);
      }

      const rows = await query(
        `SELECT COUNT(*)::int n FROM registrations WHERE user_id = $1 AND opportunity_id = $2`,
        [user.id, FLAGSHIP]
      );
      expect(rows.rows[0].n).toBe(1);
      expect((await detail(FLAGSHIP, sessionId)).body.opportunity.participants.joined).toBe(6);
    });
  });

  describe('reactivation of a cancelled registration', () => {
    it('reuses the same relationship instead of inserting a duplicate', async () => {
      const { sessionId, user } = await newSession();

      // Seed a cancelled registration directly; there is no Leave UI in this
      // slice, and this is the state UPDATE permission exists for.
      await query(
        `INSERT INTO registrations (id, user_id, opportunity_id, status, joined_at, cancelled_at)
         VALUES ($1, $2, $3, 'cancelled', now() - interval '2 days', now() - interval '1 day')`,
        [crypto.randomUUID(), user.id, FLAGSHIP]
      );

      const before = await detail(FLAGSHIP, sessionId);
      expect(before.body.opportunity.participants.joined).toBe(5); // cancelled doesn't count
      expect(before.body.opportunity.viewerJoined).toBe(false);

      const original = await query(
        `SELECT id FROM registrations WHERE user_id = $1 AND opportunity_id = $2`,
        [user.id, FLAGSHIP]
      );

      const res = await join(FLAGSHIP, sessionId);
      expect(res.status).toBe(200);
      expect(res.body.participantCount).toBe(6);

      const after = await query(
        `SELECT id, status, cancelled_at FROM registrations
         WHERE user_id = $1 AND opportunity_id = $2`,
        [user.id, FLAGSHIP]
      );
      expect(after.rowCount).toBe(1);
      expect(after.rows[0].id).toBe(original.rows[0].id); // same relationship
      expect(after.rows[0].status).toBe('joined');
      expect(after.rows[0].cancelled_at).toBeNull();
    });
  });

  describe('capacity', () => {
    it('returns 409 opportunity_full and creates no registration', async () => {
      // Find an upcoming opportunity whose seeded joined count already equals
      // capacity, rather than mutating the flagship.
      const full = await query(
        `SELECT o.id, o.capacity FROM opportunities o
         WHERE o.status = 'published' AND o.starts_at > now()
           AND (SELECT COUNT(*) FROM registrations r
                JOIN users u ON u.id = r.user_id
                WHERE r.opportunity_id = o.id AND r.status='joined'
                  AND u.demo_session_id IS NULL) >= o.capacity
         LIMIT 1`
      );

      if (full.rowCount === 0) {
        // No naturally-full upcoming opportunity in the seeded world.
        return;
      }

      const { sessionId, user } = await newSession();
      const res = await join(full.rows[0].id, sessionId);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('opportunity_full');

      const created = await query(
        `SELECT 1 FROM registrations WHERE user_id = $1 AND opportunity_id = $2`,
        [user.id, full.rows[0].id]
      );
      expect(created.rowCount).toBe(0);
    });
  });

  describe('rejected joins', () => {
    it.each([
      ['missing session', undefined, 401],
      ['malformed session', 'not-a-uuid', 401],
      ['unknown session', UNKNOWN_UUID, 401],
    ])('rejects %s', async (_l, sessionId, expected) => {
      const res = await join(FLAGSHIP, sessionId);
      expect(res.status).toBe(expected);
    });

    it('rejects a malformed opportunity id', async () => {
      const { sessionId } = await newSession();
      const res = await join('not-a-uuid', sessionId);
      expect(res.status).toBe(400);
    });

    it('returns 404 for an unknown opportunity', async () => {
      const { sessionId } = await newSession();
      const res = await join(UNKNOWN_UUID, sessionId);
      expect(res.status).toBe(404);
    });

    it('refuses a past opportunity', async () => {
      const past = await query(
        `SELECT id FROM opportunities WHERE status='published' AND starts_at < now() LIMIT 1`
      );
      const { sessionId } = await newSession();
      const res = await join(past.rows[0].id, sessionId);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('opportunity_not_joinable');
    });

    it('refuses a cancelled opportunity', async () => {
      const cancelled = await query(
        `SELECT id FROM opportunities WHERE status='cancelled' AND starts_at > now() LIMIT 1`
      );
      if (cancelled.rowCount === 0) return;

      const { sessionId } = await newSession();
      const res = await join(cancelled.rows[0].id, sessionId);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('opportunity_not_joinable');
    });
  });

  /*
   * The core acceptance criterion: two visitors joining the same opportunity
   * must each see 6/19, never 7/18.
   */
  describe('session isolation', () => {
    it('keeps each visitor in their own visible world', async () => {
      const a = await newSession();
      const b = await newSession();

      const seen = async (s) => {
        const o = (await detail(FLAGSHIP, s)).body.opportunity;
        return `${o.participants.joined}/${o.participants.available}`;
      };

      expect(await seen(a.sessionId)).toBe('5/20');
      expect(await seen(b.sessionId)).toBe('5/20');

      await join(FLAGSHIP, a.sessionId);

      expect(await seen(a.sessionId)).toBe('6/19');
      expect(await seen(b.sessionId)).toBe('5/20'); // A is invisible to B
      expect((await detail(FLAGSHIP, b.sessionId)).body.opportunity.viewerJoined).toBe(false);

      await join(FLAGSHIP, b.sessionId);

      // Both joined; neither sees the other.
      expect(await seen(a.sessionId)).toBe('6/19');
      expect(await seen(b.sessionId)).toBe('6/19');

      // The raw table really does hold both temporary registrations.
      const raw = await query(
        `SELECT COUNT(*)::int n FROM registrations WHERE opportunity_id=$1 AND status='joined'`,
        [FLAGSHIP]
      );
      expect(raw.rows[0].n).toBeGreaterThanOrEqual(7);
    });

    it("never leaks another visitor into the attendee preview", async () => {
      const a = await newSession();
      const b = await newSession();
      await join(FLAGSHIP, a.sessionId);

      const bPreview = (await detail(FLAGSHIP, b.sessionId)).body.opportunity.participants.preview;
      expect(bPreview.map((p) => p.id)).not.toContain(a.user.id);
      expect(bPreview.every((p) => p.name !== 'Kynd Visitor')).toBe(true);
    });

    it('scopes list results the same way as detail', async () => {
      const a = await newSession();
      await join(FLAGSHIP, a.sessionId);

      const anon = await request(app).get('/api/v1/opportunities?q=Piedmont%20Park&limit=5');
      const withA = await request(app)
        .get('/api/v1/opportunities?q=Piedmont%20Park&limit=5')
        .set('X-Kynd-Session-Id', a.sessionId);

      const pick = (res) => res.body.opportunities.find((o) => o.id === FLAGSHIP);
      if (pick(anon)) {
        expect(pick(anon).participants.joined).toBe(5);
        expect(pick(withA).participants.joined).toBe(6);
      }
    });
  });

  describe('anonymous reads', () => {
    it('shows the seeded world when no session header is sent', async () => {
      const a = await newSession();
      await join(FLAGSHIP, a.sessionId);

      const res = await detail(FLAGSHIP);
      expect(res.status).toBe(200);
      expect(res.body.opportunity.participants.joined).toBe(5);
      expect(res.body.opportunity.participants.available).toBe(20);
      expect(res.body.opportunity.viewerJoined).toBe(false);
    });

    // A stale header must fail loudly rather than silently downgrading to
    // anonymous, which would show a joined visitor 5/20 and look like data loss.
    it('rejects an invalid session header instead of treating it as anonymous', async () => {
      const res = await detail(FLAGSHIP, UNKNOWN_UUID);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('demo_session_invalid');
    });
  });

  describe('activity / upcoming', () => {
    it('is empty before joining anything', async () => {
      const { sessionId } = await newSession();
      const res = await activity(sessionId);

      expect(res.status).toBe(200);
      expect(res.body.upcoming).toEqual([]);
    });

    it('contains the joined opportunity afterwards', async () => {
      const { sessionId } = await newSession();
      await join(FLAGSHIP, sessionId);

      const res = await activity(sessionId);
      expect(res.body.upcoming).toHaveLength(1);
      expect(res.body.upcoming[0].id).toBe(FLAGSHIP);
      expect(res.body.upcoming[0].title).toBe('Piedmont Park Community Cleanup');
      expect(res.body.upcoming[0].host.name).toBe('Riverlight Atlanta');
      expect(res.body.upcoming[0].viewerJoined).toBe(true);
    });

    it("does not show one visitor's plans to another", async () => {
      const a = await newSession();
      const b = await newSession();
      await join(FLAGSHIP, a.sessionId);

      expect((await activity(a.sessionId)).body.upcoming).toHaveLength(1);
      expect((await activity(b.sessionId)).body.upcoming).toEqual([]);
    });

    it('excludes cancelled registrations', async () => {
      const { sessionId, user } = await newSession();
      await query(
        `INSERT INTO registrations (id, user_id, opportunity_id, status, joined_at, cancelled_at)
         VALUES ($1, $2, $3, 'cancelled', now() - interval '2 days', now() - interval '1 day')`,
        [crypto.randomUUID(), user.id, FLAGSHIP]
      );

      expect((await activity(sessionId)).body.upcoming).toEqual([]);
    });

    it('requires a session', async () => {
      expect((await activity()).status).toBe(401);
      expect((await activity(UNKNOWN_UUID)).status).toBe(401);
    });
  });

  describe('seeded world invariants', () => {
    it('leaves Maya joined and seeded registrations untouched', async () => {
      const { sessionId } = await newSession();
      await join(FLAGSHIP, sessionId);

      const seeded = await query(
        `SELECT COUNT(*)::int n FROM registrations r
         JOIN users u ON u.id = r.user_id
         WHERE r.opportunity_id = $1 AND r.status = 'joined' AND u.demo_session_id IS NULL`,
        [FLAGSHIP]
      );
      expect(seeded.rows[0].n).toBe(5);

      const maya = await query(
        `SELECT r.status FROM registrations r
         JOIN users u ON u.id = r.user_id
         WHERE r.opportunity_id = $1 AND u.display_name = 'Maya Ellis'`,
        [FLAGSHIP]
      );
      expect(maya.rows[0].status).toBe('joined');

      const seededUsers = await query(
        `SELECT COUNT(*)::int n FROM users WHERE demo_session_id IS NULL`
      );
      expect(seededUsers.rows[0].n).toBe(500);
    });
  });
});
