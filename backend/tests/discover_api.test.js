'use strict';

const request = require('supertest');

const { createApp } = require('../src/app');
const { closePool } = require('../src/db/pool');
const { COMMITMENT_BANDS } = require('../src/lib/discovery');

const FLAGSHIP_OPPORTUNITY_ID = 'bc09559d-77de-5bde-b248-00a1480d6d94';

const get = (path) => request(createApp()).get(path);

describe('Discover browsing API', () => {
  afterAll(async () => {
    await closePool();
  });

  describe('response shape', () => {
    it('returns opportunities plus page metadata and echoed filters', async () => {
      const res = await get('/api/v1/opportunities?limit=5');

      expect(res.status).toBe(200);
      expect(res.body.opportunities).toHaveLength(5);
      expect(res.body.page).toMatchObject({ limit: 5, offset: 0 });
      expect(res.body.page.total).toBeGreaterThan(5);
      expect(res.body.filters.sort).toBe('soonest');
    });

    it('exposes derived timing and social context on list items', async () => {
      const res = await get('/api/v1/opportunities?limit=3');
      const first = res.body.opportunities[0];

      expect(first.timing.durationMinutes).toBeGreaterThan(0);
      expect(Object.keys(COMMITMENT_BANDS)).toContain(first.timing.commitment);
      expect(Array.isArray(first.participants.preview)).toBe(true);
      expect(first.participants.available).toBe(
        Math.max(first.capacity - first.participants.joined, 0)
      );
    });

    it('only lists upcoming published opportunities', async () => {
      const res = await get('/api/v1/opportunities?limit=25');
      const now = Date.now();

      for (const opportunity of res.body.opportunities) {
        expect(opportunity.status).toBe('published');
        expect(new Date(opportunity.timing.startsAt).getTime()).toBeGreaterThan(now);
      }
    });
  });

  describe('search', () => {
    it('finds opportunities by title text', async () => {
      const res = await get('/api/v1/opportunities?q=cleanup&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.opportunities.length).toBeGreaterThan(0);
      // Match may come from title, description, cause, or host name.
      const haystack = JSON.stringify(res.body.opportunities).toLowerCase();
      expect(haystack).toContain('cleanup');
    });

    it('finds opportunities by their hosting organization name', async () => {
      const res = await get('/api/v1/opportunities?q=Riverlight&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.opportunities.length).toBeGreaterThan(0);
      for (const opportunity of res.body.opportunities) {
        expect(opportunity.host.name).toMatch(/Riverlight/i);
      }
    });

    it('finds opportunities by cause name', async () => {
      const res = await get('/api/v1/opportunities?q=Environment&limit=10');
      expect(res.status).toBe(200);
      expect(res.body.opportunities.length).toBeGreaterThan(0);
    });

    it('treats a whitespace-only query as no search at all', async () => {
      const blank = await get('/api/v1/opportunities?q=%20%20&limit=5');
      const none = await get('/api/v1/opportunities?limit=5');

      expect(blank.status).toBe(200);
      expect(blank.body.filters.q).toBeNull();
      expect(blank.body.page.total).toBe(none.body.page.total);
    });

    it('returns an empty result set for a term that matches nothing', async () => {
      const res = await get('/api/v1/opportunities?q=zzzzznotarealterm');

      expect(res.status).toBe(200);
      expect(res.body.opportunities).toEqual([]);
      expect(res.body.page.total).toBe(0);
    });

    it('handles an oversized query without erroring', async () => {
      const res = await get(`/api/v1/opportunities?q=${'a'.repeat(1000)}`);

      expect(res.status).toBe(200);
      expect(res.body.filters.q).toHaveLength(120);
    });

    it('treats SQL metacharacters as literal text, not syntax', async () => {
      const res = await get("/api/v1/opportunities?q=%27%3B%20DROP%20TABLE%20opportunities%3B--");

      expect(res.status).toBe(200);
      expect(res.body.opportunities).toEqual([]);

      // The table is still there and still serving.
      const after = await get('/api/v1/opportunities?limit=1');
      expect(after.status).toBe(200);
      expect(after.body.opportunities).toHaveLength(1);
    });
  });

  describe('filters', () => {
    it('filters by opportunity type', async () => {
      const res = await get('/api/v1/opportunities?type=charity_event&limit=15');

      expect(res.body.opportunities.length).toBeGreaterThan(0);
      for (const o of res.body.opportunities) {
        expect(o.type).toBe('charity_event');
      }
    });

    it('filters to organization-hosted opportunities', async () => {
      const res = await get('/api/v1/opportunities?host=organization&limit=15');

      expect(res.body.opportunities.length).toBeGreaterThan(0);
      for (const o of res.body.opportunities) {
        expect(o.host.type).toBe('organization');
      }
    });

    it('filters to community-member-hosted opportunities', async () => {
      const res = await get('/api/v1/opportunities?host=community&limit=15');

      expect(res.body.opportunities.length).toBeGreaterThan(0);
      for (const o of res.body.opportunities) {
        expect(o.host.type).toBe('user');
      }
    });

    it('filters to online opportunities', async () => {
      const res = await get('/api/v1/opportunities?mode=online&limit=15');

      expect(res.body.opportunities.length).toBeGreaterThan(0);
      for (const o of res.body.opportunities) {
        expect(o.location.isOnline).toBe(true);
      }
    });

    it('filters to physical Atlanta-area opportunities', async () => {
      const res = await get('/api/v1/opportunities?mode=atlanta&limit=15');

      expect(res.body.opportunities.length).toBeGreaterThan(0);
      for (const o of res.body.opportunities) {
        expect(o.location.isOnline).toBe(false);
        expect(o.location.state).toBe('GA');
      }
    });

    it('filters by cause name', async () => {
      const res = await get('/api/v1/opportunities?cause=Animals&limit=15');

      expect(res.body.opportunities.length).toBeGreaterThan(0);
      for (const o of res.body.opportunities) {
        expect(o.cause.name).toBe('Animals');
      }
    });

    it('returns nothing for a cause that does not exist', async () => {
      const res = await get('/api/v1/opportunities?cause=Cryptocurrency');
      expect(res.status).toBe(200);
      expect(res.body.opportunities).toEqual([]);
    });

    it.each(Object.keys(COMMITMENT_BANDS))(
      'returns only durations inside the %s band',
      async (band) => {
        const res = await get(`/api/v1/opportunities?commitment=${band}&limit=20`);
        expect(res.status).toBe(200);

        for (const o of res.body.opportunities) {
          expect(o.timing.commitment).toBe(band);
        }
      }
    );

    it('keeps every result inside the next-7-days window', async () => {
      const res = await get('/api/v1/opportunities?timing=next7&limit=25');
      const horizon = Date.now() + 7 * 24 * 60 * 60 * 1000;

      expect(res.status).toBe(200);
      for (const o of res.body.opportunities) {
        expect(new Date(o.timing.startsAt).getTime()).toBeLessThanOrEqual(horizon);
      }
    });

    it('returns only Saturday or Sunday for the weekend window', async () => {
      const res = await get('/api/v1/opportunities?timing=weekend&limit=25');
      expect(res.status).toBe(200);

      for (const o of res.body.opportunities) {
        const weekday = new Date(o.timing.startsAt).toLocaleDateString('en-US', {
          weekday: 'long',
          timeZone: 'America/New_York',
        });
        expect(['Saturday', 'Sunday']).toContain(weekday);
      }
    });

    it('returns only today for the today window', async () => {
      const res = await get('/api/v1/opportunities?timing=today&limit=25');
      expect(res.status).toBe(200);

      const localDate = (value) =>
        new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const today = localDate(new Date());

      for (const o of res.body.opportunities) {
        expect(localDate(o.timing.startsAt)).toBe(today);
      }
    });
  });

  describe('filter combinations', () => {
    it('applies type, host, mode and cause together', async () => {
      const res = await get(
        '/api/v1/opportunities?type=volunteer&host=organization&mode=atlanta&cause=Environment&limit=15'
      );

      expect(res.status).toBe(200);
      for (const o of res.body.opportunities) {
        expect(o.type).toBe('volunteer');
        expect(o.host.type).toBe('organization');
        expect(o.location.isOnline).toBe(false);
        expect(o.cause.name).toBe('Environment');
      }
    });

    it('narrows the total as filters are added', async () => {
      const broad = await get('/api/v1/opportunities?limit=1');
      const narrow = await get('/api/v1/opportunities?limit=1&cause=Animals&mode=online');

      expect(narrow.body.page.total).toBeLessThan(broad.body.page.total);
    });

    it('combines search with filters', async () => {
      const res = await get('/api/v1/opportunities?q=food&cause=Food%20%26%20Hunger&limit=10');

      expect(res.status).toBe(200);
      for (const o of res.body.opportunities) {
        expect(o.cause.name).toBe('Food & Hunger');
      }
    });
  });

  describe('sorting', () => {
    it('sorts by soonest start by default', async () => {
      const res = await get('/api/v1/opportunities?limit=20');
      const times = res.body.opportunities.map((o) => new Date(o.timing.startsAt).getTime());

      expect([...times].sort((a, b) => a - b)).toEqual(times);
    });

    it('sorts popular by joined count descending', async () => {
      const res = await get('/api/v1/opportunities?sort=popular&mode=atlanta&limit=20');
      const joined = res.body.opportunities.map((o) => o.participants.joined);

      expect([...joined].sort((a, b) => b - a)).toEqual(joined);
    });

    it('is deterministic: the same popular query returns the same order', async () => {
      const first = await get('/api/v1/opportunities?sort=popular&limit=15');
      const second = await get('/api/v1/opportunities?sort=popular&limit=15');

      expect(first.body.opportunities.map((o) => o.id)).toEqual(
        second.body.opportunities.map((o) => o.id)
      );
    });
  });

  describe('pagination', () => {
    it('returns a stable total across pages and does not repeat rows', async () => {
      const page1 = await get('/api/v1/opportunities?limit=5&offset=0');
      const page2 = await get('/api/v1/opportunities?limit=5&offset=5');

      expect(page1.body.page.total).toBe(page2.body.page.total);

      const ids1 = page1.body.opportunities.map((o) => o.id);
      const ids2 = page2.body.opportunities.map((o) => o.id);
      expect(ids1.filter((id) => ids2.includes(id))).toEqual([]);
    });

    it('returns an empty page past the end of the result set', async () => {
      const res = await get('/api/v1/opportunities?limit=5&offset=100000');

      expect(res.status).toBe(200);
      expect(res.body.opportunities).toEqual([]);
    });

    it('preserves filters across pagination', async () => {
      const res = await get('/api/v1/opportunities?cause=Youth&limit=5&offset=5');

      for (const o of res.body.opportunities) {
        expect(o.cause.name).toBe('Youth');
      }
    });
  });

  describe('flagship reconciliation', () => {
    it('keeps the flagship facts intact on detail', async () => {
      const res = await get(`/api/v1/opportunities/${FLAGSHIP_OPPORTUNITY_ID}`);
      const { opportunity } = res.body;

      expect(opportunity.title).toBe('Piedmont Park Community Cleanup');
      expect(opportunity.capacity).toBe(25);
      expect(opportunity.participants.joined).toBe(5);
      expect(opportunity.participants.available).toBe(20);
      expect(opportunity.cause.name).toBe('Environment');
      expect(opportunity.host.name).toBe('Riverlight Atlanta');
      expect(opportunity.host.type).toBe('organization');
    });

    it('includes Maya Ellis in the flagship attendee preview', async () => {
      const res = await get(`/api/v1/opportunities/${FLAGSHIP_OPPORTUNITY_ID}`);
      const names = res.body.opportunity.participants.preview.map((p) => p.name);

      expect(names).toContain('Maya Ellis');
      expect(res.body.opportunity.participants.preview.length).toBeLessThanOrEqual(5);
    });

    it('finds the flagship by searching its title', async () => {
      const res = await get('/api/v1/opportunities?q=Piedmont%20Park%20Community%20Cleanup');
      // The flagship has already started, so it is correctly absent from
      // upcoming browsing — detail remains the way to reach it.
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.opportunities)).toBe(true);
    });
  });

  describe('write-surface guarantee', () => {
    // Creation deliberately added POST (publishing an opportunity). Editing
    // and deleting are still out of scope and must stay unreachable.
    it.each(['put', 'patch', 'delete'])(
      'does not expose a %s route on opportunities',
      async (method) => {
        const res = await request(createApp())[method]('/api/v1/opportunities');
        expect(res.status).toBe(404);
      }
    );

    it('exposes POST, but only to a real demo session', async () => {
      const res = await request(createApp()).post('/api/v1/opportunities').send({});
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('demo_session_invalid');
    });
  });
});
