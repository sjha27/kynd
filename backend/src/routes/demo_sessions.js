'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const demoSessionsService = require('../services/demo_sessions');
const { requireDemoSession } = require('../middleware/session');

const router = express.Router();

/*
 * Session creation is Kynd's first unauthenticated public write, so it gets a
 * proportional limit: 20 new sessions per IP per hour.
 *
 * Sized for a portfolio demo. A normal visitor creates one session per 24
 * hours; a recruiter clearing storage, testing several browsers, or sharing
 * an office/VPN egress IP stays comfortably under 20. It is not meant to stop
 * a determined attacker — only to make casually minting thousands of
 * temporary users unattractive. Reads are not limited.
 */
const createSessionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many demo sessions created. Try again later.' } },
  // The suite legitimately creates many sessions from one address to prove
  // isolation. Skipping under NODE_ENV=test keeps the production limit intact
  // while letting those tests exercise the real routes.
  skip: () => process.env.NODE_ENV === 'test',
});

// Creating a session is the one route that must NOT require a session.
router.post('/', createSessionLimiter, async (req, res, next) => {
  try {
    const session = await demoSessionsService.createDemoSession();
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

/*
 * Lets the frontend confirm the session it has in localStorage is still real
 * and unexpired. Narrow on purpose — this is not a profile endpoint.
 */
router.get('/current', requireDemoSession(), (req, res) => {
  res.json(demoSessionsService.toPublicContext(req.demo));
});

/*
 * Reset Demo.
 *
 * Ends the current visitor's session and discards everything they did, via
 * the schema's cascades. Addressed as `current` rather than by id: a visitor
 * can only reset the session they already hold, and the id comes from the
 * resolved session, never from the path or a body.
 *
 * 204: there is nothing meaningful left to return, and the client's next
 * step is to create a fresh session. Deliberately NOT paired with creation
 * here — the client owns "forget the old id, then start a new one", so a
 * failure between the two leaves the browser with a cleanly dead session
 * rather than a live one it has lost track of.
 */
router.delete('/current', requireDemoSession(), async (req, res, next) => {
  try {
    await demoSessionsService.resetDemoSession(req.demo.sessionId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
