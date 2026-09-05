'use strict';

const express = require('express');
const opportunitiesService = require('../services/opportunities');
const { requireDemoSession } = require('../middleware/session');

const router = express.Router();

/*
 * The current visitor's Activity.
 *
 * Only `upcoming` is implemented in this slice. The response is shaped as an
 * object rather than a bare array so Completed and Saved can be added later
 * without changing the contract — but they are deliberately absent rather
 * than stubbed as empty arrays, which would claim behavior that doesn't exist.
 *
 * Always session-scoped: there is no way to ask for another visitor's
 * Activity, because the session is the only input.
 */
router.get('/', requireDemoSession(), async (req, res, next) => {
  try {
    const upcoming = await opportunitiesService.listUpcomingForSession(req.demo.sessionId);
    res.json({ upcoming });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
