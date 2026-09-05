'use strict';

const request = require('supertest');

const { createApp } = require('../src/app');
const { query, closePool } = require('../src/db/pool');

// Riverlight Atlanta's own flagship opportunity — stable across whole-week
// temporal refreshes, already relied on as an anchor in join.test.js.
const FLAGSHIP = 'bc09559d-77de-5bde-b248-00a1480d6d94';

const app = createApp();

function flagshipEntry(organization) {
  return organization.upcomingOpportunities.find((o) => o.id === FLAGSHIP);
}

describe('organization API', () => {
  let riverlightId;

  beforeAll(async () => {
    const { rows } = await query(
      'SELECT id FROM organizations WHERE name = $1',
      ['Riverlight Atlanta']
    );
    if (!rows[0]) {
      throw new Error('Anchor organization not found: Riverlight Atlanta');
    }
    riverlightId = rows[0].id;
  });

  afterAll(async () => {
    await closePool();
  });

  it('retrieves the anchor organization as a product-facing object', async () => {
    const app = createApp();
    const res = await request(app).get(
      `/api/v1/organizations/${riverlightId}`
    );

    expect(res.status).toBe(200);
    const { organization } = res.body;

    expect(organization.name).toBe('Riverlight Atlanta');
    expect(organization.verified).toBe(true);
    expect(Array.isArray(organization.causes)).toBe(true);
    expect(Array.isArray(organization.upcomingOpportunities)).toBe(true);
    expect(organization).not.toHaveProperty('is_verified_demo');
  });

  it('returns 404 for a well-formed but missing organization id', async () => {
    const app = createApp();
    const res = await request(app).get(
      '/api/v1/organizations/00000000-0000-4000-8000-000000000000'
    );

    expect(res.status).toBe(404);
  });

  describe('upcoming-opportunity participant visibility', () => {
    const sessions = [];

    const organization = (id, sessionId) => {
      const req = request(app).get(`/api/v1/organizations/${id}`);
      return sessionId ? req.set('X-Kynd-Session-Id', sessionId) : req;
    };
    const join = (id, sessionId) => {
      const req = request(app).post(`/api/v1/opportunities/${id}/join`);
      return sessionId ? req.set('X-Kynd-Session-Id', sessionId) : req;
    };
    async function newSession() {
      const res = await request(app).post('/api/v1/demo-sessions');
      sessions.push(res.body.sessionId);
      return res.body;
    }

    afterEach(async () => {
      if (sessions.length > 0) {
        await query(`DELETE FROM demo_sessions WHERE id = ANY($1::uuid[])`, [sessions]);
        sessions.length = 0;
      }
    });

    it("scopes joined/available in upcomingOpportunities the same way Discover does — B and anonymous never see A's temporary join", async () => {
      const anonBefore = flagshipEntry((await organization(riverlightId)).body.organization);
      expect(anonBefore).toBeDefined();
      const seededJoined = anonBefore.participants.joined;

      const a = await newSession();
      const b = await newSession();

      const joinRes = await join(FLAGSHIP, a.sessionId);
      expect(joinRes.status).toBe(200);

      const aView = flagshipEntry((await organization(riverlightId, a.sessionId)).body.organization);
      expect(aView.participants.joined).toBe(seededJoined + 1);
      expect(aView.participants.available).toBe(aView.capacity - seededJoined - 1);

      const bView = flagshipEntry((await organization(riverlightId, b.sessionId)).body.organization);
      expect(bView.participants.joined).toBe(seededJoined);

      const anonAfter = flagshipEntry((await organization(riverlightId)).body.organization);
      expect(anonAfter.participants.joined).toBe(seededJoined);
    });
  });
});
