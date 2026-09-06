'use strict';

const express = require('express');
const socialService = require('../services/social');
const { parseUuidParam } = require('../lib/uuid');
const { requireDemoSession, optionalDemoSession } = require('../middleware/session');

const router = express.Router();

/*
 * The social layer for one piece of content, as a sub-resource.
 *
 *   /api/v1/engagement/:targetType/:targetId
 *
 * targetType is one of activities | opportunities | fundraisers — the three
 * targets the frozen reactions/comments schema allows. Keeping this separate
 * means no existing read contract had to change to carry engagement, and one
 * implementation serves every surface that shows it.
 *
 * Reads are session-optional (seeded world anonymously, plus the visitor's
 * own state when a session exists). Writes require a session, and the actor
 * always comes from it — user_id is never read from the browser.
 */
router.get('/:targetType/:targetId', optionalDemoSession(), async (req, res, next) => {
  try {
    const targetId = parseUuidParam(req.params.targetId, 'content id');
    const engagement = await socialService.getEngagement({
      targetType: req.params.targetType,
      targetId,
      sessionId: req.demo?.sessionId ?? null,
    });
    res.json(engagement);
  } catch (err) {
    next(err);
  }
});

// One-tap toggle: reacting again with the same type removes it.
router.post('/:targetType/:targetId/reactions', requireDemoSession(), async (req, res, next) => {
  try {
    const targetId = parseUuidParam(req.params.targetId, 'content id');
    const result = await socialService.toggleReaction({
      targetType: req.params.targetType,
      targetId,
      sessionId: req.demo.sessionId,
      userId: req.demo.user.id,
      reactionType: req.body?.type,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:targetType/:targetId/comments', requireDemoSession(), async (req, res, next) => {
  try {
    const targetId = parseUuidParam(req.params.targetId, 'content id');
    const result = await socialService.addComment({
      targetType: req.params.targetType,
      targetId,
      sessionId: req.demo.sessionId,
      userId: req.demo.user.id,
      body: req.body?.body,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
