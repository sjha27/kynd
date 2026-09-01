'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { loadEnv } = require('./config/env');
const { pool } = require('./db/pool');
const opportunitiesRouter = require('./routes/opportunities');
const usersRouter = require('./routes/users');
const organizationsRouter = require('./routes/organizations');
const { notFoundHandler, errorHandler } = require('./middleware/errors');

function createApp() {
  const env = loadEnv();
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin }));
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

  app.use('/api/v1/opportunities', opportunitiesRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/organizations', organizationsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
