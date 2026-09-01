'use strict';

function loadEnv() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const port = Number.parseInt(process.env.PORT, 10) || 4000;

  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

  return {
    databaseUrl,
    port,
    nodeEnv: process.env.NODE_ENV || 'development',
    clientOrigin,
  };
}

module.exports = { loadEnv };
