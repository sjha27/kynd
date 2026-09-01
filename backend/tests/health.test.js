'use strict';

const request = require('supertest');

const { createApp } = require('../src/app');
const { closePool } = require('../src/db/pool');

describe('GET /api/health', () => {
  afterAll(async () => {
    await closePool();
  });

  it('reports ok without touching the database', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
