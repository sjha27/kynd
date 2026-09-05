'use strict';

const request = require('supertest');

const { createApp } = require('../src/app');
const { closePool } = require('../src/db/pool');

const FLAGSHIP_OPPORTUNITY_ID = 'bc09559d-77de-5bde-b248-00a1480d6d94';
const VALID_BUT_UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

describe('opportunities API', () => {
  afterAll(async () => {
    await closePool();
  });

  it('lists published opportunities as product-facing objects', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/opportunities');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.opportunities)).toBe(true);
    expect(res.body.opportunities.length).toBeGreaterThan(0);

    const first = res.body.opportunities[0];
    expect(first).toHaveProperty('cause');
    expect(first).toHaveProperty('host');
    expect(first).toHaveProperty('participants');
    // Product JSON, not a raw row dump: no snake_case DB columns leaked.
    expect(first).not.toHaveProperty('opportunity_type');
    expect(first).not.toHaveProperty('host_organization_id');
  });

  it('reconciles the flagship Piedmont Park Community Cleanup', async () => {
    const app = createApp();
    const res = await request(app).get(
      `/api/v1/opportunities/${FLAGSHIP_OPPORTUNITY_ID}`
    );

    expect(res.status).toBe(200);
    const { opportunity } = res.body;

    expect(opportunity.id).toBe(FLAGSHIP_OPPORTUNITY_ID);
    expect(opportunity.title).toBe('Piedmont Park Community Cleanup');
    expect(opportunity.capacity).toBe(25);
    // toMatchObject rather than toEqual: participants now also carries a
    // non-personalized attendee `preview` for social context.
    expect(opportunity.participants).toMatchObject({ joined: 5, available: 20 });
    expect(opportunity.host).toMatchObject({
      type: 'organization',
      name: 'Riverlight Atlanta',
    });
    expect(opportunity.cause.name).toBe('Environment');
  });

  it('clamps out-of-range pagination params instead of erroring', async () => {
    const app = createApp();
    const res = await request(app).get(
      '/api/v1/opportunities?limit=500&offset=-20'
    );

    expect(res.status).toBe(200);
    expect(res.body.opportunities.length).toBeLessThanOrEqual(50);
  });

  it('rejects a malformed opportunity id', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/opportunities/not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 404 for a well-formed but missing opportunity id', async () => {
    const app = createApp();
    const res = await request(app).get(
      `/api/v1/opportunities/${VALID_BUT_UNKNOWN_UUID}`
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});
