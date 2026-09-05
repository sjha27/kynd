'use strict';

/*
 * The explicit, narrow exception to the normal completion rule.
 *
 * Normal rule: an opportunity may be completed only after its real
 * `ends_at` has passed (checked against the real database clock, never the
 * synthetic WORLD_REFERENCE_DATE).
 *
 * A public portfolio demo session cannot wait until October to experience
 * the full Join -> Complete -> Profile lifecycle for the flagship, so this
 * opportunity id may additionally be completed early by a temporary demo
 * user. This does not weaken the rule for any other opportunity, and it is
 * not tied to "is this user temporary" in general — only this one seeded,
 * stable id. The UI is responsible for labeling this path "Demo: Mark as
 * complete" so the exception is never presented as a normal completion.
 */
const DEMO_COMPLETABLE_OPPORTUNITY_IDS = Object.freeze([
  'bc09559d-77de-5bde-b248-00a1480d6d94', // Piedmont Park Community Cleanup
]);

module.exports = { DEMO_COMPLETABLE_OPPORTUNITY_IDS };
