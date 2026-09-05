const CONFIG = require('../config');

/*
 * Temporal invariants for the refreshed synthetic world.
 *
 * These exist because the world's calendar position is now configurable. The
 * per-milestone validators already check their own tables in depth; this file
 * checks the things that only break when WORLD_REFERENCE_DATE moves —
 * cross-table chronology, the flagship's recruiter window, and whether the
 * marketplace is still dense enough around the new reference date.
 *
 * Deliberately not a temporal framework: every assertion below corresponds to
 * a state the product would visibly get wrong.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function assert(condition, message) {
  if (!condition) throw new Error(`Temporal validation failed: ${message}`);
}

function referenceInstant() {
  return new Date(CONFIG.anchorDate).getTime();
}

function atlantaWeekday(value) {
  return new Date(value).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: CONFIG.worldTimezone,
  });
}

function validateReferenceDate() {
  const reference = referenceInstant();
  assert(Number.isFinite(reference), 'WORLD_REFERENCE_DATE did not resolve to a real instant');

  // The configured calendar day must survive conversion — this is the exact
  // failure a bare YYYY-MM-DD parsed as UTC would cause.
  const localDate = new Date(reference).toLocaleDateString('en-CA', {
    timeZone: CONFIG.worldTimezone,
  });
  assert(localDate === CONFIG.worldReferenceDate,
    `reference instant resolves to ${localDate} in Atlanta, expected ${CONFIG.worldReferenceDate}`);
}

function validateOpportunityChronology(world) {
  for (const opportunity of world.opportunities) {
    assert(new Date(opportunity.endsAt) > new Date(opportunity.startsAt),
      `opportunity ${opportunity.id} ends before it starts`);
    assert(new Date(opportunity.createdAt) <= new Date(opportunity.startsAt),
      `opportunity ${opportunity.id} was created after it starts`);
  }
}

/*
 * The flagship carries the recruiter journey. If it expires, the demo's
 * headline path (discover -> join -> participate) dies with it.
 */
function validateFlagship(world) {
  const reference = referenceInstant();
  const flagship = world.opportunities.find((item) => item.flagship);
  assert(flagship, 'flagship opportunity is missing');
  assert(flagship.id === 'bc09559d-77de-5bde-b248-00a1480d6d94',
    `flagship identity changed to ${flagship.id}`);

  const daysOut = (new Date(flagship.startsAt).getTime() - reference) / DAY_MS;
  assert(daysOut > 0, 'flagship is not in the future');
  assert(daysOut >= 21 && daysOut <= 42,
    `flagship is ${daysOut.toFixed(1)} days out, outside the 3-6 week window`);
  assert(atlantaWeekday(flagship.startsAt) === 'Saturday',
    `flagship falls on ${atlantaWeekday(flagship.startsAt)}, not Saturday`);
  assert(flagship.status === 'published', 'flagship must be published');
  assert(!flagship.isOnline, 'flagship must remain a physical Atlanta opportunity');

  const joined = world.registrations.filter(
    (row) => row.opportunityId === flagship.id && row.status === 'joined'
  );
  assert(flagship.capacity === 25, `flagship capacity is ${flagship.capacity}, expected 25`);
  assert(joined.length === 5, `flagship has ${joined.length} joined, expected 5`);

  const maya = world.users.find((user) => user.displayName === 'Maya Ellis');
  assert(joined.some((row) => row.userId === maya.id),
    'Maya Ellis is no longer joined to the flagship');
}

/*
 * A technically-valid world can still be a useless one. Discover's landing
 * sections need real inventory, so density is asserted rather than assumed.
 */
function validateMarketplaceDensity(world) {
  const reference = referenceInstant();
  const upcoming = world.opportunities.filter(
    (item) => item.status === 'published' && new Date(item.startsAt).getTime() > reference
  );
  const within = (days) => upcoming.filter(
    (item) => (new Date(item.startsAt).getTime() - reference) / DAY_MS <= days
  ).length;

  assert(upcoming.length >= 500,
    `only ${upcoming.length} upcoming opportunities; marketplace is too thin`);
  assert(within(7) >= 25, `only ${within(7)} opportunities in the next 7 days`);
  assert(within(30) >= 150, `only ${within(30)} opportunities in the next 30 days`);

  // Kynd must still contain a believable past, not only future events.
  const past = world.opportunities.filter(
    (item) => new Date(item.startsAt).getTime() <= reference
  );
  assert(past.length >= 200, `only ${past.length} past opportunities; the world has no history`);

  // Discover's "Happening this weekend" needs the coming weekend populated.
  const weekend = upcoming.filter((item) => {
    const weekday = atlantaWeekday(item.startsAt);
    const daysOut = (new Date(item.startsAt).getTime() - reference) / DAY_MS;
    return daysOut <= 8 && (weekday === 'Saturday' || weekday === 'Sunday');
  });
  assert(weekend.length >= 5,
    `only ${weekend.length} opportunities on the coming weekend`);
}

