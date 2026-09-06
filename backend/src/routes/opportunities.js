'use strict';

const express = require('express');
const opportunitiesService = require('../services/opportunities');
const activitiesService = require('../services/activities');
const socialService = require('../services/social');
const { parseUuidParam } = require('../lib/uuid');
const { parsePaginationParams } = require('../lib/pagination');
const { parseDiscoveryParams } = require('../lib/discovery');
const { track, contextFrom, capacityBucket, SOURCES } = require('../lib/analytics');
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

    /*
     * Only when the visitor actually searched or filtered — an unfiltered
     * browse is the Discover landing view, already reported by the frontend
     * as discover_viewed, and firing here too would double-count it.
     *
     * filter_keys records WHICH filters were used, never their values, and
     * has_query records only that a search happened. The search term itself
     * is visitor free text and never leaves the database.
     */
    const filterKeys = Object.entries(filters)
      .filter(([key, value]) => value !== null && key !== 'q' && key !== 'sort')
      .map(([key]) => key);

    if (filterKeys.length > 0 || filters.q) {
      track(
        'discover_query_used',
        {
          filter_keys: filterKeys,
          has_query: Boolean(filters.q),
          result_count: total,
        },
        contextFrom(req.demo)
      );
    }

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
 * Publishing an opportunity. Requires a real session, and the host is taken
 * from it — host_user_id is never read from the body, so a caller can never
 * publish as someone else or as an organization.
 */
router.post('/', requireDemoSession(), async (req, res, next) => {
  try {
    const opportunity = await opportunitiesService.createOpportunity({
      hostUserId: req.demo.user.id,
      sessionId: req.demo.sessionId,
      title: req.body?.title,
      type: req.body?.type,
      causeName: req.body?.causeName,
      description: req.body?.description,
      date: req.body?.date,
      startTime: req.body?.startTime,
      endTime: req.body?.endTime,
      isOnline: req.body?.isOnline,
      locationName: req.body?.locationName,
      city: req.body?.city,
      state: req.body?.state,
      capacity: req.body?.capacity,
    });

    track(
      'content_created',
      {
        type: 'opportunity',
        cause: opportunity.cause?.name ?? null,
        is_online: opportunity.location?.isOnline === true,
        capacity_bucket: capacityBucket(opportunity.capacity),
      },
      contextFrom(req.demo)
    );
    res.status(201).json({ opportunity });
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
    const { analytics, ...result } = await opportunitiesService.joinOpportunity({
      opportunityId: id,
      sessionId: req.demo.sessionId,
      userId: req.demo.user.id,
    });

    // `source` is the one property the browser knows better than the
    // server — which surface the visitor came from. Validated against the
    // shared vocabulary, and dropped entirely if it isn't one of them.
    const source = SOURCES.includes(req.body?.source) ? req.body.source : null;

    track(
      'opportunity_joined',
      { opportunity_id: id, ...analytics, ...(source ? { source } : {}) },
      contextFrom(req.demo)
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/*
 * Leaving an opportunity.
 *
 * DELETE is right at the product level even though no row is deleted: what
 * is being removed is the visitor's active participation. The registration
 * itself survives as 'cancelled', which is the state Join reactivates, so
 * leaving and rejoining reuses one relationship rather than accumulating
 * rows. Acting user comes from the session, same rule as Join.
 */
router.delete('/:id/join', requireDemoSession(), async (req, res, next) => {
  try {
    const id = parseUuidParam(req.params.id, 'opportunity id');
    const { analytics, ...result } = await opportunitiesService.leaveOpportunity({
      opportunityId: id,
      sessionId: req.demo.sessionId,
      userId: req.demo.user.id,
    });

    track(
      'opportunity_participation_changed',
      { opportunity_id: id, state: 'left', ...analytics },
      contextFrom(req.demo)
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/*
 * Save is a bookmark, not participation: no capacity, no social proof, no
 * effect on anyone else. Idempotent in both directions, and the acting user
 * comes from the session like every other write.
 */
router.post('/:id/save', requireDemoSession(), async (req, res, next) => {
  try {
    const id = parseUuidParam(req.params.id, 'opportunity id');
    const result = await socialService.saveOpportunity({
      opportunityId: id,
      sessionId: req.demo.sessionId,
      userId: req.demo.user.id,
    });
    track('opportunity_saved', { opportunity_id: id, state: 'saved' }, contextFrom(req.demo));
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/save', requireDemoSession(), async (req, res, next) => {
  try {
    const id = parseUuidParam(req.params.id, 'opportunity id');
    const result = await socialService.unsaveOpportunity({
      opportunityId: id,
      sessionId: req.demo.sessionId,
      userId: req.demo.user.id,
    });
    track('opportunity_saved', { opportunity_id: id, state: 'unsaved' }, contextFrom(req.demo));
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/*
 * Completion reads hours/story from the body — the visitor's own input
 * about their own participation, not a way to act as someone else. The
 * acting user and opportunity ownership still come only from the session.
 */
router.post('/:id/complete', requireDemoSession(), async (req, res, next) => {
  try {
    const id = parseUuidParam(req.params.id, 'opportunity id');
    const hours = Number(req.body?.hours);
    const story = typeof req.body?.story === 'string' ? req.body.story.trim() || null : null;

    const { analytics, ...result } = await activitiesService.completeOpportunity({
      opportunityId: id,
      userId: req.demo.user.id,
      hours,
      story,
    });

    // is_demo_path marks the flagship early-completion shortcut so it can be
    // excluded from an honest Join -> Complete rate.
    track('opportunity_completed', { opportunity_id: id, ...analytics }, contextFrom(req.demo));
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
