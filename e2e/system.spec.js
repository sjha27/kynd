'use strict';

const { test, expect } = require('@playwright/test');
const {
  PIEDMONT_ID,
  freshSession,
  sessionId,
  deleteSession,
  dateOffset,
} = require('./support');

/*
 * One cross-session isolation test, and a light disclosure smoke.
 *
 * Isolation is proved exhaustively per-feature in the backend suite; what
 * this adds is the browser-level version of the same claim, in two real
 * contexts that genuinely cannot see each other's storage.
 */
test("Session isolation: one visitor cannot see another visitor's created content", async ({
  browser,
  request,
}) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  let idA;
  let idB;

  try {
    // --- A creates something and joins something ---
    await freshSession(pageA);
    idA = await sessionId(pageA);

    const title = `E2E Private Cleanup ${Date.now()}`;
    await pageA.goto('/create/opportunity');
    const form = pageA.locator('form');
    await form.getByLabel('Title').fill(title);
    await form.getByLabel('Cause').selectOption('Environment');
    await form.getByLabel('Description').fill('Only session A should ever see this.');
    await form.getByLabel('Date').fill(dateOffset(18));
    await form.getByLabel('Starts').fill('09:00');
    await form.getByLabel('Ends').fill('12:00');
    await form.getByLabel('Location', { exact: true }).fill('Private Trailhead');
    await pageA.getByRole('button', { name: 'Publish' }).click();

    await expect(pageA).toHaveURL(/\/opportunities\/[0-9a-f-]{36}$/);
    const createdUrl = pageA.url();
    const createdId = createdUrl.split('/').pop();

    await pageA.goto(`/opportunities/${PIEDMONT_ID}`);
    await pageA.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(pageA.getByText('Joined', { exact: true })).toBeVisible();

    // --- B is a different visitor entirely ---
    await freshSession(pageB);
    idB = await sessionId(pageB);
    expect(idB).not.toBe(idA);

    // A's created opportunity is not addressable for B: the page cannot
    // load it at all, which is exactly what a 404 looks like from here.
    // (Opportunity detail shows one error state for both "gone" and
    // "unreachable" — see the checkpoint report.)
    await pageB.goto(`/opportunities/${createdId}`);
    await expect(pageB.getByText(/We couldn.t load this opportunity/)).toBeVisible();
    await expect(pageB.getByRole('heading', { name: title, level: 1 })).toHaveCount(0);

    // Nor discoverable. Scoped to result cards on purpose: Discover echoes
    // the search term back as an active-filter chip, so a bare text match
    // would find the query itself rather than a leaked result.
    await pageB.goto(`/discover?q=${encodeURIComponent(title)}`);
    await expect(pageB.locator('a[href*="/opportunities/"]', { hasText: title })).toHaveCount(0);
    await expect(pageB.getByText('Nothing matched')).toBeVisible();

    // And A's join has not consumed a spot in B's visible world.
    await pageB.goto(`/opportunities/${PIEDMONT_ID}`);
    await expect(pageB.getByRole('button', { name: 'Join', exact: true })).toBeVisible();
    await expect(pageB.getByText('20 of 25 available')).toBeVisible();

    // A still sees their own world intact.
    await pageA.goto(createdUrl);
    await expect(pageA.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  } finally {
    await deleteSession(request, idA);
    await deleteSession(request, idB);
    await ctxA.close();
    await ctxB.close();
  }
});

/*
 * A visitor can arrive on any of these by deep link, so the disclosures
 * have to be on the surfaces themselves — not only in the legal pages.
 * This checks they are present and reachable, not their wording.
 */
test('Demo disclosures and transparency pages are present and reachable', async ({
  page,
  request,
}) => {
  await freshSession(page);
  const id = await sessionId(page);

  try {
    // Opportunity detail says it is not a real event.
    await page.goto(`/opportunities/${PIEDMONT_ID}`);
    await expect(page.getByText('Demo listing.')).toBeVisible();
    await expect(page.getByText(/isn.t a real event/)).toBeVisible();

    // Fundraiser detail says no payment happens, above the Support control.
    const fundraisers = await request.get(
      'http://localhost:4000/api/v1/fundraisers?limit=1'
    );
    const fid = (await fundraisers.json()).fundraisers[0].id;
    await page.goto(`/fundraisers/${fid}`);
    await expect(page.getByText(/no payment is taken/)).toBeVisible();
    await expect(page.getByText(/no money moves, and no donation is made/)).toBeVisible();

    // The three transparency routes resolve as real pages.
    for (const [path, heading] of [
      ['/demo-info', 'About this demo'],
      ['/privacy', 'Privacy'],
      ['/terms', 'Terms & demo disclaimer'],
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    }

    // And they are reachable by clicking, not just by URL.
    await page.goto('/');
    await page.getByRole('link', { name: 'About this demo' }).first().click();
    await expect(page).toHaveURL(/\/demo-info$/);
  } finally {
    await deleteSession(request, id);
  }
});
