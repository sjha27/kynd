'use strict';

const { createApp } = require('./app');
const { loadEnv } = require('./config/env');
const { closePool } = require('./db/pool');

const env = loadEnv();
const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`Kynd API listening on port ${env.port}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { server };
