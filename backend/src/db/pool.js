'use strict';

const { Pool } = require('pg');
const { loadEnv } = require('../config/env');

const env = loadEnv();

// connectionString already carries `sslmode=require&channel_binding=require`,
// so pg negotiates a verified TLS connection to Neon without any explicit
// ssl override here.
const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 5,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', {
    message: err && err.message,
    code: err && err.code,
  });
});

function query(text, params) {
  return pool.query(text, params);
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, query, closePool };
