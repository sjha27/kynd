const CONFIG = require('../config');
const { CAUSES } = require('../data/content');
const { validateOpportunities } = require('./validate_opportunities');

const UUID_V5_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function assert(condition, message) {
  if (!condition) throw new Error(`Seed validation failed: ${message}`);
}

function assertCount(label, actual, expected) {
  assert(actual === expected, `${label} count is ${actual}; expected ${expected}`);
}

function assertUnique(label, values) {
  const seen = new Set();
  for (const value of values) {
    assert(!seen.has(value), `duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function assertValidIds(label, entities) {
  for (const entity of entities) {
    assert(UUID_V5_PATTERN.test(entity.id), `${label} has invalid UUIDv5: ${entity.id}`);
  }
  assertUnique(`${label} ID`, entities.map((entity) => entity.id));
}

function timestampValue(label, timestamp) {
  const value = new Date(timestamp).getTime();
  assert(Number.isFinite(value), `${label} has invalid timestamp: ${timestamp}`);
  return value;
}

function assertTimestampRange(label, timestamp, earliest, latest) {
  const value = timestampValue(label, timestamp);
  assert(value >= timestampValue(`${label} lower bound`, earliest), `${label} predates creation`);
  assert(value <= timestampValue(`${label} upper bound`, latest), `${label} is after anchor date`);
}

function groupedRelationshipIds(rows, ownerKey, relatedKey) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row[ownerKey])) grouped.set(row[ownerKey], new Set());
    grouped.get(row[ownerKey]).add(row[relatedKey]);
  }
  return grouped;
}

function assertDeclaredCausesMatch(label, entities, relationships, ownerKey, timestampKey, causes) {
  const causeById = new Map(causes.map((cause) => [cause.id, cause]));
  const relationshipCauseIds = groupedRelationshipIds(relationships, ownerKey, 'causeId');

  for (const entity of entities) {
    const actualNames = [...(relationshipCauseIds.get(entity.id) || [])]
      .map((causeId) => {
        const cause = causeById.get(causeId);
        assert(cause, `${label} relationship references missing cause: ${causeId}`);
        return cause.name;
      })
      .sort();
    const declaredNames = [...entity.causes].sort();
    assert(
      JSON.stringify(actualNames) === JSON.stringify(declaredNames),
      `${label} cause rows do not match declared affinities for ${entity.id}`
    );
  }

  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  for (const relationship of relationships) {
    const entity = entityById.get(relationship[ownerKey]);
    assert(entity, `${label} relationship references missing entity: ${relationship[ownerKey]}`);
    assert(
      causeById.has(relationship.causeId),
      `${label} relationship references missing cause: ${relationship.causeId}`
    );
    assertTimestampRange(
      `${label} relationship ${relationship[ownerKey]}|${relationship.causeId}`,
      relationship[timestampKey],
      entity.createdAt,
      CONFIG.anchorDate
    );
  }
}

function assertRequiredUserFollow(world, followerName, followedName) {
  const follower = world.users.find((user) => user.displayName === followerName);
  const followed = world.users.find((user) => user.displayName === followedName);
  assert(follower, `missing required user ${followerName}`);
  assert(followed, `missing required user ${followedName}`);
  assert(
    world.userFollows.some((row) => (
      row.followerUserId === follower.id && row.followedUserId === followed.id
    )),
    `missing required follow: ${followerName} -> ${followedName}`
  );
}

function assertRequiredOrganizationFollows(world, userName, organizationNames) {
  const user = world.users.find((candidate) => candidate.displayName === userName);
  assert(user, `missing required user ${userName}`);
  for (const organizationName of organizationNames) {
    const organization = world.organizations.find(
      (candidate) => candidate.name === organizationName
    );
    assert(organization, `missing required organization ${organizationName}`);
    assert(
      world.organizationFollows.some((row) => (
        row.userId === user.id && row.organizationId === organization.id
      )),
      `missing required organization follow: ${userName} -> ${organizationName}`
    );
  }
}

function validateWorld(world) {
  assert(world && typeof world === 'object', 'world must be an object');
  for (const collection of [
    'causes', 'users', 'organizations', 'userCauses',
    'organizationCauses', 'userFollows', 'organizationFollows', 'opportunities',
  ]) {
    assert(Array.isArray(world[collection]), `${collection} must be an array`);
  }

  assert(world.metadata.seed === CONFIG.seed, 'metadata seed does not match configuration');
  assert(
    world.metadata.anchorDate === CONFIG.anchorDate,
    'metadata anchor date does not match configuration'
  );
  assertCount('causes', world.causes.length, CAUSES.length);
  assertCount('users', world.users.length, CONFIG.counts.users);
  assertCount('organizations', world.organizations.length, CONFIG.counts.organizations);
  assertCount('user follows', world.userFollows.length, CONFIG.counts.userFollows);
  assertCount(
    'organization follows',
    world.organizationFollows.length,
    CONFIG.counts.organizationFollows
  );

  assertValidIds('cause', world.causes);
  assertValidIds('user', world.users);
  assertValidIds('organization', world.organizations);
  assertUnique('cause name', world.causes.map((cause) => cause.name));
  assert(
    JSON.stringify(world.causes.map((cause) => cause.name)) === JSON.stringify(CAUSES),
    'generated causes do not match the expected cause list and order'
  );

  const expectedUserCauseCount = world.users.reduce(
    (sum, user) => sum + user.causes.length,
    0
  );
  const expectedOrganizationCauseCount = world.organizations.reduce(
    (sum, organization) => sum + organization.causes.length,
    0
  );
  assertCount('user causes', world.userCauses.length, expectedUserCauseCount);
  assertCount(
    'organization causes',
    world.organizationCauses.length,
    expectedOrganizationCauseCount
  );
  assertUnique(
    'user-cause relationship',
    world.userCauses.map((row) => `${row.userId}|${row.causeId}`)
  );
  assertUnique(
    'organization-cause relationship',
    world.organizationCauses.map((row) => `${row.organizationId}|${row.causeId}`)
  );
  assertDeclaredCausesMatch(
    'user', world.users, world.userCauses, 'userId', 'selectedAt', world.causes
  );
  assertDeclaredCausesMatch(
    'organization',
    world.organizations,
    world.organizationCauses,
    'organizationId',
    'createdAt',
    world.causes
  );

  const userById = new Map(world.users.map((user) => [user.id, user]));
  const organizationById = new Map(
    world.organizations.map((organization) => [organization.id, organization])
  );
  assertUnique(
    'user follow',
    world.userFollows.map((row) => `${row.followerUserId}|${row.followedUserId}`)
  );
  for (const relationship of world.userFollows) {
    const follower = userById.get(relationship.followerUserId);
    const followed = userById.get(relationship.followedUserId);
    assert(follower, `user follow references missing follower: ${relationship.followerUserId}`);
    assert(followed, `user follow references missing followed user: ${relationship.followedUserId}`);
    assert(follower.id !== followed.id, `self-follow found for user ${follower.id}`);
    assertTimestampRange(
      `user follow ${follower.id}|${followed.id}`,
      relationship.createdAt,
      new Date(Math.max(
        timestampValue('follower creation', follower.createdAt),
        timestampValue('followed creation', followed.createdAt)
      )).toISOString(),
      CONFIG.anchorDate
    );
  }

  assertUnique(
    'organization follow',
    world.organizationFollows.map((row) => `${row.userId}|${row.organizationId}`)
  );
  for (const relationship of world.organizationFollows) {
    const user = userById.get(relationship.userId);
    const organization = organizationById.get(relationship.organizationId);
    assert(user, `organization follow references missing user: ${relationship.userId}`);
    assert(
      organization,
      `organization follow references missing organization: ${relationship.organizationId}`
    );
    assertTimestampRange(
      `organization follow ${user.id}|${organization.id}`,
      relationship.createdAt,
      new Date(Math.max(
        timestampValue('user creation', user.createdAt),
        timestampValue('organization creation', organization.createdAt)
      )).toISOString(),
      CONFIG.anchorDate
    );
  }

  for (const entity of [...world.users, ...world.organizations]) {
    assertTimestampRange(
      `entity creation ${entity.id}`,
      entity.createdAt,
      entity.createdAt,
      CONFIG.anchorDate
    );
    assert(entity.causes.length > 0, `entity ${entity.id} has no declared causes`);
    assertUnique(`declared cause for entity ${entity.id}`, entity.causes);
    for (const causeName of entity.causes) {
      assert(CAUSES.includes(causeName), `entity ${entity.id} declares unknown cause ${causeName}`);
    }
  }

  assertRequiredUserFollow(world, 'Maya Ellis', 'David Mercer');
  assertRequiredUserFollow(world, 'David Mercer', 'Maya Ellis');
  assertRequiredOrganizationFollows(world, 'Maya Ellis', [
    'Mosaic Meals Collective', 'Riverlight Atlanta', 'Community Roots Atlanta',
  ]);
  assertRequiredOrganizationFollows(world, 'David Mercer', [
    'Community Roots Atlanta', 'Bright Futures Lab',
    'Northstar Veterans Network', 'Bridgeway Youth Collaborative',
  ]);

  validateOpportunities(world);

  return true;
}

module.exports = { validateWorld };