/*
 * Activities are completed contribution history. None may sit in the world's
 * future, and a Kynd-linked activity may not predate the opportunity it came
 * from.
 */
function validateActivityChronology(world) {
  const reference = referenceInstant();
  const opportunityById = new Map(world.opportunities.map((item) => [item.id, item]));
  const registrationById = new Map(world.registrations.map((row) => [row.id, row]));

  for (const activity of world.activities) {
    const occurred = new Date(`${activity.occurredOn}T12:00:00Z`).getTime();
    assert(occurred <= reference + DAY_MS,
      `activity ${activity.id} occurs in the synthetic future`);
    assert(new Date(activity.createdAt).getTime() >= occurred - DAY_MS,
      `activity ${activity.id} was recorded before it happened`);

    if (!activity.registrationId) continue;
    const registration = registrationById.get(activity.registrationId);
    assert(registration, `activity ${activity.id} references a missing registration`);
    const opportunity = opportunityById.get(registration.opportunityId);
    assert(opportunity, `activity ${activity.id} references a missing opportunity`);
    assert(new Date(activity.createdAt) >= new Date(opportunity.endsAt),
      `activity ${activity.id} was confirmed before its opportunity ended`);
  }
}

function validateParticipationChronology(world) {
  const opportunityById = new Map(world.opportunities.map((item) => [item.id, item]));
  const joinedByOpportunity = new Map();

  for (const registration of world.registrations) {
    const opportunity = opportunityById.get(registration.opportunityId);
    assert(opportunity, `registration ${registration.id} references a missing opportunity`);
    if (registration.status !== 'joined') continue;
    joinedByOpportunity.set(
      opportunity.id,
      (joinedByOpportunity.get(opportunity.id) || 0) + 1
    );
  }

  for (const [opportunityId, joined] of joinedByOpportunity) {
    const opportunity = opportunityById.get(opportunityId);
    assert(joined <= opportunity.capacity,
      `opportunity ${opportunityId} has ${joined} joined over capacity ${opportunity.capacity}`);
  }

  for (const saved of world.savedOpportunities) {
    const opportunity = opportunityById.get(saved.opportunityId);
    assert(new Date(saved.savedAt) >= new Date(opportunity.createdAt),
      `saved opportunity ${saved.opportunityId} predates the opportunity`);
    assert(new Date(saved.savedAt) < new Date(opportunity.startsAt),
      `saved opportunity ${saved.opportunityId} was saved after it started`);
  }
}

function validateFundraiserChronology(world) {
  const fundraiserById = new Map(world.fundraisers.map((item) => [item.id, item]));

  for (const fundraiser of world.fundraisers) {
    assert(fundraiser.endDate >= new Date(fundraiser.createdAt).toISOString().slice(0, 10),
      `fundraiser ${fundraiser.id} ends before it was created`);
  }

  for (const support of world.fundraiserSupports) {
    const fundraiser = fundraiserById.get(support.fundraiserId);
    assert(fundraiser, `support ${support.id} references a missing fundraiser`);
    assert(new Date(support.supportedAt) >= new Date(fundraiser.createdAt),
      `support ${support.id} predates its fundraiser`);
  }
}

// Social engagement amplifies existing content; it can never predate it.
function validateSocialChronology(world) {
  const createdById = new Map();
  for (const collection of ['activities', 'opportunities', 'fundraisers']) {
    for (const row of world[collection]) createdById.set(row.id, row.createdAt);
  }

  // A reaction/comment points at exactly one of these three columns.
  for (const collection of ['reactions', 'comments']) {
    for (const row of world[collection]) {
      const targetId = row.activityId || row.opportunityId || row.fundraiserId;
      assert(targetId, `${collection.slice(0, -1)} ${row.id} has no target`);
      const targetCreatedAt = createdById.get(targetId);
      assert(targetCreatedAt, `${collection.slice(0, -1)} ${row.id} targets missing content`);
      assert(new Date(row.createdAt) >= new Date(targetCreatedAt),
        `${collection.slice(0, -1)} ${row.id} predates the content it targets`);
    }
  }
}

function validateTemporalWorld(world) {
  validateReferenceDate();
  validateOpportunityChronology(world);
  validateFlagship(world);
  validateMarketplaceDensity(world);
  validateActivityChronology(world);
  validateParticipationChronology(world);
  validateFundraiserChronology(world);
  validateSocialChronology(world);
}

module.exports = { validateTemporalWorld };
