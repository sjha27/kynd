'use strict';

const { ValidationError } = require('../errors');

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseUuidParam(value, fieldName = 'id') {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ValidationError(`Invalid ${fieldName}: must be a UUID`);
  }
  return value;
}

module.exports = { parseUuidParam };
