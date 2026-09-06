'use strict';

const express = require('express');
const fundraisersService = require('../services/fundraisers');
const { parseUuidParam } = require('../lib/uuid');
const { track, contextFrom, amountBucket } = require('../lib/analytics');
const { requireDemoSession, optionalDemoSession } = require('../middleware/session');

const router = express.Router();

const MAX_LIST_LIMIT = 24;

/*
 * Fundraisers open to support.
 *
 * Deliberately its own small collection rather than being folded into
 * /api/v1/opportunities: a fundraiser is a different object with different
 * fields, and unioning the two into one paginated, filtered, sorted contract
 * would mean redesigning Discover's opportunity contract for every consumer
 * of it. Discover renders this as one additional section instead.
 *
 * Reads are session-optional: they work anonymously (seeded world only) and
 * gain the current visitor's own support state when a session is present.
 */
router.get('/', optionalDemoSession(), async (req, res, next) => {
  try {
    const requested = Number(req.query.limit);
    const limit = Number.isInteger(requested)
      ? Math.min(Math.max(requested, 1), MAX_LIST_LIMIT)
      : 12;

    const fundraisers = await fundraisersService.listOpenFundraisers({
      limit,
      sessionId: req.demo?.sessionId ?? null,
    });
    res.json({ fundraisers });
  } catch (err) {
    next(err);
  }
});

/*
 * Starting a fundraiser. The creator is taken from the session —
 * creator_user_id is never read from the body, so a caller can never publish
 * as someone else or as an organization.
 */
router.post('/', requireDemoSession(), async (req, res, next) => {
  try {
    const fundraiser = await fundraisersService.createFundraiser({
      creatorUserId: req.demo.user.id,
      sessionId: req.demo.sessionId,
      title: req.body?.title,
      story: req.body?.story,
      causeName: req.body?.causeName,
      beneficiaryName: req.body?.beneficiaryName,
      goalAmountCents: req.body?.goalAmountCents,
      endDate: req.body?.endDate,
    });

    track(
      'content_created',
      { type: 'fundraiser', cause: fundraiser.cause?.name ?? null },
      contextFrom(req.demo)
    );
    res.status(201).json({ fundraiser });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', optionalDemoSession(), async (req, res, next) => {
  try {
    const id = parseUuidParam(req.params.id, 'fundraiser id');
    const fundraiser = await fundraisersService.getFundraiserDetail(
      id,
      req.demo?.sessionId ?? null
    );
    res.json({ fundraiser });
  } catch (err) {
    next(err);
  }
});

/*
 * Simulated support. Requires a real session; the acting supporter comes
 * from it. The body carries only the amount the visitor chose — there are no
 * payment fields, because no payment is processed.
 */
router.post('/:id/support', requireDemoSession(), async (req, res, next) => {
  try {
    const id = parseUuidParam(req.params.id, 'fundraiser id');
    const fundraiser = await fundraisersService.supportFundraiser({
      fundraiserId: id,
      userId: req.demo.user.id,
      sessionId: req.demo.sessionId,
      amountCents: req.body?.amountCents,
    });

    // Bucketed, never the exact amount a specific visitor chose.
    track(
      'fundraiser_supported',
      {
        fundraiser_id: id,
        cause: fundraiser.cause?.name ?? null,
        amount_bucket: amountBucket(req.body?.amountCents),
      },
      contextFrom(req.demo)
    );
    res.status(200).json({ supported: true, fundraiser });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
