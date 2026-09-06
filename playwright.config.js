'use strict';

const { defineConfig, devices } = require('@playwright/test');

/*
 * System tests for Kynd.
 *
 * These are deliberately NOT another integration suite — the 256 backend
 * tests already cover validation, visibility and privilege rules. What they
 * prove is the thing no backend test can: that the real interconnected
 * journeys work through the actual UI, in a browser, end to end.
 *
 * They run against the ordinary local dev stack (Vite on 5173 proxying to
 * Express on 4000, backed by the same Neon database every other test uses),
 * so there is no parallel testing architecture and no separate environment
 * to keep in sync with the real one.
 *
 * Serial, single worker: every test creates its own demo session and the
 * suite asserts on real derived counts. Parallel workers would be safe by
 * the product's own isolation rules, but serial keeps failures readable and
 * the flagship's visible capacity stable.
 */
module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.KYND_E2E_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
