'use strict';

const request = require('supertest');

const { createApp } = require('../src/app');
const { query, closePool } = require('../src/db/pool');

async function findUserIdByName(displayName) {
  const { rows } = await query(
    'SELECT id FROM users WHERE display_name = $1',
    [displayName]
  );
  if (!rows[0]) {
    throw new Error(`Anchor user not found: ${displayName}`);
  }
  return rows[0].id;
}

describe('user profile API', () => {
  let mayaId;
  let davidId;

  beforeAll(async () => {
    mayaId = await findUserIdByName('Maya Ellis');
    davidId = await findUserIdByName('David Mercer');
  });

  afterAll(async () => {
    await closePool();
  });

  it("reconciles Maya Ellis's profile metrics", async () => {
    const app = createApp();
    const res = await request(app).get(`/api/v1/users/${mayaId}/profile`);

    expect(res.status).toBe(200);
    expect(res.body.profile.metrics).toEqual({
      hours: 17.5,
      activities: 5,
      organizations: 4,
      amountRaisedCents: 65000,
    });
  });

  it("reconciles David Mercer's profile metrics", async () => {
    const app = createApp();
    const res = await request(app).get(`/api/v1/users/${davidId}/profile`);

    expect(res.status).toBe(200);
    expect(res.body.profile.metrics).toEqual({
      hours: 34,
      activities: 12,
      organizations: 9,
      amountRaisedCents: 185000,
    });
  });

  it('rejects a malformed user id', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/users/not-a-uuid/profile');

    expect(res.status).toBe(400);
  });

  it('returns 404 for a well-formed but missing user id', async () => {
    const app = createApp();
    const res = await request(app).get(
      '/api/v1/users/00000000-0000-4000-8000-000000000000/profile'
    );

    expect(res.status).toBe(404);
  });
});
