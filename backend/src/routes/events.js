'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const { track, contextFrom, SOURCES } = require('../lib/analytics');
const { requireDemoSession } = require('../middleware/session');
const { ValidationError } = require('../errors');

const router = express.Router();

/*
 * The frontend event bridge.
 *
 * This exists for exactly one reason: attribution. The backend can see that
 * an opportunity was fetched, but not which surface the visitor came from —
 * and "did social discovery actually drive this view" is the question the
 * whole product thesis rests on. Only the browser knows that.
 *
 * Everything else is emitted server-side from the operation itself. Product
 * events must NOT be routed through here, because a browser-reported Join
 * would be a claim rather than a fact.
 *
 * The endpoint is deliberately narrow:
 *
 *   - a real demo session is required, and identity comes from it alone
 *   - only the event names in ALLOWED_EVENTS are accepted
 *   - only the properties that event declares are accepted, each validated
 *     against a bounded vocabulary or an id format
 *   - anything else — unknown event, unknown property, oversized body,
 *     free text — is rejected rather than trimmed and stored
 *
 * The browser can therefore never introduce a new event type, attach an
 * arbitrary property, or smuggle visitor text into the analytics stream.
 */

const CAUSES = [
  'Environment',
  'Food & Hunger',
  'Animals',
  'Education',
  'Health',
  'Housing',
  'Youth',
  'Community',
  'Veterans',
  'Disaster Relief',
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (v) => typeof v === 'string' && UUID_PATTERN.test(v);
const oneOf = (allowed) => (v) => typeof v === 'string' && allowed.includes(v);

/*
 * Each entry is the complete contract for that event: every property the
 * browser may send, and how each is validated. A property absent from this
 * map cannot reach the log.
 */
const ALLOWED_EVENTS = {
  opportunity_viewed: {
    opportunity_id: isUuid,
    cause: oneOf(CAUSES),
    host_type: oneOf(['organization', 'user']),
    source: oneOf(SOURCES),
  },
  fundraiser_viewed: {
    fundraiser_id: isUuid,
    cause: oneOf(CAUSES),
    source: oneOf(SOURCES),
  },
  discover_viewed: {
    mode: oneOf(['browse', 'search', 'filter']),
  },
};

// A legitimate payload is a name plus a handful of short scalars. Anything
// substantially larger is not a real event from this app.
const MAX_PROPERTY_COUNT = 8;

function validate(body) {
  const name = body?.event;
  const contract = Object.prototype.hasOwnProperty.call(ALLOWED_EVENTS, name)
    ? ALLOWED_EVENTS[name]
    : null;
  if (!contract) {
    throw new ValidationError('Unknown event.');
  }

  const supplied = body?.properties;
  if (supplied !== undefined && (typeof supplied !== 'object' || supplied === null || Array.isArray(supplied))) {
    throw new ValidationError('Event properties must be an object.');
  }

  const entries = Object.entries(supplied || {});
  if (entries.length > MAX_PROPERTY_COUNT) {
    throw new ValidationError('Too many event properties.');
  }

  const props = {};
  for (const [key, value] of entries) {
    const check = Object.prototype.hasOwnProperty.call(contract, key) ? contract[key] : null;
    if (!check) {
      // Rejected rather than dropped: silently accepting an unexpected
      // property would make the endpoint's contract untrue.
      throw new ValidationError(`Unexpected event property: ${key}`);
    }
    if (!check(value)) {
      throw new ValidationError(`Invalid value for event property: ${key}`);
    }
    props[key] = value;
  }

  return { name, props };
}

/*
 * Sized for a browsing session, not an attacker: a visitor viewing pages
 * quickly stays far under this, while it caps how much a single client can
 * write into the log stream.
 */
const eventLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many events.' } },
  skip: () => process.env.NODE_ENV === 'test',
});

router.post('/', eventLimiter, requireDemoSession(), async (req, res, next) => {
  try {
    const { name, props } = validate(req.body);
    // Identity is taken from the resolved session and nowhere else — a
    // session_id or user_id in the body is simply not a property this
    // endpoint knows, so it is rejected by the allowlist above.
    track(name, props, contextFrom(req.demo));
    res.status(202).end();
  } catch (err) {
    next(err);
  }
});

module.exports = { router, ALLOWED_EVENTS };
