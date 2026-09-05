'use strict';

const demoSessionsService = require('../services/demo_sessions');
const { SessionError } = require('../errors');

const SESSION_HEADER = 'x-kynd-session-id';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * The single place a request turns into "who is this visitor".
 *
 * Every future session-aware route — Join first — should mount this rather
 * than re-reading the header or re-querying demo_sessions, so the resolution
 * rules exist once.
 *
 * On success it attaches:
 *   req.demo = { sessionId, expiresAt, user: { id, name, city, state } }
 *
 * Missing, malformed, unknown and expired all produce the same 401 with code
 * `demo_session_invalid`. Collapsing them is deliberate: the frontend's
 * reaction is identical in every case (discard the local value and start a
 * fresh session), and keeping them indistinguishable means the endpoint
 * cannot be used to test whether a given UUID exists.
 */
function requireDemoSession() {
  return async function requireDemoSessionMiddleware(req, res, next) {
    try {
      const headerValue = req.get(SESSION_HEADER);

      if (typeof headerValue !== 'string' || !UUID_PATTERN.test(headerValue.trim())) {
        throw new SessionError();
      }

      req.demo = await demoSessionsService.resolveDemoSession(headerValue.trim());
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireDemoSession, SESSION_HEADER };
