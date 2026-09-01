'use strict';

const express = require('express');
const organizationsService = require('../services/organizations');
const { parseUuidParam } = require('../lib/uuid');

const router = express.Router();

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseUuidParam(req.params.id, 'organization id');
    const organization = await organizationsService.getOrganizationDetail(id);
    res.json({ organization });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
