const CONFIG = require('../config');
const { ATLANTA_METRO_LOCATIONS, GEORGIA_LOCATIONS } = require('../data/content');
const { ANCHOR_OPPORTUNITIES, PHYSICAL_LOCATIONS } = require('../data/opportunities');

const UUID_V5_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ALLOWED_TYPES = new Set(['volunteer', 'charity_event']);
const ALLOWED_STATUSES = new Set(['published', 'cancelled']);
const ALLOWED_BUCKETS = new Set(['upcoming', 'recent_past', 'farther_future', 'cancelled']);
const ATLANTA_METRO_CITIES = new Set(ATLANTA_METRO_LOCATIONS.map((item) => item.city));
const OTHER_GEORGIA_CITIES = new Set(GEORGIA_LOCATIONS.map((item) => item.city));

function assert(condition, message) {
  if (!condition) throw new Error(`Seed validation failed: ${message}`);
}

function count(opportunities, predicate) {
  return opportunities.filter(predicate).length;
}

function assertCount(label, actual, expected) {
  assert(actual === expected, `${label} count is ${actual}; expected ${expected}`);
}

function timestamp(label, value) {
  const parsed = new Date(value).getTime();
  assert(Number.isFinite(parsed), `${label} has invalid timestamp: ${value}`);
  return parsed;
}

