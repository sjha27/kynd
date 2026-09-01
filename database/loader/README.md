# Kynd PostgreSQL loader

This loader transforms the approved deterministic `generateWorld()` result into explicit,
parameterized PostgreSQL inserts. It is database tooling only; the browser must never connect
directly to PostgreSQL.

## Safety contract

- A normal load refuses to run if any Kynd application table contains rows.
- All row values use PostgreSQL bind parameters and identifiers come only from hardcoded mappings.
- The complete load and post-load reconciliation run in one transaction.
- Any failure after `BEGIN` triggers `ROLLBACK`; reconciliation must pass before `COMMIT`.
- Database credentials and connection details are not logged.
- Reset mode truncates all Kynd demo data and requires an exact confirmation token.

Milestone 9 builds and validates this path without connecting to PostgreSQL or Neon. The first real
PostgreSQL execution and Neon load happen in Milestone 10.

## Commands

Dry-run generation, validation, and batch planning require no database configuration:

```sh
npm run loader:dry-run
```

Run the no-network fake-client suite:

```sh
npm run loader:validate
```

Future Milestone 10 normal-load command shape:

```sh
node --env-file=.env database/loader/load.js
```

An explicitly confirmed reset destroys all existing Kynd demo data before reloading:

```sh
node --env-file=.env database/loader/load.js --reset --confirm-reset=KYND_DEMO
```

Never use reset against a database whose Kynd data must be preserved. A missing or incorrect reset
confirmation is rejected before a PostgreSQL client is constructed.
