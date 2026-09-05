'use strict';

const express = require('express');
const usersService = require('../services/users');
const followsService = require('../services/follows');
const { parseUuidParam } = require('../lib/uuid');
const { requireDemoSession, optionalDemoSession } = require('../middleware/session');

const router = express.Router();

/*
 * Session-optional: works anonymously (seeded users only, per
 * findUserById's visibility gate) and gains the viewer's own follow state
 * and session-visible counts when a session is present.
 */
router.get('/:id/profile', optionalDemoSession(), async (req, res, next) => {
  try {
    const id = parseUuidParam(req.params.id, 'user id');
    const profile = await usersService.getUserProfile(id, {
      sessionId: req.demo?.sessionId ?? null,
      viewerUserId: req.demo?.user?.id ?? null,
    });
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

/*
 * Follow/unfollow require a real session. The acting user is taken from the
 * resolved session — the body is not read at all — so a caller cannot
 * follow as someone else, same rule Join uses.
 */
router.post('/:id/follow', requireDemoSession(), async (req, res, next) => {
  try {
    const id = parseUuidParam(req.params.id, 'user id');
    const result = await followsService.followUser({
      targetUserId: id,
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
    const id = parseUuidParam(req.params.id, 'user id');
    const result = await followsService.unfollowUser({
      targetUserId: id,
      sessionId: req.demo.sessionId,
      userId: req.demo.user.id,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