function nonblank(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function expectedRegion(city) {
  if (ATLANTA_METRO_CITIES.has(city)) return 'atlanta_metro';
  if (OTHER_GEORGIA_CITIES.has(city)) return 'other_georgia';
  return null;
}

function calendarDateAtOffset(dayOffset) {
  const date = new Date(`${CONFIG.anchorDate.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function calendarDate(timestampValue) {
  return new Date(timestampValue).toISOString().slice(0, 10);
}

function nthSunday(year, monthIndex, occurrence) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const firstSunday = 1 + ((7 - first.getUTCDay()) % 7);
  return firstSunday + (occurrence - 1) * 7;
}

function easternOffsetForDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const dstStart = `${year}-03-${String(nthSunday(year, 2, 2)).padStart(2, '0')}`;
  const dstEnd = `${year}-11-${String(nthSunday(year, 10, 1)).padStart(2, '0')}`;
  const current = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return current >= dstStart && current < dstEnd ? '-04:00' : '-05:00';
}

function expectedAnchorStart(specification) {
  const dateString = calendarDateAtOffset(specification.dayOffset);
  return new Date(
    `${dateString}T${specification.startTime}:00${easternOffsetForDate(dateString)}`
  ).toISOString();
}

function validateTimeBucket(opportunity, startsAt, endsAt, anchor) {
  const startDate = calendarDate(startsAt);
  const endDate = calendarDate(endsAt);

  if (opportunity.timeBucket === 'upcoming') {
    assert(opportunity.status === 'published', `${opportunity.id} upcoming must be published`);
    assert(startsAt > anchor, `${opportunity.id} upcoming does not start after anchor`);
    assert(startDate <= calendarDateAtOffset(90), `${opportunity.id} upcoming starts after 90 days`);
  } else if (opportunity.timeBucket === 'recent_past') {
    assert(opportunity.status === 'published', `${opportunity.id} recent past must be published`);
    assert(endsAt < anchor, `${opportunity.id} recent past does not end before anchor`);
    assert(endDate >= calendarDateAtOffset(-180), `${opportunity.id} recent past is older than 180 days`);
  } else if (opportunity.timeBucket === 'farther_future') {
    assert(opportunity.status === 'published', `${opportunity.id} farther future must be published`);
    assert(startDate > calendarDateAtOffset(90), `${opportunity.id} farther future starts within 90 days`);
    assert(startDate <= calendarDateAtOffset(180), `${opportunity.id} farther future starts after 180 days`);
  } else {
    assert(opportunity.status === 'cancelled', `${opportunity.id} cancelled bucket must be cancelled`);
    assert(
      startDate >= calendarDateAtOffset(-180) && startDate <= calendarDateAtOffset(180),
      `${opportunity.id} cancelled schedule falls outside the demo period`
    );
  }
}

function validateRequiredAnchors(world, causeById, userById, organizationById) {
  const locationByKey = new Map(PHYSICAL_LOCATIONS.map((location) => [location.key, location]));

  for (const specification of ANCHOR_OPPORTUNITIES) {
    const matches = world.opportunities.filter(
      (opportunity) => opportunity.anchorKey === specification.key
    );
    assert(matches.length === 1, `required anchor opportunity ${specification.key} is missing or duplicated`);
    const opportunity = matches[0];
    const hostName = opportunity.hostUserId
      ? userById.get(opportunity.hostUserId).displayName
      : organizationById.get(opportunity.hostOrganizationId).name;
    assert(opportunity.title === specification.title, `${specification.key} title changed`);
    assert(hostName === (specification.hostUser || specification.hostOrganization), `${specification.key} host changed`);
    assert(causeById.get(opportunity.causeId).name === specification.cause, `${specification.key} cause changed`);
    assert(opportunity.opportunityType === specification.type, `${specification.key} type changed`);
    assert(opportunity.status === 'published', `${specification.key} must be published`);
    assert(opportunity.timeBucket === 'upcoming', `${specification.key} must be upcoming`);
    assert(
      opportunity.startsAt === expectedAnchorStart(specification),
      `${specification.key} scheduled start changed`
    );
    const expectedLocation = locationByKey.get(specification.locationKey);
    assert(expectedLocation, `${specification.key} authored location is missing`);
    assert(!opportunity.isOnline, `${specification.key} must remain physical`);
    assert(opportunity.locationName === expectedLocation.name, `${specification.key} location name changed`);
    assert(opportunity.city === expectedLocation.city, `${specification.key} city changed`);
    assert(opportunity.state === expectedLocation.state, `${specification.key} state changed`);
    assert(opportunity.latitude === expectedLocation.latitude, `${specification.key} latitude changed`);
    assert(opportunity.longitude === expectedLocation.longitude, `${specification.key} longitude changed`);
    assert(
      (new Date(opportunity.endsAt) - new Date(opportunity.startsAt)) / 60000
        === specification.duration,
      `${specification.key} duration changed`
    );
    assert(opportunity.capacity === specification.capacity, `${specification.key} capacity changed`);
  }

  const flagships = world.opportunities.filter((opportunity) => opportunity.flagship);
  assert(flagships.length === 1, 'exactly one flagship opportunity is required');
  const flagship = flagships[0];
  assert(flagship.anchorKey === 'riverlight-flagship-cleanup', 'Riverlight flagship is missing');
  assert(!flagship.isOnline && flagship.city === 'Atlanta', 'Riverlight flagship must be physical in Atlanta');
  assert(flagship.capacity === 25, 'Riverlight flagship capacity must remain 25');
  assert(
    (new Date(flagship.endsAt) - new Date(flagship.startsAt)) / 60000 === 180,
    'Riverlight flagship must remain three hours'
  );

  const david = world.opportunities.filter((opportunity) => opportunity.davidAnchor);
  assert(david.length === 1, 'exactly one David Mercer anchor opportunity is required');
  assert(david[0].hostUserId, 'David Mercer anchor must be user hosted');
  assert(userById.get(david[0].hostUserId).displayName === 'David Mercer', 'David anchor host changed');
  assert(causeById.get(david[0].causeId).name === 'Community', 'David anchor cause changed');
}

function validateOpportunities(world) {
  const opportunities = world.opportunities;
  const targets = CONFIG.opportunityTargets;
  const anchor = timestamp('configured anchor', CONFIG.anchorDate);
  const causeById = new Map(world.causes.map((cause) => [cause.id, cause]));
  const userById = new Map(world.users.map((user) => [user.id, user]));
  const organizationById = new Map(
    world.organizations.map((organization) => [organization.id, organization])
  );

  assertCount('opportunities', opportunities.length, CONFIG.counts.opportunities);
  assertCount(
    'organization-hosted opportunities',
    count(opportunities, (item) => item.hostOrganizationId !== null),
    targets.hosts.organization
  );
  assertCount(
    'user-hosted opportunities',
    count(opportunities, (item) => item.hostUserId !== null),
    targets.hosts.user
  );
  assertCount(
    'volunteer opportunities',
    count(opportunities, (item) => item.opportunityType === 'volunteer'),
    targets.types.volunteer
  );
  assertCount(
    'charity-event opportunities',
    count(opportunities, (item) => item.opportunityType === 'charity_event'),
    targets.types.charityEvent
  );
  assertCount('upcoming opportunities', count(opportunities, (item) => item.timeBucket === 'upcoming'), targets.time.upcoming);
  assertCount('recent-past opportunities', count(opportunities, (item) => item.timeBucket === 'recent_past'), targets.time.recentPast);
  assertCount('farther-future opportunities', count(opportunities, (item) => item.timeBucket === 'farther_future'), targets.time.fartherFuture);
  assertCount('cancelled opportunities', count(opportunities, (item) => item.timeBucket === 'cancelled'), targets.time.cancelled);
  assertCount('online opportunities', count(opportunities, (item) => item.isOnline), targets.geography.online);
  assertCount('physical opportunities', count(opportunities, (item) => !item.isOnline), targets.geography.physical);
  assertCount(
    'Atlanta-metro physical opportunities',
    count(opportunities, (item) => item.geography === 'atlanta_metro'),
    targets.geography.atlantaMetroPhysical
  );
  assertCount(
    'other-Georgia physical opportunities',
    count(opportunities, (item) => item.geography === 'other_georgia'),
    targets.geography.otherGeorgiaPhysical
  );

  const seenIds = new Set();
  for (const opportunity of opportunities) {
    assert(UUID_V5_PATTERN.test(opportunity.id), `opportunity has invalid UUIDv5: ${opportunity.id}`);
    assert(!seenIds.has(opportunity.id), `duplicate opportunity ID: ${opportunity.id}`);
    seenIds.add(opportunity.id);

    const cause = causeById.get(opportunity.causeId);
    assert(cause, `${opportunity.id} references missing cause ${opportunity.causeId}`);
    const hasUserHost = opportunity.hostUserId !== null;
    const hasOrganizationHost = opportunity.hostOrganizationId !== null;
    assert(hasUserHost !== hasOrganizationHost, `${opportunity.id} must have exactly one host`);
    const host = hasUserHost
      ? userById.get(opportunity.hostUserId)
      : organizationById.get(opportunity.hostOrganizationId);
    assert(host, `${opportunity.id} references a missing host`);
    assert(host.causes.includes(cause.name), `${opportunity.id} cause is not declared by its host`);

    assert(ALLOWED_TYPES.has(opportunity.opportunityType), `${opportunity.id} has invalid opportunity type`);
    assert(ALLOWED_STATUSES.has(opportunity.status), `${opportunity.id} has invalid status`);
    assert(ALLOWED_BUCKETS.has(opportunity.timeBucket), `${opportunity.id} has invalid time bucket`);
    assert(nonblank(opportunity.title), `${opportunity.id} has blank title`);
    assert(nonblank(opportunity.description), `${opportunity.id} has blank description`);
    assert(nonblank(opportunity.whatYoullDo), `${opportunity.id} has blank volunteer instructions`);
    assert(nonblank(opportunity.requirements), `${opportunity.id} has blank requirements`);
    assert(nonblank(opportunity.imageUrl), `${opportunity.id} has blank image reference`);
    assert(Number.isInteger(opportunity.capacity) && opportunity.capacity > 0, `${opportunity.id} has invalid capacity`);
    assert(!Object.hasOwn(opportunity, 'participantCount'), `${opportunity.id} fabricates participant count`);
    assert(!Object.hasOwn(opportunity, 'attendees'), `${opportunity.id} fabricates attendees`);

    const startsAt = timestamp(`${opportunity.id} start`, opportunity.startsAt);
    const endsAt = timestamp(`${opportunity.id} end`, opportunity.endsAt);
    const createdAt = timestamp(`${opportunity.id} creation`, opportunity.createdAt);
    const hostCreatedAt = timestamp(`${opportunity.id} host creation`, host.createdAt);
    assert(endsAt > startsAt, `${opportunity.id} does not end after it starts`);
    assert(createdAt >= hostCreatedAt, `${opportunity.id} was created before its host existed`);
    assert(createdAt < startsAt, `${opportunity.id} was not created before it starts`);
    assert(createdAt <= anchor, `${opportunity.id} was created after the anchor snapshot`);
    validateTimeBucket(opportunity, startsAt, endsAt, anchor);

    if (opportunity.isOnline) {
      assert(opportunity.geography === 'online', `${opportunity.id} online geography is incoherent`);
      for (const field of ['locationName', 'city', 'state', 'latitude', 'longitude']) {
        assert(opportunity[field] === null, `${opportunity.id} online opportunity has physical ${field}`);
      }
    } else {
      assert(nonblank(opportunity.locationName), `${opportunity.id} physical location name is missing`);
      assert(nonblank(opportunity.city), `${opportunity.id} physical city is missing`);
      assert(opportunity.state === 'GA', `${opportunity.id} physical state must be GA`);
      assert(Number.isFinite(opportunity.latitude), `${opportunity.id} latitude is missing`);
      assert(Number.isFinite(opportunity.longitude), `${opportunity.id} longitude is missing`);
      assert(opportunity.latitude >= -90 && opportunity.latitude <= 90, `${opportunity.id} latitude is out of range`);
      assert(opportunity.longitude >= -180 && opportunity.longitude <= 180, `${opportunity.id} longitude is out of range`);
      const region = expectedRegion(opportunity.city);
      assert(region, `${opportunity.id} physical city is outside configured geography`);
      assert(opportunity.geography === region, `${opportunity.id} physical geography classification is wrong`);
      assert(regionForHost(host) === region, `${opportunity.id} physical region is incoherent with its host`);
    }
  }

  assert(new Set(opportunities.map((item) => item.title)).size >= 100, 'opportunity title variety is too low');
  assert(new Set(opportunities.map((item) => item.description)).size >= 60, 'opportunity description variety is too low');
  validateRequiredAnchors(world, causeById, userById, organizationById);
  return true;
}

function regionForHost(host) {
  if (ATLANTA_METRO_CITIES.has(host.city)) return 'atlanta_metro';
  if (OTHER_GEORGIA_CITIES.has(host.city)) return 'other_georgia';
  return null;
}

module.exports = { validateOpportunities };
