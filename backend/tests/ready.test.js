'use strict';

const request = require('supertest');

const { createApp } = require('../src/app');
const { closePool } = require('../src/db/pool');

describe('GET /api/ready', () => {
  afterAll(async () => {
    await closePool();
  });

  it('confirms Neon connectivity without leaking internals', async () => {
    const app = createApp();
    const res = await request(app).get('/api/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
    expect(JSON.stringify(res.body)).not.toMatch(/postgres(ql)?:\/\//i);
  });
});
