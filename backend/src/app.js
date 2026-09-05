'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { loadEnv } = require('./config/env');
const { pool } = require('./db/pool');
const opportunitiesRouter = require('./routes/opportunities');
const usersRouter = require('./routes/users');
const organizationsRouter = require('./routes/organizations');
const demoSessionsRouter = require('./routes/demo_sessions');
const activityRouter = require('./routes/activity');
const activitiesRouter = require('./routes/activities');
const homeRouter = require('./routes/home');
const fundraisersRouter = require('./routes/fundraisers');
const { notFoundHandler, errorHandler } = require('./middleware/errors');
const { SESSION_HEADER } = require('./middleware/session');

function createApp() {
  const env = loadEnv();
  const app = express();

  // Render terminates TLS and forwards one hop, so the client IP arrives in
  // X-Forwarded-For. Without this the rate limiter would bucket every visitor
  // under the proxy's address. Scoped to a single hop rather than `true`,
  // which would let a client spoof its own IP through the header.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.clientOrigin,
      // The browser cannot send X-Kynd-Session-Id cross-origin unless it is
      // named here. No credentials: Kynd uses no cookies.
      allowedHeaders: ['Content-Type', SESSION_HEADER],
    })
  );
  app.use(express.json());

  // Infrastructure: proves Express itself is alive without touching the
  // database, so it stays useful for Render health/warm-up checks.
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Infrastructure: proves the backend can reach Neon.
  app.get('/api/ready', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ready' });
    } catch (err) {
      console.error('Readiness check failed', {
        message: err && err.message,
        code: err && err.code,
      });
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/api/v1/demo-sessions', demoSessionsRouter);
  app.use('/api/v1/opportunities', opportunitiesRouter);
  app.use('/api/v1/activity', activityRouter);
  app.use('/api/v1/activities', activitiesRouter);
  app.use('/api/v1/home', homeRouter);
  app.use('/api/v1/fundraisers', fundraisersRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/organizations', organizationsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
