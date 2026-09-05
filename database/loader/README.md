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

## Refreshing the synthetic world

Kynd's fictional Atlanta ecosystem is generated around one configurable calendar date. Ageing the
world forward is a deliberate, owner-initiated maintenance action — there is no cron, no scheduled
reseed, and no runtime clock translation anywhere in the application.

### Where the date lives

```
database/seeds/config.js  ->  const WORLD_REFERENCE_DATE = '2026-09-06';
```

That is the only value to change. Everything else — opportunity dates, registrations, activities,
fundraisers, supports, saves, reactions, comments — is generated relative to it.

### The one rule: move it in whole weeks

Always advance the date by a multiple of 7 days from the previous value.

Opportunity scheduling is weekday-aware (weekend events must land on real weekends), so a whole-week
shift keeps every offset on the same weekday, keeps the generator's random stream aligned, and
therefore keeps the *same* fictional world — same people, same organizations, same opportunities,
same identifiers — simply aged forward.

A non-multiple-of-7 shift silently rewrites the marketplace. Measured on this dataset: a 5-day shift
kept all 2,000 opportunity ids but changed the title, duration, capacity, cause or host of 1,176 of
them, and failed validation. A 7-day shift changed nothing.

Valid next values from the current date: `2026-09-13`, `2026-09-20`, `2026-10-04`, `2026-12-06`, ...

Do **not** change `CONFIG.seed`. It only looks like a date; it fixes *which* fictional entities exist.
Changing it generates a different universe rather than ageing this one.

### Procedure

1. Edit `WORLD_REFERENCE_DATE` in `database/seeds/config.js` (whole weeks ahead).

2. Generate and validate. This runs every seed validator, including the temporal invariants in
   `database/seeds/lib/validate_temporal.js`:

   ```sh
   node database/seeds/generate.js
   ```

   Exit code 0 means the world is coherent. The printed diagnostics show the new distribution.

3. Confirm the batch plan still reconciles to 37,349 rows:

   ```sh
   npm run loader:dry-run
   ```

4. Reload the Neon baseline in one transaction. This truncates the seeded demo data and reloads it;
   it does not touch the schema and needs no migration:

   ```sh
   node --env-file=.env database/loader/load.js --reset --confirm-reset=KYND_DEMO
   ```

5. Run the backend suite:

   ```sh
   npm run backend:test
   ```

6. Smoke-test Discover: load `/discover`, confirm "Happening this weekend" has results, and open the
   flagship opportunity.

### What the temporal validation guarantees

`validate_temporal.js` fails the build rather than shipping an incoherent world. It checks that the
reference date resolves to the intended Atlanta calendar day; that the flagship stays a future
Saturday 3-6 weeks out with capacity 25 / 5 joined / 20 available and Maya Ellis joined; that the
marketplace stays dense (upcoming inventory, the coming weekend, next 7 and 30 days, and a real
past); that no completed activity sits in the synthetic future or predates the opportunity it came
from; that joined counts never exceed capacity; and that saves, fundraiser supports, reactions and
comments never predate the content they depend on.

### Real time vs synthetic time

`WORLD_REFERENCE_DATE` governs the *fictional* world only. Future infrastructure timestamps — demo
session creation and expiry, logging, deployment health — must keep using the real server clock.
Nothing in this refresh model requires a fake clock at runtime.
