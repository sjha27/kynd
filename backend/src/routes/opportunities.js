'use strict';

const express = require('express');
const opportunitiesService = require('../services/opportunities');
const { parseUuidParam } = require('../lib/uuid');
const { parsePaginationParams } = require('../lib/pagination');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { limit, offset } = parsePaginationParams(req.query);
    const opportunities = await opportunitiesService.listOpportunities({
      limit,
      offset,
    });
    res.json({ opportunities });
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
