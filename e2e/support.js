'use strict';

const { expect } = require('@playwright/test');

/*
 * Shared helpers for the system tests.
 *
 * The rule these follow: drive the product the way a person does — through
 * visible, named UI — and read results from what the page actually shows.
 * The API is used only for setup facts a visitor could not reasonably click
 * their way to (which fundraiser exists, which opportunity is in the
 * future) and for cleanup.
 */

// The flagship. Deliberately stable, and the centre of the recruiter
// journey, so the most important test never depends on seeded ordering.
const PIEDMONT_ID = 'bc09559d-77de-5bde-b248-00a1480d6d94';
const PIEDMONT_TITLE = 'Piedmont Park Community Cleanup';

const API = process.env.KYND_E2E_API_URL || 'http://localhost:4000';

/*
 * Every test starts as a brand new visitor.
 *
 * Clearing localStorage before the app boots means the provider mints a
 * fresh session on load, exactly as a first-time visitor gets one — rather
 * than tests sharing one accumulating session.
 */
async function freshSession(page) {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.localStorage.getItem('kynd_demo_session_id') !== null, {
    timeout: 20_000,
  });
  return page.evaluate(() => window.localStorage.getItem('kynd_demo_session_id'));
}

function sessionId(page) {
  return page.evaluate(() => window.localStorage.getItem('kynd_demo_session_id'));
}

/*
 * Tests clean up after themselves through the product's own Reset path —
 * the same DELETE the Reset demo button uses — so no test leaves a
 * temporary user or its rows behind.
 */
async function deleteSession(request, id) {
  if (!id) return;
  await request
    .delete(`${API}/api/v1/demo-sessions/current`, { headers: { 'X-Kynd-Session-Id': id } })
    .catch(() => {});
}

// Setup facts read from the API, not clicked to.
async function apiGet(request, path, id) {
  const res = await request.get(`${API}${path}`, {
    headers: id ? { 'X-Kynd-Session-Id': id } : {},
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function futureOpportunity(request) {
  const body = await apiGet(request, '/api/v1/opportunities?limit=1&sort=soonest');
  return body.opportunities[0];
}

async function openFundraiser(request) {
  const body = await apiGet(request, '/api/v1/fundraisers?limit=1');
  return body.fundraisers[0];
}

// Profile metric tiles are label + value pairs; read the value by its label.
async function profileMetric(page, label) {
  const tile = page.locator('dl div', { has: page.getByText(label, { exact: true }) });
  return (await tile.locator('dd').innerText()).trim();
}

async function gotoTab(page, name) {
  await page.getByRole('tab', { name }).click();
}

function dateOffset(days) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

module.exports = {
  PIEDMONT_ID,
  PIEDMONT_TITLE,
  API,
  freshSession,
  sessionId,
  deleteSession,
  apiGet,
  futureOpportunity,
  openFundraiser,
  profileMetric,
  gotoTab,
  dateOffset,
};
