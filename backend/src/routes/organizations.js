'use strict';

const express = require('express');
const organizationsService = require('../services/organizations');
const followsService = require('../services/follows');
const { parseUuidParam } = require('../lib/uuid');
const { track, contextFrom } = require('../lib/analytics');
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

    // `surface` is where the follow happened, when the browser tells us.
    const surface = typeof req.body?.surface === 'string' && req.body.surface.length <= 32
      ? req.body.surface
      : null;
    track(
      'follow_changed',
      { target_type: 'organization', state: 'followed', ...(surface ? { surface } : {}) },
      contextFrom(req.demo)
    );
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

    track(
      'follow_changed',
      { target_type: 'organization', state: 'unfollowed' },
      contextFrom(req.demo)
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
