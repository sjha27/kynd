'use strict';

const express = require('express');
const opportunitiesService = require('../services/opportunities');
const { parseUuidParam } = require('../lib/uuid');
const { parsePaginationParams } = require('../lib/pagination');
const { parseDiscoveryParams } = require('../lib/discovery');
const { requireDemoSession, optionalDemoSession } = require('../middleware/session');

const router = express.Router();

/*
 * Reads are session-optional: they work anonymously (seeded world only) and
 * gain the current visitor's own state when a session is present.
 */
router.get('/', optionalDemoSession(), async (req, res, next) => {
  try {
    const { limit, offset } = parsePaginationParams(req.query);
    const filters = parseDiscoveryParams(req.query);

    const { opportunities, total } = await opportunitiesService.listOpportunities({
      limit,
      offset,
      sessionId: req.demo?.sessionId ?? null,
      ...filters,
    });

    res.json({
      opportunities,
      page: { limit, offset, total },
      filters,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', optionalDemoSession(), async (req, res, next) => {
  try {
    const id = parseUuidParam(req.params.id, 'opportunity id');
    const opportunity = await opportunitiesService.getOpportunityDetail(
      id,
      req.demo?.sessionId ?? null
    );
    res.json({ opportunity });
  } catch (err) {
    next(err);
  }
});

/*
 * Join requires a real session. The acting user is taken from the resolved
 * session — the body is not read at all, so a caller cannot join as someone
 * else or nominate a participant.
 */
router.post('/:id/join', requireDemoSession(), async (req, res, next) => {
  try {
    const id = parseUuidParam(req.params.id, 'opportunity id');
    const result = await opportunitiesService.joinOpportunity({
      opportunityId: id,
      sessionId: req.demo.sessionId,
      userId: req.demo.user.id,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
