'use strict';

const express = require('express');
const opportunitiesService = require('../services/opportunities');
const activitiesService = require('../services/activities');
const { requireDemoSession } = require('../middleware/session');

const router = express.Router();

/*
 * The current visitor's Activity.
 *
 * Upcoming and Completed are both real in this slice; Saved is still
 * deliberately absent rather than stubbed as an empty array, which would
 * claim behavior that doesn't exist.
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
    const [upcoming, completed, awaitingConfirmation] = await Promise.all([
      opportunitiesService.listUpcomingForSession(req.demo.sessionId),
      activitiesService.listCompletedForSession(req.demo.sessionId),
      opportunitiesService.listAwaitingConfirmationForSession(req.demo.sessionId),
    ]);
    res.json({ upcoming, completed, awaitingConfirmation });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
