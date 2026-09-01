const BATCH_SIZE = 250;

const TABLE_MAPPINGS = Object.freeze([
  {
    table: 'causes',
    collection: 'causes',
    columns: ['id', 'name', 'sort_order'],
    values: (row) => [row.id, row.name, row.sortOrder],
  },
  {
    table: 'organizations',
    collection: 'organizations',
    columns: [
      'id', 'name', 'mission', 'logo_url', 'city', 'state',
      'is_verified_demo', 'created_at',
    ],
    values: (row) => [
      row.id, row.name, row.mission, row.logoUrl, row.city, row.state,
      row.isVerifiedDemo, row.createdAt,
    ],
  },
  {
    table: 'users',
    collection: 'users',
    columns: [
      'id', 'demo_session_id', 'display_name', 'avatar_url', 'bio',
      'city', 'state', 'created_at',
    ],
    values: (row) => [
      row.id, null, row.displayName, row.avatarUrl, row.bio,
      row.city, row.state, row.createdAt,
    ],
  },
  {
    table: 'user_causes',
    collection: 'userCauses',
    columns: ['user_id', 'cause_id', 'selected_at'],
    values: (row) => [row.userId, row.causeId, row.selectedAt],
  },
  {
    table: 'organization_causes',
    collection: 'organizationCauses',
    columns: ['organization_id', 'cause_id', 'created_at'],
    values: (row) => [row.organizationId, row.causeId, row.createdAt],
  },
  {
    table: 'user_follows',
    collection: 'userFollows',
    columns: ['follower_user_id', 'followed_user_id', 'created_at'],
    values: (row) => [row.followerUserId, row.followedUserId, row.createdAt],
  },
  {
    table: 'organization_follows',
    collection: 'organizationFollows',
    columns: ['user_id', 'organization_id', 'created_at'],
    values: (row) => [row.userId, row.organizationId, row.createdAt],
  },
  {
    table: 'opportunities',
    collection: 'opportunities',
    columns: [
      'id', 'title', 'opportunity_type', 'cause_id', 'host_user_id',
      'host_organization_id', 'description', 'what_youll_do', 'requirements',
      'starts_at', 'ends_at', 'is_online', 'location_name', 'city', 'state',
      'latitude', 'longitude', 'capacity', 'image_url', 'status', 'created_at',
    ],
    values: (row) => [
      row.id, row.title, row.opportunityType, row.causeId, row.hostUserId,
      row.hostOrganizationId, row.description, row.whatYoullDo, row.requirements,
      row.startsAt, row.endsAt, row.isOnline, row.locationName, row.city, row.state,
      row.latitude, row.longitude, row.capacity, row.imageUrl, row.status, row.createdAt,
    ],
  },
  {
    table: 'registrations',
    collection: 'registrations',
    columns: ['id', 'user_id', 'opportunity_id', 'status', 'joined_at', 'cancelled_at'],
    values: (row) => [
      row.id, row.userId, row.opportunityId, row.status, row.joinedAt, row.cancelledAt,
    ],
  },
  {
    table: 'saved_opportunities',
    collection: 'savedOpportunities',
    columns: ['user_id', 'opportunity_id', 'saved_at'],
    values: (row) => [row.userId, row.opportunityId, row.savedAt],
  },
  {
    table: 'activities',
    collection: 'activities',
    columns: [
      'id', 'user_id', 'registration_id', 'occurred_on', 'hours', 'manual_title',
      'manual_cause_id', 'manual_organization_id', 'manual_organization_name',
      'story', 'image_url', 'created_at',
    ],
    values: (row) => [
      row.id, row.userId, row.registrationId, row.occurredOn, row.hours, row.manualTitle,
      row.manualCauseId, row.manualOrgId, row.manualOrgName,
      row.story, row.imageUrl, row.createdAt,
    ],
  },
  {
    table: 'fundraisers',
    collection: 'fundraisers',
    columns: [
      'id', 'title', 'story', 'cause_id', 'creator_user_id',
      'creator_organization_id', 'beneficiary_organization_id', 'beneficiary_name',
      'goal_amount_cents', 'end_date', 'image_url', 'status', 'created_at',
    ],
    values: (row) => [
      row.id, row.title, row.story, row.causeId, row.creatorUserId,
      row.creatorOrganizationId, row.beneficiaryOrganizationId, row.beneficiaryName,
      row.goalAmountCents, row.endDate, row.imageUrl, row.status, row.createdAt,
    ],
  },
  {
    table: 'fundraiser_supports',
    collection: 'fundraiserSupports',
    columns: ['id', 'user_id', 'fundraiser_id', 'amount_cents', 'supported_at'],
    values: (row) => [
      row.id, row.userId, row.fundraiserId, row.amountCents, row.supportedAt,
    ],
  },
  {
    table: 'reactions',
    collection: 'reactions',
    columns: [
      'id', 'user_id', 'reaction_type', 'activity_id',
      'opportunity_id', 'fundraiser_id', 'created_at',
    ],
    values: (row) => [
      row.id, row.userId, row.reactionType, row.activityId,
      row.opportunityId, row.fundraiserId, row.createdAt,
    ],
  },
  {
    table: 'comments',
    collection: 'comments',
    columns: [
      'id', 'user_id', 'body', 'activity_id',
      'opportunity_id', 'fundraiser_id', 'created_at',
    ],
    values: (row) => [
      row.id, row.userId, row.body, row.activityId,
      row.opportunityId, row.fundraiserId, row.createdAt,
    ],
  },
]);

