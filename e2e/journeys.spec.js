'use strict';

const { test, expect } = require('@playwright/test');
const {
  freshSession,
  sessionId,
  deleteSession,
  futureOpportunity,
  openFundraiser,
  profileMetric,
  gotoTab,
  dateOffset,
} = require('./support');

/*
 * The other journeys worth proving through a browser.
 *
 * Each one exists because it crosses surfaces — a write on one page has to
 * show up correctly on another. Rules that live entirely inside one request
 * are already covered by the backend suite and are deliberately not
 * repeated here.
 */

let id;
test.afterEach(async ({ request }) => {
  await deleteSession(request, id);
  id = null;
});

test('Leave and rejoin: Join returns, and Upcoming follows both ways', async ({ page, request }) => {
  const opportunity = await futureOpportunity(request);
  await freshSession(page);
  id = await sessionId(page);

  await page.goto(`/opportunities/${opportunity.id}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('Joined', { exact: true })).toBeVisible();

  await page.goto('/activity');
  await expect(page.getByText(opportunity.title).first()).toBeVisible();

  // Leave from the detail page, through its confirmation.
  await page.goto(`/opportunities/${opportunity.id}`);
  await page.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Yes, leave' }).click();

  // Join is genuinely available again — not a relabelled Joined state.
  await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeVisible();
  await expect(page.getByText('Joined', { exact: true })).toHaveCount(0);

  await page.goto('/activity');
  await expect(page.getByText(opportunity.title)).toHaveCount(0);

  // Rejoin restores it.
  await page.goto(`/opportunities/${opportunity.id}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('Joined', { exact: true })).toBeVisible();

  await page.goto('/activity');
  await expect(page.getByText(opportunity.title).first()).toBeVisible();
});

test('Manual activity: logged contribution reaches Completed and the profile', async ({ page }) => {
  await freshSession(page);
  id = await sessionId(page);

  await page.goto('/create');
  await page.getByRole('link', { name: /Log activity/ }).click();

  // Scoped to the form: the right rail is a landmark named "Browse by
  // cause", which getByLabel would otherwise also match.
  const form = page.locator('form');
  await form.getByLabel('What did you do?').fill('Saturday shift at the pantry');
  await form.getByLabel('Organization').fill('Westside Neighborhood Pantry');
  await form.getByLabel('Cause').selectOption('Food & Hunger');
  await form.getByLabel('Date').fill(dateOffset(-7));
  await form.getByLabel('Hours').fill('2');
  await page.getByRole('button', { name: 'Add to Kynd' }).click();

  // Lands on the history it just became part of.
  await expect(page).toHaveURL(/\/activity$/);
  await expect(page.getByText('Saturday shift at the pantry')).toBeVisible();
  // Self-reported contribution is labelled honestly.
  await expect(page.getByText('Logged by you')).toBeVisible();

  await page.goto('/profile');
  expect(await profileMetric(page, 'Hours')).toBe('2');
  expect(await profileMetric(page, 'Activities')).toBe('1');
  expect(await profileMetric(page, 'Organizations')).toBe('1');
});

test('Create opportunity: publishes, hosts as Frank, and is findable in Discover', async ({
  page,
}) => {
  await freshSession(page);
  id = await sessionId(page);

  const title = `E2E Creek Cleanup ${Date.now()}`;

  await page.goto('/create');
  await page.getByRole('link', { name: /Create an opportunity/ }).click();

  const form = page.locator('form');
  await form.getByLabel('Title').fill(title);
  await form.getByLabel('Cause').selectOption('Environment');
  await form.getByLabel('Description').fill('A morning clearing litter along the creek path.');
  await form.getByLabel('Date').fill(dateOffset(21));
  await form.getByLabel('Starts').fill('09:00');
  await form.getByLabel('Ends').fill('12:00');
  await form.getByLabel('Location', { exact: true }).fill('South Fork Creek Trailhead');
  await page.getByRole('button', { name: 'Publish' }).click();

  // Straight to the real thing that now exists.
  await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText('Frank Enstien')).toBeVisible();
  await expect(page.getByText('Community member')).toBeVisible();

  // And it is genuinely in Discover's index, not just at its own URL.
  await page.goto(`/discover?q=${encodeURIComponent(title)}`);
  await expect(page.getByText(title).first()).toBeVisible();
});

