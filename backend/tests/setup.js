'use strict';

// Loads DATABASE_URL (and friends) from the repo-root .env for the test
// process. We deliberately avoid the dotenv package per project policy;
// this is a minimal KEY=VALUE parser, not a general-purpose env loader.
const fs = require('node:fs');
const path = require('node:path');

function loadRootEnv() {
  const envPath = path.resolve(__dirname, '..', '..', '.env');

  if (!fs.existsSync(envPath)) {
    return;
  }

  const contents = fs.readFileSync(envPath, 'utf8');

  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadRootEnv();
