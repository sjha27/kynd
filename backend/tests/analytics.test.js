'use strict';

const request = require('supertest');

const { createApp } = require('../src/app');
const { query, closePool } = require('../src/db/pool');
const analytics = require('../src/lib/analytics');

const app = createApp();
const sessions = [];

async function newSession() {
  const res = await request(app).post('/api/v1/demo-sessions');
  sessions.push(res.body.sessionId);
  return res.body;
}

/*
 * Analytics are console.log lines, so capturing them is how we assert on
 * them. Only lines carrying the analytics marker are collected — ordinary
 * operational logging passes through untouched.
 */
function captureEvents(fn) {
  const original = console.log;
  const captured = [];
  console.log = (...args) => {
    try {
      const parsed = JSON.parse(args[0]);
      if (parsed && parsed.log_type === analytics.LOG_TYPE) captured.push(parsed);
    } catch {
      /* not an analytics line */
    }
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.log = original;
    })
    .then(() => captured);
}

const postEvent = (sessionId, body) =>
  request(app).post('/api/v1/events').set('X-Kynd-Session-Id', sessionId).send(body);

describe('Analytics', () => {
  let futureId;

  beforeAll(async () => {
    const o = await query(
      `SELECT id FROM opportunities WHERE status = 'published' AND starts_at > now()
       ORDER BY starts_at ASC LIMIT 1`
    );
    futureId = o.rows[0].id;
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

  describe('the event envelope', () => {
    it('carries the common fields, marks the line as analytics, and flags demo data', async () => {
      const { sessionId, user } = await newSession();

      const events = await captureEvents(() =>
        request(app).get('/api/v1/home').set('X-Kynd-Session-Id', sessionId)
      );

      const home = events.find((e) => e.event === 'home_viewed');
      expect(home).toBeDefined();
      expect(home.log_type).toBe('kynd_analytics_event');
      expect(home.schema_version).toBe(analytics.SCHEMA_VERSION);
      expect(home.is_demo).toBe(true);
      expect(home.session_id).toBe(sessionId);
      expect(home.user_id).toBe(user.id);
      expect(typeof home.ts).toBe('string');
      // A brand new session, so age is small but real.
      expect(home.session_age_seconds).toBeGreaterThanOrEqual(0);
      expect(home.session_age_seconds).toBeLessThan(120);
      // Event-specific properties.
      expect(typeof home.item_count).toBe('number');
      expect(typeof home.has_second_degree).toBe('boolean');
    });

    it('never throws into the product flow, even on unserializable input', () => {
      const circular = {};
      circular.self = circular;
      // If this threw, a Join wrapping it would fail.
      expect(() => analytics.track('anything', circular, null)).not.toThrow();
      expect(() => analytics.track('anything', {}, undefined)).not.toThrow();
    });

    it('buckets money and capacity rather than recording exact values', () => {
      expect(analytics.amountBucket(2500)).toBe('25_49');
      expect(analytics.amountBucket(999)).toBe('under_10');
      expect(analytics.amountBucket(0)).toBe('unknown');
      expect(analytics.capacityBucket(20)).toBe('11_25');
      expect(analytics.capacityBucket(500)).toBe('50_plus');
    });
  });

  describe('the frontend event bridge', () => {
    it('requires a session', async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .send({ event: 'discover_viewed', properties: { mode: 'browse' } });
      expect(res.status).toBe(401);
    });

    it('accepts an allowlisted event and derives identity from the session alone', async () => {
      const { sessionId, user } = await newSession();

      const events = await captureEvents(async () => {
        const res = await postEvent(sessionId, {
          event: 'opportunity_viewed',
          properties: {
            opportunity_id: futureId,
            cause: 'Environment',
            host_type: 'organization',
            source: 'home_second_degree',
          },
        });
        expect(res.status).toBe(202);
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        event: 'opportunity_viewed',
        opportunity_id: futureId,
        source: 'home_second_degree',
        session_id: sessionId,
        user_id: user.id,
      });
    });

    it('ignores identity the browser tries to supply, taking it from the session', async () => {
      const a = await newSession();
      const b = await newSession();

      const events = await captureEvents(async () => {
        const res = await postEvent(a.sessionId, {
          event: 'discover_viewed',
          properties: { mode: 'browse' },
          // Deliberate attempts to spoof identity at the top level.
          session_id: b.sessionId,
          user_id: b.user.id,
        });
        expect(res.status).toBe(202);
      });

      expect(events[0].session_id).toBe(a.sessionId);
      expect(events[0].user_id).toBe(a.user.id);
      expect(events[0].session_id).not.toBe(b.sessionId);
    });

    it('rejects unknown event names', async () => {
      const { sessionId } = await newSession();
      expect((await postEvent(sessionId, { event: 'opportunity_joined' })).status).toBe(400);
      expect((await postEvent(sessionId, { event: 'made_up_event' })).status).toBe(400);
      expect((await postEvent(sessionId, {})).status).toBe(400);
      // Prototype keys must not resolve to a contract.
      expect((await postEvent(sessionId, { event: 'constructor' })).status).toBe(400);
    });

    it('rejects unexpected properties, including any attempt to send free text', async () => {
      const { sessionId } = await newSession();

      const withFreeText = await postEvent(sessionId, {
        event: 'discover_viewed',
        properties: { mode: 'search', query: 'my private search term' },
      });
      expect(withFreeText.status).toBe(400);

      const withComment = await postEvent(sessionId, {
        event: 'opportunity_viewed',
        properties: { opportunity_id: futureId, comment: 'something personal' },
      });
      expect(withComment.status).toBe(400);
    });

    it('rejects values outside the declared vocabulary', async () => {
      const { sessionId } = await newSession();
      expect(
        (await postEvent(sessionId, { event: 'discover_viewed', properties: { mode: 'nonsense' } }))
          .status
      ).toBe(400);
      expect(
        (await postEvent(sessionId, {
          event: 'opportunity_viewed',
          properties: { opportunity_id: 'not-a-uuid' },
        })).status
      ).toBe(400);
      expect(
        (await postEvent(sessionId, {
          event: 'opportunity_viewed',
          properties: { source: 'made_up_surface' },
        })).status
      ).toBe(400);
    });

    it('rejects an oversized payload', async () => {
      const { sessionId } = await newSession();
      const properties = {};
      for (let i = 0; i < 20; i += 1) properties[`k${i}`] = 'x';
      expect((await postEvent(sessionId, { event: 'discover_viewed', properties })).status).toBe(400);
    });
  });

  describe('product actions emit their events', () => {
    it('join and leave report the funnel without any visitor free text', async () => {
      const { sessionId } = await newSession();

      const joinEvents = await captureEvents(() =>
        request(app)
          .post(`/api/v1/opportunities/${futureId}/join`)
          .set('X-Kynd-Session-Id', sessionId)
          .send({ source: 'discover' })
      );
      const joined = joinEvents.find((e) => e.event === 'opportunity_joined');
      expect(joined).toMatchObject({
        opportunity_id: futureId,
        was_rejoin: false,
        source: 'discover',
      });
      expect(typeof joined.cause).toBe('string');

      const leaveEvents = await captureEvents(() =>
        request(app)
          .delete(`/api/v1/opportunities/${futureId}/join`)
          .set('X-Kynd-Session-Id', sessionId)
      );
      const left = leaveEvents.find((e) => e.event === 'opportunity_participation_changed');
      expect(left).toMatchObject({ opportunity_id: futureId, state: 'left' });
      expect(typeof left.hours_before_start).toBe('number');
    });

    it('a manual activity reports only shapes, never the words the visitor wrote', async () => {
      const { sessionId } = await newSession();

      const events = await captureEvents(() =>
        request(app)
          .post('/api/v1/activities')
          .set('X-Kynd-Session-Id', sessionId)
          .send({
            title: 'A private sounding title',
            causeName: 'Community',
            organizationName: 'Some External Organization',
            occurredOn: '2026-08-01',
            hours: 2,
            story: 'Something personal I wrote.',
          })
      );

      const logged = events.find((e) => e.event === 'activity_logged');
      expect(logged).toMatchObject({
        cause: 'Community',
        hours: 2,
        org_is_kynd: false,
        has_story: true,
      });

      // The visitor's own words must appear nowhere in the emitted line.
      const serialized = JSON.stringify(logged);
      expect(serialized).not.toContain('A private sounding title');
      expect(serialized).not.toContain('Something personal I wrote.');
      expect(serialized).not.toContain('Some External Organization');
    });

    it('a comment reports that it happened, never its body', async () => {
      const { sessionId } = await newSession();

      const events = await captureEvents(() =>
        request(app)
          .post(`/api/v1/engagement/opportunities/${futureId}/comments`)
          .set('X-Kynd-Session-Id', sessionId)
          .send({ body: 'A comment nobody else should ever read in a log' })
      );

      const engaged = events.find((e) => e.event === 'content_engaged');
      expect(engaged).toMatchObject({ target_type: 'opportunities', kind: 'comment' });
      expect(JSON.stringify(engaged)).not.toContain('nobody else should ever read');
    });

    it('discover reports which filters were used, never the search term', async () => {
      const { sessionId } = await newSession();

      const events = await captureEvents(() =>
        request(app)
          .get('/api/v1/opportunities?q=something%20private&cause=Environment')
          .set('X-Kynd-Session-Id', sessionId)
      );

      const used = events.find((e) => e.event === 'discover_query_used');
      expect(used.filter_keys).toContain('cause');
      expect(used.has_query).toBe(true);
      expect(typeof used.result_count).toBe('number');
      expect(JSON.stringify(used)).not.toContain('something private');
    });

    it('reset reports itself, from context captured before the session was destroyed', async () => {
      const { sessionId, user } = await newSession();

      const events = await captureEvents(() =>
        request(app).delete('/api/v1/demo-sessions/current').set('X-Kynd-Session-Id', sessionId)
      );

      const reset = events.find((e) => e.event === 'demo_reset');
      expect(reset).toBeDefined();
      expect(reset.session_id).toBe(sessionId);
      expect(reset.user_id).toBe(user.id);
      sessions.length = 0; // already deleted
    });

    it('a failing analytics emit cannot break the product write', async () => {
      const { sessionId, user } = await newSession();

      const original = console.log;
      console.log = () => {
        throw new Error('log transport exploded');
      };
      try {
        const res = await request(app)
          .post(`/api/v1/opportunities/${futureId}/save`)
          .set('X-Kynd-Session-Id', sessionId);
        expect(res.status).toBe(200);
      } finally {
        console.log = original;
      }

      // The product effect really happened despite analytics failing.
      const rows = await query(
        `SELECT COUNT(*)::int n FROM saved_opportunities WHERE user_id = $1`,
        [user.id]
      );
      expect(rows.rows[0].n).toBe(1);
    });
  });
});
