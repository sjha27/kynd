'use strict';

const { test, expect } = require('@playwright/test');
const {
  PIEDMONT_ID,
  PIEDMONT_TITLE,
  freshSession,
  sessionId,
  deleteSession,
  profileMetric,
  gotoTab,
} = require('./support');

/*
 * The single most important test in the project.
 *
 * It is the recruiter journey end to end: arrive with nothing, find the
 * flagship, join it, see it in Activity, complete it, and watch a real
 * contribution history and real profile metrics appear as a consequence.
 *
 * Everything it asserts is derived state. Nothing here would pass if the
 * feed, the registration, the activity, or the profile metrics were
 * frontend illusions.
 */
test.describe('Flagship recruiter journey', () => {
  let id;

  test.afterEach(async ({ request }) => {
    await deleteSession(request, id);
    id = null;
  });

  test('fresh visitor → Piedmont → Join → Complete → Profile reflects 3h / 1 activity / 1 organization', async ({
    page,
  }) => {
    // --- Arrive as someone brand new ---
    await freshSession(page);
    id = await sessionId(page);

    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();

    // Home is real, personalised content, and ends deliberately.
    await expect(page.getByText(/caught up with your community/)).toBeVisible();

    // --- Open the flagship ---
    // Reached by URL because Home's composition is ranked, not fixed; the
    // detail page is the thing under test here, not the feed's ordering.
    await page.goto(`/opportunities/${PIEDMONT_ID}`);
    await expect(page.getByRole('heading', { name: PIEDMONT_TITLE, level: 1 })).toBeVisible();

    // The demo disclosure a visitor must see before acting.
    await expect(page.getByText('Demo listing.')).toBeVisible();

    // Capacity is derived; capture it so the join can be proved against it.
    const spots = page.getByText(/\d+ of 25 available/);
    const beforeAvailable = parseInt((await spots.innerText()).match(/\d+/)[0], 10);

    // --- Join ---
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByText('Joined', { exact: true })).toBeVisible();

    // A real spot was consumed in this visitor's visible world.
    await page.reload();
    const afterAvailable = parseInt(
      (await page.getByText(/\d+ of 25 available/).innerText()).match(/\d+/)[0],
      10
    );
    expect(afterAvailable).toBe(beforeAvailable - 1);

    // --- Activity → Upcoming ---
    await page.goto('/activity');
    await gotoTab(page, 'Upcoming');
    await expect(page.getByText(PIEDMONT_TITLE)).toBeVisible();

    // --- Complete it through the clearly-labelled demo path ---
    await page.getByRole('button', { name: 'Demo: Mark as complete' }).click();
    await page.getByLabel('Hours').fill('3');
    await page.getByLabel('Story (optional)').fill('Picked up trash along the trail with the crew.');
    await page.getByRole('button', { name: 'Add to Kynd' }).click();

    // --- Activity → Completed ---
    await gotoTab(page, 'Completed');
    const completed = page.getByText(PIEDMONT_TITLE);
    await expect(completed).toBeVisible();
    await expect(page.getByText('3 hours')).toBeVisible();
    await expect(page.getByText('Picked up trash along the trail with the crew.')).toBeVisible();

    // It left Upcoming, because it is history now.
    await gotoTab(page, 'Upcoming');
    await expect(page.getByText(PIEDMONT_TITLE)).toHaveCount(0);

    // --- Profile ---
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Frank Enstien', level: 1 })).toBeVisible();

    expect(await profileMetric(page, 'Hours')).toBe('3');
    expect(await profileMetric(page, 'Activities')).toBe('1');
    expect(await profileMetric(page, 'Organizations')).toBe('1');
    expect(await profileMetric(page, 'Raised')).toBe('$0');

    // Impact History shows the contribution itself, hosted by the real org.
    await expect(page.getByRole('heading', { name: 'Impact History' })).toBeVisible();
    await expect(page.getByRole('link', { name: PIEDMONT_TITLE })).toBeVisible();
    await expect(page.getByText('Riverlight Atlanta').first()).toBeVisible();

    // --- Survives a reload: this is database state, not React state ---
    await page.reload();
    expect(await profileMetric(page, 'Hours')).toBe('3');
    expect(await profileMetric(page, 'Activities')).toBe('1');
  });
});
