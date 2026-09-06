'use strict';

const express = require('express');
const opportunitiesService = require('../services/opportunities');
const activitiesService = require('../services/activities');
const { requireDemoSession } = require('../middleware/session');

const router = express.Router();

/*
 * The current visitor's Activity.
 *
 * Upcoming, Completed and Saved are all real now.
 *
 * awaitingConfirmation is the normal "Did you participate?" state: a joined
 * opportunity whose real end has passed but which has no activity yet. It
 * would otherwise fall into a gap — excluded from `upcoming` (its starts_at
 * is no longer in the future) and absent from `completed` (no activity
 * exists) — with no reachable path back to completion.
 *
 * Always session-scoped: there is no way to ask for another visitor's
 * Activity, because the session is the only input.
 */
router.get('/', requireDemoSession(), async (req, res, next) => {
  try {
    const [upcoming, completed, awaitingConfirmation, saved] = await Promise.all([
      opportunitiesService.listUpcomingForSession(req.demo.sessionId),
      activitiesService.listCompletedForSession(req.demo.sessionId),
      opportunitiesService.listAwaitingConfirmationForSession(req.demo.sessionId),
      opportunitiesService.listSavedForSession(req.demo.sessionId),
    ]);
    res.json({ upcoming, completed, awaitingConfirmation, saved });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
