'use strict';

const express = require('express');
const organizationsService = require('../services/organizations');
const followsService = require('../services/follows');
const { parseUuidParam } = require('../lib/uuid');
const { requireDemoSession, optionalDemoSession } = require('../middleware/session');

const router = express.Router();

router.get('/:id', optionalDemoSession(), async (req, res, next) => {
  try {
    const id = parseUuidParam(req.params.id, 'organization id');
    const organization = await organizationsService.getOrganizationDetail(id, {
      sessionId: req.demo?.sessionId ?? null,
      viewerUserId: req.demo?.user?.id ?? null,
    });
    res.json({ organization });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/follow', requireDemoSession(), async (req, res, next) => {
  try {
    const id = parseUuidParam(req.params.id, 'organization id');
    const result = await followsService.followOrganization({
      organizationId: id,
      sessionId: req.demo.sessionId,
      userId: req.demo.user.id,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/follow', requireDemoSession(), async (req, res, next) => {
  try {
    const id = parseUuidParam(req.params.id, 'organization id');
    const result = await followsService.unfollowOrganization({
      organizationId: id,
      sessionId: req.demo.sessionId,
      userId: req.demo.user.id,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
