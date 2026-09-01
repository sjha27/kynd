#!/usr/bin/env node

const { generateWorld } = require('../seeds/generate');
const { validateWorld } = require('../seeds/lib/validate');
const { buildBatchPlan } = require('./lib/table_mappings');
const { RESET_CONFIRMATION, assertResetAuthorized, loadWorld } = require('./lib/loader');

function parseArguments(argv) {
  const options = { dryRun: false, reset: false, confirmation: undefined };
  for (const argument of argv) {
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--reset') options.reset = true;
    else if (argument.startsWith('--confirm-reset=')) {
      options.confirmation = argument.slice('--confirm-reset='.length);
    } else {
      throw new Error(`Unknown loader argument: ${argument}`);
    }
  }
  if (options.dryRun && options.reset) throw new Error('--dry-run cannot be combined with --reset.');
  assertResetAuthorized(options.reset, options.confirmation);
  return options;
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArguments(argv);
  const world = generateWorld();
  validateWorld(world);
  const plan = buildBatchPlan(world);

  if (options.dryRun) {
    console.log(JSON.stringify({ mode: 'dry-run', databaseConnected: false, ...plan, batches: undefined }, null, 2));
    return { mode: 'dry-run', plan };
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for database load mode.');
  }

  const Client = dependencies.Client || require('pg').Client;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    try {
      await client.connect();
    } catch (error) {
      throw new Error('Unable to connect to PostgreSQL.');
    }
    const result = await loadWorld(client, world, {
      reset: options.reset,
      confirmation: options.confirmation,
    });
    console.log(JSON.stringify({
      mode: options.reset ? 'reset-load' : 'load',
      totalRows: result.plan.totalRows,
      totalBatches: result.plan.totalBatches,
      reconciliation: result.reconciliation,
    }, null, 2));
    return result;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Kynd loader failed: ${error.message}`);
    if (error.rollbackError) console.error('Rollback also failed; inspect PostgreSQL logs safely.');
    process.exitCode = 1;
  });
}

module.exports = { RESET_CONFIRMATION, main, parseArguments };
