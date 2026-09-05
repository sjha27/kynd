'use strict';

/*
 * Centralized vocabulary and boundaries for Discover's search/filter layer.
 *
 * Everything the API accepts for browsing lives here so the SQL builder, the
 * validation, and the tests all read from one definition rather than
 * repeating magic strings and durations.
 */

// Atlanta-local. The synthetic world is an Atlanta ecosystem, so calendar
// questions ("today", "this weekend") are answered in Atlanta's timezone
// rather than the server's or the visitor's.
const LOCAL_TIMEZONE = 'America/New_York';

const OPPORTUNITY_TYPES = ['volunteer', 'charity_event'];

const HOST_TYPES = ['organization', 'community'];

const TIMING_WINDOWS = ['today', 'weekend', 'next7'];

// 'atlanta' means a real physical opportunity in the seeded Georgia metro.
// It is deliberately NOT called "near me" — there is no user location.
const LOCATION_MODES = ['atlanta', 'online'];

/*
 * Commitment boundaries, in minutes, derived from starts_at -> ends_at.
 * Boundaries are inclusive of the upper bound so a flat 3-hour shift reads
 * as "1-3 hours" rather than falling into half day.
 *
 *   under1    duration <  60
 *   1to3      60 <= duration <= 180
 *   half_day  180 < duration <= 300
 *   full_day  duration > 300
 */
const COMMITMENT_BANDS = {
  under1: { minMinutes: null, maxMinutes: 60, exclusiveMax: true },
  '1to3': { minMinutes: 60, maxMinutes: 180 },
  half_day: { minMinutes: 180, maxMinutes: 300, exclusiveMin: true },
  full_day: { minMinutes: 300, maxMinutes: null, exclusiveMin: true },
};

const COMMITMENTS = Object.keys(COMMITMENT_BANDS);

const SORTS = ['soonest', 'popular'];

const MAX_QUERY_LENGTH = 120;

/*
 * Normalizes a free-text search term.
 *
 * Collapses whitespace, truncates oversized input rather than erroring (a
 * long paste should behave predictably, not 400), and treats a
 * whitespace-only query as absent.
 */
function normalizeSearchTerm(raw) {
  if (typeof raw !== 'string') return null;
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed) return null;
  return collapsed.slice(0, MAX_QUERY_LENGTH);
}

// Unknown values are ignored rather than rejected: an unrecognized filter
// should degrade to "no filter", not break browsing.
function parseEnum(raw, allowed) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  return allowed.includes(value) ? value : null;
}

function parseDiscoveryParams(query = {}) {
  return {
    q: normalizeSearchTerm(query.q),
    type: parseEnum(query.type, OPPORTUNITY_TYPES),
    host: parseEnum(query.host, HOST_TYPES),
    timing: parseEnum(query.timing, TIMING_WINDOWS),
    mode: parseEnum(query.mode, LOCATION_MODES),
    commitment: parseEnum(query.commitment, COMMITMENTS),
    // Cause is matched by name against the seeded set; validated in SQL by
    // equality rather than an allowlist so causes stay data-driven.
    cause: typeof query.cause === 'string' && query.cause.trim() ? query.cause.trim() : null,
    sort: parseEnum(query.sort, SORTS) || 'soonest',
  };
}

module.exports = {
  LOCAL_TIMEZONE,
  OPPORTUNITY_TYPES,
  HOST_TYPES,
  TIMING_WINDOWS,
  LOCATION_MODES,
  COMMITMENT_BANDS,
  COMMITMENTS,
  SORTS,
  MAX_QUERY_LENGTH,
  normalizeSearchTerm,
  parseDiscoveryParams,
};
