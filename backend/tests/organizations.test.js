'use strict';

const request = require('supertest');

const { createApp } = require('../src/app');
const { query, closePool } = require('../src/db/pool');

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
});
