'use strict';

/*
 * The starter state given to every new temporary demo user.
 *
 * A recruiter should feel like they're opening an existing social account
 * that already knows a little about their community, not a blank stub —
 * but this is deliberately NOT a fully established account. No activities,
 * registrations, or history are granted here; only the small starter social
 * graph and cause interests below. Everything else the recruiter still has
 * to do themselves (Join, Complete, ...).
 *
 * The five anchor ids are the existing seeded Maya Ellis, David Mercer,
 * Riverlight Atlanta, Mosaic Meals Collective, and Community Roots Atlanta
 * rows, and the three cause ids are Environment, Food & Hunger, and
 * Community — resolved once against the live seeded world and pinned here
 * rather than matched by display name on every session creation. This is a
 * narrow, deliberately hard-coded config for a deterministic synthetic
 * world, not a general seed-import mechanism — it must never pull in the
 * seed generator itself.
 */
const PERSONA = Object.freeze({
  displayName: 'Frank Enstien',
  city: 'Atlanta',
  state: 'GA',
});

const STARTER_CAUSE_IDS = Object.freeze([
  '756d4f61-db22-5199-aaf3-53ec7fd5266a', // Environment
  '94692c99-29b6-5fc4-aa49-08bed1068854', // Food & Hunger
  '471fb206-41f7-5be2-b8b2-95ddaf614b70', // Community
]);

const STARTER_FOLLOWED_USER_IDS = Object.freeze([
  '58243c7d-9b1c-57fd-8e66-ad79f9fe7967', // Maya Ellis
  '4e9d6c41-2ec6-5e85-8cfb-b6de7507fa20', // David Mercer
]);

const STARTER_FOLLOWED_ORGANIZATION_IDS = Object.freeze([
  '12437f75-adcd-597c-96ee-94534faed332', // Riverlight Atlanta
  '2712a78f-181d-5f0d-b2b7-e684c979be4e', // Mosaic Meals Collective
  'a16ba624-8730-51ac-9c53-6837aa8d5c09', // Community Roots Atlanta
]);

module.exports = {
  PERSONA,
  STARTER_CAUSE_IDS,
  STARTER_FOLLOWED_USER_IDS,
  STARTER_FOLLOWED_ORGANIZATION_IDS,
};
