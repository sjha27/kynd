'use strict';

/*
 * Kynd product analytics.
 *
 * Deliberately not an SDK, not a vendor, and not a database table. Events
 * are single-line JSON written to stdout, which Render already captures —
 * so measuring the product costs no new infrastructure, no cookie, no
 * third-party request, and no change to the frozen 16-table schema.
 *
 * Two rules govern everything here:
 *
 *   1. Instrumentation must never affect the product. Every emit is wrapped
 *      so that a bug in analytics cannot fail a Join, a Complete, or a
 *      Reset. Measurement is strictly subordinate to the thing it measures.
 *
 *   2. Visitor free text never leaves the database. No comment body, story,
 *      title, description, organization name typed by a visitor, or search
 *      term is ever an event property — only shapes of them (has_story,
 *      has_query) and bounded buckets. See ANALYTICS.md.
 *
 * The unit of analysis is the demo SESSION, not a person. A temporary demo
 * user is not a real user and is never reported as one, which is why every
 * event carries is_demo.
 */

/*
 * The navigation surfaces a view can genuinely come from. `direct` and
 * `other` are real answers: attribution is never invented when the source
 * is unknown.
 */
const SOURCES = Object.freeze([
  'home_person',
  'home_org',
  'home_second_degree',
  'home_cause',
  'discover',
  'activity_saved',
  'activity_upcoming',
  'direct',
  'other',
]);

// Bumped when the envelope or an event's property contract changes in a way
// that would break analysis of older lines.
const SCHEMA_VERSION = 1;

// Marks these lines as analytics rather than ordinary operational logs, so
// they can be filtered out of a log stream (or into one) unambiguously.
const LOG_TYPE = 'kynd_analytics_event';

// Session lifetime is 24h (see db/queries/demo_sessions.js). Age is derived
// from the expiry the session middleware already resolved, so knowing how
// far into a visit an event happened costs no extra query.
const SESSION_LIFETIME_SECONDS = 24 * 60 * 60;

function sessionAgeSeconds(expiresAt) {
  if (!expiresAt) return null;
  const expires = new Date(expiresAt).getTime();
  if (Number.isNaN(expires)) return null;
  const startedAt = expires - SESSION_LIFETIME_SECONDS * 1000;
  const age = Math.round((Date.now() - startedAt) / 1000);
  // A negative age would mean the clocks disagree; report nothing rather
  // than a number that looks meaningful and isn't.
  return age >= 0 ? age : null;
}

/*
 * Builds the analytics context from a resolved demo session.
 *
 * Called with req.demo. Kept as an explicit step so a caller can capture
 * the context BEFORE an operation that destroys it — Reset deletes the
 * session it is reporting on, so its event is emitted from a context held
 * in memory after the delete has succeeded.
 */
function contextFrom(demo) {
  if (!demo) return null;
  return {
    sessionId: demo.sessionId,
    userId: demo.user?.id ?? null,
    expiresAt: demo.expiresAt ?? null,
  };
}

/*
 * Emits one event. Never throws.
 *
 * `props` is passed through as given — the allowlisting of what may appear
 * lives at the call sites and, for browser-supplied events, in the events
 * route. This function's job is the envelope and the safety guarantee.
 */
function track(event, props = {}, ctx = null) {
  try {
    const line = {
      log_type: LOG_TYPE,
      schema_version: SCHEMA_VERSION,
      event,
      ts: new Date().toISOString(),
      // Always true: every actor in this product is a temporary demo
      // visitor. Recorded explicitly so no downstream analysis can quietly
      // treat these as production users.
      is_demo: true,
      session_id: ctx?.sessionId ?? null,
      user_id: ctx?.userId ?? null,
      session_age_seconds: sessionAgeSeconds(ctx?.expiresAt),
      ...props,
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(line));
  } catch {
    // Swallowed on purpose. An analytics failure must never surface to the
    // visitor or roll back a product write.
  }
}

/*
 * Money and capacity are bucketed rather than recorded exactly: the shape
 * of the distribution is what informs product decisions, and the precise
 * value a specific visitor chose is not needed to learn it.
 */
function amountBucket(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n) || n <= 0) return 'unknown';
  if (n < 1000) return 'under_10';
  if (n < 2500) return '10_24';
  if (n < 5000) return '25_49';
  if (n < 10000) return '50_99';
  return '100_plus';
}

function capacityBucket(capacity) {
  const n = Number(capacity);
  if (!Number.isFinite(n) || n <= 0) return 'unknown';
  if (n <= 10) return '1_10';
  if (n <= 25) return '11_25';
  if (n <= 50) return '26_50';
  return '50_plus';
}

module.exports = {
  SOURCES,
  track,
  contextFrom,
  amountBucket,
  capacityBucket,
  sessionAgeSeconds,
  SCHEMA_VERSION,
  LOG_TYPE,
};
