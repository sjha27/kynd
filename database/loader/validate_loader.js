const assert = require('node:assert/strict');
const test = require('node:test');

const { generateWorld } = require('../seeds/generate');
const { parseArguments } = require('./load');
const {
  RESET_CONFIRMATION,
  assertResetAuthorized,
  loadWorld,
} = require('./lib/loader');
const {
  ALL_KYND_TABLES,
  TABLE_MAPPINGS,
  buildBatchPlan,
  buildInsertBatch,
  validateMappings,
} = require('./lib/table_mappings');

class FakeClient {
  constructor(world, options = {}) {
    this.world = world;
    this.options = options;
    this.calls = [];
    this.insertTables = [];
  }

  async query(query) {
    const text = typeof query === 'string' ? query : query.text;
    const values = typeof query === 'string' ? undefined : query.values;
    this.calls.push({ text, values });

    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [], rowCount: null };
    if (text.startsWith('TRUNCATE TABLE')) return { rows: [], rowCount: null };

    const insertMatch = text.match(/^INSERT INTO ([a-z_]+) /);
    if (insertMatch) {
      const table = insertMatch[1];
      if (table === this.options.failInsertTable) throw new Error(`Forced ${table} failure.`);
      this.insertTables.push(table);
      return { rows: [], rowCount: text.match(/\), \(/g)?.length + 1 || 1 };
    }

    if (text.includes('kynd:empty-check')) {
      return {
        rows: ALL_KYND_TABLES.map((table) => ({
          table_name: table,
          row_count: String(this.options.nonEmptyTable === table ? 1 : 0),
        })),
      };
    }

    if (text.includes('kynd:reconcile-table-counts')) {
      const counts = { demo_sessions: 0 };
      for (const mapping of TABLE_MAPPINGS) counts[mapping.table] = this.world[mapping.collection].length;
      if (this.options.badReconciliation) counts.comments -= 1;
      return {
        rows: ALL_KYND_TABLES.map((table) => ({
          table_name: table,
          row_count: String(counts[table]),
        })),
      };
    }
    if (text.includes('kynd:reconcile-registration-state')) {
      return { rows: [{ status: 'joined', row_count: '6250' }, { status: 'cancelled', row_count: '750' }] };
    }
    if (text.includes('kynd:reconcile-capacity')) return { rows: [{ violation_count: '0' }] };
    if (text.includes('kynd:reconcile-activity-source')) {
      return { rows: [{ kynd_count: '2100', manual_count: '400' }] };
    }
    if (text.includes('kynd:reconcile-fundraising')) {
      return {
        rows: [{
          support_count: String(this.world.fundraiserSupports.length),
          total_amount_cents: String(this.world.fundraiserSupports.reduce(
            (sum, support) => sum + support.amountCents,
            0
          )),
        }],
      };
    }
    if (text.includes('kynd:reconcile-social-financial-separation')) {
      return { rows: [{ violation_count: '0' }] };
    }
    if (text.includes('kynd:reconcile-flagship')) {
      assert.deepEqual(values, [this.world.opportunities.find((row) => row.flagship).id]);
      return { rows: [{ capacity: '25', joined_count: '5' }] };
    }
    if (text.includes('kynd:reconcile-controlled-media')) {
      return { rows: [{ avatar_count: '50', logo_count: '25' }] };
    }
    throw new Error(`Unexpected fake query: ${text.slice(0, 80)}`);
  }
}

let world;
test.before(() => { world = generateWorld(); });

test('successful load uses dependency order, reconciliation, and commit', async () => {
  const client = new FakeClient(world);
  const result = await loadWorld(client, world);
  const calls = client.calls.map(({ text }) => text);
  assert.equal(calls[0], 'BEGIN');
  assert.ok(calls[1].includes('kynd:empty-check'));
  assert.deepEqual([...new Set(client.insertTables)], TABLE_MAPPINGS.map(({ table }) => table));
  assert.ok(calls.some((text) => text.includes('kynd:reconcile-table-counts')));
  assert.equal(calls.at(-1), 'COMMIT');
  assert.ok(!calls.includes('ROLLBACK'));
  assert.equal(result.plan.totalRows, 37349);
  assert.equal(result.plan.totalBatches, 152);
});

test('normal load refuses a populated database and rolls back', async () => {
  const client = new FakeClient(world, { nonEmptyTable: 'users' });
  await assert.rejects(loadWorld(client, world), /users=1/);
  assert.equal(client.insertTables.length, 0);
  assert.equal(client.calls.at(-1).text, 'ROLLBACK');
  assert.ok(!client.calls.some(({ text }) => text === 'COMMIT'));
});

test('mid-load INSERT failure stops later tables and rolls back', async () => {
  const client = new FakeClient(world, { failInsertTable: 'opportunities' });
  await assert.rejects(loadWorld(client, world), /Forced opportunities failure/);
  assert.ok(client.insertTables.includes('organization_follows'));
  assert.ok(!client.insertTables.includes('registrations'));
  assert.equal(client.calls.at(-1).text, 'ROLLBACK');
  assert.ok(!client.calls.some(({ text }) => text === 'COMMIT'));
});

test('reconciliation failure rolls back instead of committing', async () => {
  const client = new FakeClient(world, { badReconciliation: true });
  await assert.rejects(loadWorld(client, world), /Reconciliation failed for comments/);
  assert.equal(client.calls.at(-1).text, 'ROLLBACK');
  assert.ok(!client.calls.some(({ text }) => text === 'COMMIT'));
});

test('reset requires exact confirmation before connection can be attempted', () => {
  assert.throws(() => parseArguments(['--reset']), /confirm-reset=KYND_DEMO/);
  assert.throws(() => assertResetAuthorized(true, 'wrong'), /confirm-reset=KYND_DEMO/);
  assert.deepEqual(parseArguments(['--reset', `--confirm-reset=${RESET_CONFIRMATION}`]), {
    dryRun: false,
    reset: true,
    confirmation: RESET_CONFIRMATION,
  });
});

test('explicit reset truncates before inserts, reconciles, and commits', async () => {
  const client = new FakeClient(world);
  await loadWorld(client, world, { reset: true, confirmation: RESET_CONFIRMATION });
  const calls = client.calls.map(({ text }) => text);
  assert.equal(calls[0], 'BEGIN');
  assert.ok(calls[1].startsWith('TRUNCATE TABLE'));
  const firstInsert = calls.findIndex((text) => text.startsWith('INSERT INTO'));
  const reconciliation = calls.findIndex((text) => text.includes('kynd:reconcile-table-counts'));
  assert.ok(firstInsert > 1);
  assert.ok(reconciliation > firstInsert);
  assert.equal(calls.at(-1), 'COMMIT');
});

test('INSERT batches parameterize all row content', () => {
  const mapping = TABLE_MAPPINGS.find(({ table }) => table === 'comments');
  const representative = world.comments.find((row) => row.body.includes(' '));
  const batch = buildInsertBatch(mapping, [representative]);
  assert.match(batch.text, /VALUES \(\$1, \$2, \$3/);
  assert.equal((batch.text.match(/\$\d+/g) || []).length, batch.values.length);
  assert.ok(batch.values.includes(representative.body));
  assert.ok(!batch.text.includes(representative.body));
});

test('mapping validation rejects undefined before database execution', () => {
  const invalidWorld = { ...world, causes: world.causes.map((row, index) => (
    index === 0 ? { ...row, name: undefined } : row
  )) };
  assert.throws(() => validateMappings(invalidWorld), /produced undefined/);
  assert.doesNotThrow(() => buildBatchPlan(world));
});
