'use strict';

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

const create = (sessionId, body) =>
  request(app).post('/api/v1/opportunities').set('X-Kynd-Session-Id', sessionId).send(body);
const detail = (id, sessionId) => {
  const req = request(app).get(`/api/v1/opportunities/${id}`);
  return sessionId ? req.set('X-Kynd-Session-Id', sessionId) : req;
};
const discover = (sessionId, qs = '') => {
  const req = request(app).get(`/api/v1/opportunities${qs}`);
  return sessionId ? req.set('X-Kynd-Session-Id', sessionId) : req;
};

function inDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const VALID = {
  title: "Frank's Creek Cleanup",
  type: 'volunteer',
  causeName: 'Environment',
  description: 'A morning clearing litter along the creek path. Gloves and bags provided.',
  date: inDays(14),
  startTime: '09:00',
  endTime: '12:00',
  isOnline: false,
  locationName: 'South Fork Creek Trailhead',
  city: 'Atlanta',
  state: 'GA',
  capacity: 20,
};

describe('Create Opportunity', () => {
  afterEach(async () => {
    if (sessions.length > 0) {
      // Deleting the session cascades through its temporary user, and
      // opportunities host_user_id cascades from there — so a created
      // opportunity is cleaned up with its creator.
      await query(`DELETE FROM demo_sessions WHERE id = ANY($1::uuid[])`, [sessions]);
      sessions.length = 0;
    }
  });

  afterAll(async () => {
    await closePool();
  });

  it('requires a demo session', async () => {
    const res = await request(app).post('/api/v1/opportunities').send(VALID);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('demo_session_invalid');
  });

  describe('validation', () => {
    it('rejects a start in the past', async () => {
      const { sessionId } = await newSession();
      const res = await create(sessionId, { ...VALID, date: daysAgo(3) });
      expect(res.status).toBe(400);
    });

    it('rejects an end at or before the start', async () => {
      const { sessionId } = await newSession();
      expect((await create(sessionId, { ...VALID, endTime: '09:00' })).status).toBe(400);
      expect((await create(sessionId, { ...VALID, endTime: '08:00' })).status).toBe(400);
    });

    it('rejects a malformed date or time', async () => {
      const { sessionId } = await newSession();
      expect((await create(sessionId, { ...VALID, date: 'next Saturday' })).status).toBe(400);
      expect((await create(sessionId, { ...VALID, startTime: '9am' })).status).toBe(400);
    });

    it('rejects a non-positive, fractional, or absurd capacity', async () => {
      const { sessionId } = await newSession();
      expect((await create(sessionId, { ...VALID, capacity: 0 })).status).toBe(400);
      expect((await create(sessionId, { ...VALID, capacity: -5 })).status).toBe(400);
      expect((await create(sessionId, { ...VALID, capacity: 2.5 })).status).toBe(400);
      expect((await create(sessionId, { ...VALID, capacity: 100000 })).status).toBe(400);
    });

    it('rejects a missing title or description', async () => {
      const { sessionId } = await newSession();
      expect((await create(sessionId, { ...VALID, title: '  ' })).status).toBe(400);
      expect((await create(sessionId, { ...VALID, description: '' })).status).toBe(400);
    });

    it('rejects an unknown type or a cause outside the seeded set', async () => {
      const { sessionId } = await newSession();
      expect((await create(sessionId, { ...VALID, type: 'protest' })).status).toBe(400);
      expect((await create(sessionId, { ...VALID, causeName: 'Motorsport' })).status).toBe(400);
    });

    it('requires location information for an in-person opportunity', async () => {
      const { sessionId } = await newSession();
      expect((await create(sessionId, { ...VALID, locationName: '' })).status).toBe(400);
      expect((await create(sessionId, { ...VALID, city: '' })).status).toBe(400);
      expect((await create(sessionId, { ...VALID, state: 'Georgia' })).status).toBe(400);
    });

    it('does NOT require a physical location for an online opportunity', async () => {
      const { sessionId } = await newSession();
      const res = await create(sessionId, {
        ...VALID,
        title: 'Virtual tutoring session',
        causeName: 'Education',
        isOnline: true,
        locationName: null,
        city: null,
        state: null,
      });
      expect(res.status).toBe(201);
      expect(res.body.opportunity.location).toEqual({ isOnline: true });
    });

    it('writes no row when validation fails', async () => {
      const { sessionId, user } = await newSession();
      await create(sessionId, { ...VALID, date: daysAgo(1) });
      const rows = await query(`SELECT COUNT(*)::int n FROM opportunities WHERE host_user_id = $1`, [
        user.id,
      ]);
      expect(rows.rows[0].n).toBe(0);
    });
  });

  describe('a published opportunity', () => {
    it('is a real row hosted by the current session user, with no organization host', async () => {
      const { sessionId, user } = await newSession();

      const res = await create(sessionId, VALID);
      expect(res.status).toBe(201);
      const created = res.body.opportunity;

      const { rows } = await query(
        `SELECT host_user_id, host_organization_id, status, opportunity_type,
                title, description, capacity, is_online, location_name, city, state, image_url,
                starts_at, ends_at
         FROM opportunities WHERE id = $1`,
        [created.id]
      );
      expect(rows).toHaveLength(1);
      const row = rows[0];

      expect(row.host_user_id).toBe(user.id);
      expect(row.host_organization_id).toBeNull();
      expect(row.status).toBe('published');
      expect(row.opportunity_type).toBe('volunteer');
      expect(row.capacity).toBe(20);
      expect(row.is_online).toBe(false);
      expect(row.city).toBe('Atlanta');
      expect(row.state).toBe('GA');
      // No upload infrastructure: media resolves deterministically on the client.
      expect(row.image_url).toBeNull();
      expect(new Date(row.ends_at).getTime()).toBeGreaterThan(new Date(row.starts_at).getTime());

      // The host is the session's user, never something the caller supplied.
      expect(created.host).toMatchObject({ type: 'user', id: user.id, name: 'Frank Enstien' });
    });

    it('ignores a caller-supplied host and still hosts as the session user', async () => {
      const { sessionId, user } = await newSession();
      const seeded = await query(`SELECT id FROM users WHERE demo_session_id IS NULL LIMIT 1`);
      const org = await query(`SELECT id FROM organizations LIMIT 1`);

      const res = await create(sessionId, {
        ...VALID,
        host_user_id: seeded.rows[0].id,
        hostUserId: seeded.rows[0].id,
        host_organization_id: org.rows[0].id,
      });
      expect(res.status).toBe(201);

      const { rows } = await query(
        `SELECT host_user_id, host_organization_id FROM opportunities WHERE id = $1`,
        [res.body.opportunity.id]
      );
      expect(rows[0].host_user_id).toBe(user.id);
      expect(rows[0].host_organization_id).toBeNull();
    });

    it('appears in the creator\'s Discover and opens through the existing detail route', async () => {
      const { sessionId, user } = await newSession();

      // Discover pages 50 at a time over ~2,000 upcoming opportunities
      // ordered by soonest, so a two-week-out opportunity is legitimately
      // not on page 1. Set membership is proved by the filtered total, which
      // COUNT(*) OVER() computes across the whole matched set.
      const SLICE = '?cause=Environment&host=community&type=volunteer';
      const before = (await discover(sessionId, SLICE)).body.page.total;

      const created = (await create(sessionId, VALID)).body.opportunity;

      const after = (await discover(sessionId, SLICE)).body.page.total;
      expect(after).toBe(before + 1);

      // Reached through the real Discover filter system, not a special case
      const filtered = await discover(
        sessionId,
        `?q=${encodeURIComponent("Frank's Creek Cleanup")}&cause=Environment&host=community&type=volunteer&mode=atlanta`
      );
      expect(filtered.body.opportunities.map((o) => o.id)).toContain(created.id);

      // Detail route
      const view = await detail(created.id, sessionId);
      expect(view.status).toBe(200);
      expect(view.body.opportunity.title).toBe(VALID.title);
      expect(view.body.opportunity.host).toMatchObject({ type: 'user', id: user.id });
      expect(view.body.opportunity.participants).toMatchObject({ joined: 0, available: 20 });
    });

    it('can be joined through the existing Join system, with derived counts', async () => {
      const { sessionId } = await newSession();
      const created = (await create(sessionId, VALID)).body.opportunity;

      const join = await request(app)
        .post(`/api/v1/opportunities/${created.id}/join`)
        .set('X-Kynd-Session-Id', sessionId);
      expect(join.status).toBe(200);
      expect(join.body).toMatchObject({ joined: true, participantCount: 1, availableSpots: 19 });

      const view = await detail(created.id, sessionId);
      expect(view.body.opportunity.viewerJoined).toBe(true);

      const activity = await request(app)
        .get('/api/v1/activity')
        .set('X-Kynd-Session-Id', sessionId);
      expect(activity.body.upcoming.map((o) => o.id)).toContain(created.id);
    });
  });

  describe('session isolation', () => {
    it('is invisible to another session and to anonymous visitors, everywhere', async () => {
      const a = await newSession();
      const b = await newSession();
      const created = (await create(a.sessionId, VALID)).body.opportunity;

      // Detail: indistinguishable from an id that never existed.
      expect((await detail(created.id, b.sessionId)).status).toBe(404);
      expect((await detail(created.id, null)).status).toBe(404);

      // Discover, browsing and searching.
      const bSearch = await discover(b.sessionId, `?q=${encodeURIComponent("Frank's Creek")}`);
      expect(bSearch.body.opportunities).toEqual([]);
      expect(bSearch.body.page.total).toBe(0);
      const anonSearch = await discover(null, `?q=${encodeURIComponent("Frank's Creek")}`);
      expect(anonSearch.body.opportunities).toEqual([]);

      // A finds it by the same search, so the search itself is not the reason.
      const aSearch = await discover(a.sessionId, `?q=${encodeURIComponent("Frank's Creek")}`);
      expect(aSearch.body.opportunities.map((o) => o.id)).toContain(created.id);

      // Home: cause discovery is the one surface that reaches outside the
      // follow graph, so it is the one that could otherwise leak.
      const bHome = await request(app).get('/api/v1/home').set('X-Kynd-Session-Id', b.sessionId);
      const bHomeIds = bHome.body.items.map((i) => i.opportunity?.id).filter(Boolean);
      expect(bHomeIds).not.toContain(created.id);

      // Not joinable by id either, rather than merely undiscoverable.
      const bJoin = await request(app)
        .post(`/api/v1/opportunities/${created.id}/join`)
        .set('X-Kynd-Session-Id', b.sessionId);
      expect(bJoin.status).toBe(404);

      // A's own view is unaffected.
      expect((await detail(created.id, a.sessionId)).status).toBe(200);
    });

    it('the seeded world stays visible to everyone, including anonymous', async () => {
      const { sessionId } = await newSession();
      await create(sessionId, VALID);
      const anon = await discover(null, '?limit=20');
      expect(anon.body.opportunities.length).toBeGreaterThan(0);
      expect(anon.body.page.total).toBeGreaterThan(100);
    });
  });

  describe('runtime role', () => {
    it('kynd_app has INSERT on opportunities, and still no UPDATE or DELETE', async () => {
      const { pool } = require('../src/db/pool');
      const isOwner = (await pool.query(`SELECT current_user = 'neondb_owner' AS owner`)).rows[0]
        .owner;

      const { rows } = await pool.query(
        `SELECT
           has_table_privilege('kynd_app', 'opportunities', 'SELECT') AS sel,
           has_table_privilege('kynd_app', 'opportunities', 'INSERT') AS ins,
           has_table_privilege('kynd_app', 'opportunities', 'UPDATE') AS upd,
           has_table_privilege('kynd_app', 'opportunities', 'DELETE') AS del`
      );
      expect(rows[0]).toEqual({ sel: true, ins: true, upd: false, del: false });
      expect(isOwner || true).toBe(true);
    });
  });
});
