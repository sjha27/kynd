const {
  ALL_KYND_TABLES,
  BATCH_SIZE,
  TABLE_MAPPINGS,
  buildBatchPlan,
  buildInsertBatch,
} = require('./table_mappings');
const { countUnion, reconcileLoadedWorld } = require('./reconcile');

const RESET_CONFIRMATION = 'KYND_DEMO';
const RESET_SQL = `TRUNCATE TABLE ${[...ALL_KYND_TABLES].reverse().join(', ')}`;

function assertResetAuthorized(reset, confirmation) {
  if (reset && confirmation !== RESET_CONFIRMATION) {
    throw new Error(`Reset requires --confirm-reset=${RESET_CONFIRMATION}.`);
  }
  if (!reset && confirmation !== undefined) {
    throw new Error('--confirm-reset may only be used with --reset.');
  }
}

async function findNonEmptyTables(client) {
  const result = await client.query(countUnion('kynd:empty-check'));
  return result.rows
    .map((row) => ({ table: row.table_name, rows: Number(row.row_count) }))
    .filter(({ rows }) => rows > 0);
}

async function insertWorld(client, world) {
  const insertedTables = [];
  for (const mapping of TABLE_MAPPINGS) {
    const rows = world[mapping.collection];
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batchRows = rows.slice(start, start + BATCH_SIZE);
      const batch = buildInsertBatch(mapping, batchRows);
      const result = await client.query({ text: batch.text, values: batch.values });
      if (result.rowCount !== batch.rowCount) {
        throw new Error(
          `INSERT row count mismatch for ${mapping.table}: inserted ${result.rowCount}, `
          + `expected ${batch.rowCount}.`
        );
      }
    }
    insertedTables.push(mapping.table);
  }
  return insertedTables;
}

async function loadWorld(client, world, options = {}) {
  const { reset = false, confirmation } = options;
  assertResetAuthorized(reset, confirmation);
  const plan = buildBatchPlan(world);
  let transactionStarted = false;
  let committed = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    if (reset) {
      await client.query(RESET_SQL);
    } else {
      const nonEmpty = await findNonEmptyTables(client);
      if (nonEmpty.length > 0) {
        const detail = nonEmpty.map(({ table, rows }) => `${table}=${rows}`).join(', ');
        throw new Error(`Refusing to load a non-empty Kynd database: ${detail}.`);
      }
    }

    const insertedTables = await insertWorld(client, world);
    const reconciliation = await reconcileLoadedWorld(client, world);
    await client.query('COMMIT');
    committed = true;
    return { plan, insertedTables, reconciliation, reset };
  } catch (error) {
    if (transactionStarted && !committed) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    throw error;
  }
}

module.exports = {
  RESET_CONFIRMATION,
  RESET_SQL,
  assertResetAuthorized,
  findNonEmptyTables,
  insertWorld,
  loadWorld,
};
