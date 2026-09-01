'use strict';

const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 50;

const DEFAULT_OFFSET = 0;
const MIN_OFFSET = 0;

function clampInt(rawValue, { min, max, defaultValue }) {
  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.min(Math.max(parsed, min), max);
}

// Invalid, missing, negative, zero, or out-of-range values are clamped to a
// sensible value rather than rejected — pagination is a display convenience,
// not something a client should be able to get a 400 for.
function parsePaginationParams(query = {}) {
  return {
    limit: clampInt(query.limit, {
      min: MIN_LIMIT,
      max: MAX_LIMIT,
      defaultValue: DEFAULT_LIMIT,
    }),
    offset: clampInt(query.offset, {
      min: MIN_OFFSET,
      max: Number.MAX_SAFE_INTEGER,
      defaultValue: DEFAULT_OFFSET,
    }),
  };
}

module.exports = { parsePaginationParams };
