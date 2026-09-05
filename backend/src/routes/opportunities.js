'use strict';

const express = require('express');
const opportunitiesService = require('../services/opportunities');
const { parseUuidParam } = require('../lib/uuid');
const { parsePaginationParams } = require('../lib/pagination');
const { parseDiscoveryParams } = require('../lib/discovery');

const router = express.Router();

// Read-only. Discover does not write; registrations/saves arrive with their
// own vertical slices.
router.get('/', async (req, res, next) => {
  try {
    const { limit, offset } = parsePaginationParams(req.query);
    const filters = parseDiscoveryParams(req.query);

    const { opportunities, total } = await opportunitiesService.listOpportunities({
      limit,
      offset,
      ...filters,
    });

    res.json({
      opportunities,
      // Echoing the applied filters back lets the UI render active-filter
      // chips from the server's interpretation rather than its own guess.
      page: { limit, offset, total },
      filters,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseUuidParam(req.params.id, 'opportunity id');
    const opportunity = await opportunitiesService.getOpportunityDetail(id);
    res.json({ opportunity });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