const ALL_KYND_TABLES = Object.freeze([
  'demo_sessions',
  ...TABLE_MAPPINGS.map(({ table }) => table),
]);

function assertMappedValue(table, rowIndex, column, value) {
  if (value === undefined) {
    throw new Error(`Loader mapping ${table}[${rowIndex}].${column} produced undefined.`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`Loader mapping ${table}[${rowIndex}].${column} produced a non-finite number.`);
  }
}

function validateMappings(world, mappings = TABLE_MAPPINGS) {
  if (!world || typeof world !== 'object') throw new Error('Loader world must be an object.');
  if (!Array.isArray(mappings) || mappings.length !== TABLE_MAPPINGS.length) {
    throw new Error(`Loader requires exactly ${TABLE_MAPPINGS.length} table mappings.`);
  }

  const seenTables = new Set();
  const tables = [];
  for (const mapping of mappings) {
    if (!mapping || typeof mapping !== 'object') throw new Error('Invalid loader table mapping.');
    if (seenTables.has(mapping.table)) throw new Error(`Duplicate loader mapping: ${mapping.table}.`);
    seenTables.add(mapping.table);
    if (!Array.isArray(mapping.columns) || mapping.columns.length === 0) {
      throw new Error(`Loader mapping ${mapping.table} has no columns.`);
    }
    if (!Array.isArray(world[mapping.collection])) {
      throw new Error(`World collection ${mapping.collection} is missing for ${mapping.table}.`);
    }
    if (typeof mapping.values !== 'function') {
      throw new Error(`Loader mapping ${mapping.table} has no value mapper.`);
    }

    const rows = world[mapping.collection];
    rows.forEach((row, rowIndex) => {
      const values = mapping.values(row);
      if (!Array.isArray(values) || values.length !== mapping.columns.length) {
        throw new Error(
          `Loader mapping ${mapping.table}[${rowIndex}] produced ${values?.length} values; `
          + `expected ${mapping.columns.length}.`
        );
      }
      values.forEach((value, columnIndex) => {
        assertMappedValue(mapping.table, rowIndex, mapping.columns[columnIndex], value);
      });
    });

    tables.push({
      table: mapping.table,
      collection: mapping.collection,
      rows: rows.length,
      batches: Math.ceil(rows.length / BATCH_SIZE),
    });
  }

  const expectedTables = TABLE_MAPPINGS.map(({ table }) => table);
  if (JSON.stringify([...seenTables]) !== JSON.stringify(expectedTables)) {
    throw new Error('Loader mappings are missing or out of dependency order.');
  }

  return {
    batchSize: BATCH_SIZE,
    tables,
    totalRows: tables.reduce((sum, table) => sum + table.rows, 0),
    totalBatches: tables.reduce((sum, table) => sum + table.batches, 0),
  };
}

function buildInsertBatch(mapping, rows) {
  if (!TABLE_MAPPINGS.includes(mapping)) {
    throw new Error('INSERT mapping must be one of the hardcoded Kynd table mappings.');
  }
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > BATCH_SIZE) {
    throw new Error(`INSERT batch size must be between 1 and ${BATCH_SIZE}.`);
  }

  const values = [];
  const tuples = rows.map((row, rowIndex) => {
    const mapped = mapping.values(row);
    if (!Array.isArray(mapped) || mapped.length !== mapping.columns.length) {
      throw new Error(`Invalid mapped value count for ${mapping.table} batch row ${rowIndex}.`);
    }
    mapped.forEach((value, columnIndex) => {
      assertMappedValue(mapping.table, rowIndex, mapping.columns[columnIndex], value);
      values.push(value);
    });
    const start = rowIndex * mapping.columns.length;
    return `(${mapping.columns.map((unused, index) => `$${start + index + 1}`).join(', ')})`;
  });

  return {
    text: `INSERT INTO ${mapping.table} (${mapping.columns.join(', ')}) VALUES ${tuples.join(', ')}`,
    values,
    rowCount: rows.length,
  };
}

function buildBatchPlan(world) {
  const summary = validateMappings(world);
  const batches = [];
  for (const mapping of TABLE_MAPPINGS) {
    const rows = world[mapping.collection];
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      batches.push({
        table: mapping.table,
        ...buildInsertBatch(mapping, rows.slice(start, start + BATCH_SIZE)),
      });
    }
  }
  if (batches.length !== summary.totalBatches) {
    throw new Error('Loader batch-plan total does not match mapping validation.');
  }
  return { ...summary, batches };
}

module.exports = {
  ALL_KYND_TABLES,
  BATCH_SIZE,
  TABLE_MAPPINGS,
  buildBatchPlan,
  buildInsertBatch,
  validateMappings,
};
