'use strict';

const express = require('express');
const homeService = require('../services/home');
const { requireDemoSession } = require('../middleware/session');

const router = express.Router();

/*
 * Home is fully personalized — every item exists because of who the
 * current visitor follows or cares about. Unlike Discover/Opportunity
 * Detail there is nothing truthful to show anonymously, so this requires a
 * real session rather than degrading to a seeded-only view.
 */
router.get('/', requireDemoSession(), async (req, res, next) => {
  try {
    const items = await homeService.buildHomeFeed({
      sessionId: req.demo.sessionId,
      userId: req.demo.user.id,
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
