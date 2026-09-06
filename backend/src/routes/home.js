'use strict';

const express = require('express');
const homeService = require('../services/home');
const { track, contextFrom } = require('../lib/analytics');
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

    // has_second_degree tracks whether the "my community's community"
    // mechanism actually produced anything for this visitor — the feature
    // is only worth its slot if it fills reliably.
    track(
      'home_viewed',
      {
        item_count: items.length,
        has_second_degree: items.some((item) => item.family === 'secondDegree'),
      },
      contextFrom(req.demo)
    );

    res.json({ items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