test('Fundraiser: simulated support moves derived progress, and one can be created', async ({
  page,
  request,
}) => {
  const fundraiser = await openFundraiser(request);
  await freshSession(page);
  id = await sessionId(page);

  await page.goto(`/fundraisers/${fundraiser.id}`);
  await expect(page.getByRole('heading', { name: fundraiser.title, level: 1 })).toBeVisible();

  // The no-payment disclosure sits right above the action.
  await expect(page.getByText(/Demo only .* no payment is taken/)).toBeVisible();

  const beforeSupporters = fundraiser.supporterCount;

  await page.getByRole('button', { name: '$25', exact: true }).click();
  await page.getByRole('button', { name: /Support with \$25/ }).click();

  // Support is one-time, so the control becomes a state.
  await expect(page.getByText('You supported this fundraiser')).toBeVisible();

  // Progress is derived and really moved.
  await expect(page.getByText(new RegExp(`${beforeSupporters + 1} supporters`))).toBeVisible();

  // Creating one produces a real detail page.
  const title = `E2E Coat Drive ${Date.now()}`;
  await page.goto('/create');
  await page.getByRole('link', { name: /Start a fundraiser/ }).click();
  const fundraiserForm = page.locator('form');
  await fundraiserForm.getByLabel('Title').fill(title);
  await fundraiserForm.getByLabel('Who does this benefit?').fill('Westside Family Shelter');
  await fundraiserForm.getByLabel('Cause').selectOption('Community');
  await fundraiserForm
    .getByLabel('Story')
    .fill('Warm coats for families across the west side this winter.');
  await fundraiserForm.getByLabel('Goal').fill('2500');
  await fundraiserForm.getByLabel('Ends on').fill(dateOffset(40));
  await page.getByRole('button', { name: 'Start fundraiser' }).click();

  await expect(page).toHaveURL(/\/fundraisers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText('$0')).toBeVisible();
  await expect(page.getByText('raised of $2,500')).toBeVisible();
});

test('Save, unsave, react and comment', async ({ page, request }) => {
  const opportunity = await futureOpportunity(request);
  await freshSession(page);
  id = await sessionId(page);

  await page.goto(`/opportunities/${opportunity.id}`);

  // --- Save ---
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();

  await page.goto('/activity');
  await gotoTab(page, 'Saved');
  await expect(page.getByText(opportunity.title).first()).toBeVisible();

  // --- Unsave, from the card in Saved ---
  await page.getByRole('button', { name: 'Saved' }).first().click();
  await expect(page.getByText(opportunity.title)).toHaveCount(0);
  await expect(page.getByText('Nothing saved')).toBeVisible();

  // --- React ---
  await page.goto(`/opportunities/${opportunity.id}`);
  const like = page.getByRole('button', { name: /^Like/ });
  await like.click();
  await expect(page.getByRole('button', { name: /^Liked/ })).toBeVisible();

  // --- Comment ---
  await page.getByRole('button', { name: /^Comment/ }).click();
  await page.getByLabel('Add a comment').fill('Looking forward to this one.');
  await page.getByRole('button', { name: 'Post' }).click();
  await expect(page.getByText('Looking forward to this one.')).toBeVisible();
  await expect(page.getByText('Frank Enstien').first()).toBeVisible();
});

test('Reset demo: a dirtied session returns to exact starter state', async ({ page, request }) => {
  const opportunity = await futureOpportunity(request);
  await freshSession(page);
  const dirtyId = await sessionId(page);

  // Dirty it across a few surfaces.
  await page.goto(`/opportunities/${opportunity.id}`);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('Joined', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();

  await page.goto('/activity');
  await expect(page.getByText(opportunity.title).first()).toBeVisible();

  // --- Reset, through the real control and its confirmation ---
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();

  // Lands on a clean Home.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();

  // A genuinely different session.
  const newId = await sessionId(page);
  expect(newId).not.toBe(dirtyId);
  id = newId;

  // Starter state restored, everything else zero.
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Frank Enstien', level: 1 })).toBeVisible();
  expect(await profileMetric(page, 'Hours')).toBe('0');
  expect(await profileMetric(page, 'Activities')).toBe('0');
  expect(await profileMetric(page, 'Organizations')).toBe('0');
  expect(await profileMetric(page, 'Raised')).toBe('$0');
  // The starter social graph is back: two seeded people followed.
  await expect(page.getByText('2 Following')).toBeVisible();

  await page.goto('/activity');
  await expect(page.getByText('Nothing upcoming yet')).toBeVisible();
  await gotoTab(page, 'Completed');
  await expect(page.getByText('No history yet')).toBeVisible();
  await gotoTab(page, 'Saved');
  await expect(page.getByText('Nothing saved')).toBeVisible();
});
