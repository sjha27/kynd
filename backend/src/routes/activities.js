'use strict';

const express = require('express');
const activitiesService = require('../services/activities');
const { requireDemoSession } = require('../middleware/session');

const router = express.Router();

/*
 * Log a contribution that happened outside Kynd.
 *
 * This is the activities collection, distinct from /api/v1/activity, which
 * is the Activity screen's session-scoped view (upcoming / awaiting
 * confirmation / completed). Creating an activity belongs here.
 *
 * The acting user is never read from the body — it always comes from the
 * resolved session, same rule as Join and Completion. Everything the body
 * does carry is the visitor's own account of their own participation.
 */
router.post('/', requireDemoSession(), async (req, res, next) => {
  try {
    const result = await activitiesService.logManualActivity({
      userId: req.demo.user.id,
      title: req.body?.title,
      causeName: req.body?.causeName,
      organizationName: req.body?.organizationName,
      occurredOn: req.body?.occurredOn,
      hours: Number(req.body?.hours),
      story: req.body?.story,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
