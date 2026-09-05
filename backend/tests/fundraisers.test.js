'use strict';

const request = require('supertest');

const { createApp } = require('../src/app');
const { query, closePool } = require('../src/db/pool');

const app = createApp();
const sessions = [];

async function newSession() {
  const res = await request(app).post('/api/v1/demo-sessions');
  sessions.push(res.body.sessionId);
  return res.body;
}

const list = (sessionId) => {
  const req = request(app).get('/api/v1/fundraisers');
  return sessionId ? req.set('X-Kynd-Session-Id', sessionId) : req;
};
const detail = (id, sessionId) => {
  const req = request(app).get(`/api/v1/fundraisers/${id}`);
  return sessionId ? req.set('X-Kynd-Session-Id', sessionId) : req;
};
const support = (id, sessionId, body) =>
  request(app)
    .post(`/api/v1/fundraisers/${id}/support`)
    .set('X-Kynd-Session-Id', sessionId)
    .send(body);
const createFundraiser = (sessionId, body) =>
  request(app).post('/api/v1/fundraisers').set('X-Kynd-Session-Id', sessionId).send(body);

function inDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const VALID = {
  title: "Frank's Winter Coat Drive",
  story: 'Raising money for warm coats for families across the west side this winter.',
  causeName: 'Community',
  beneficiaryName: 'Westside Family Shelter',
  goalAmountCents: 250000,
  endDate: inDays(45),
};

describe('Fundraisers', () => {
  let openSeededId;
  let endedSeededId;
  let cancelledSeededId;

  beforeAll(async () => {
    const open = await query(
      `SELECT id FROM fundraisers
       WHERE status = 'active' AND end_date >= (now() AT TIME ZONE 'America/New_York')::date
       ORDER BY id LIMIT 1`
    );
    openSeededId = open.rows[0].id;

    const ended = await query(
      `SELECT id FROM fundraisers
       WHERE status = 'active' AND end_date < (now() AT TIME ZONE 'America/New_York')::date
       ORDER BY id LIMIT 1`
    );
    endedSeededId = ended.rows[0].id;

    const cancelled = await query(
      `SELECT id FROM fundraisers WHERE status = 'cancelled' ORDER BY id LIMIT 1`
    );
    cancelledSeededId = cancelled.rows[0].id;
  });

  afterEach(async () => {
    if (sessions.length > 0) {
      // Cascades through the temporary user to its supports and fundraisers.
      await query(`DELETE FROM demo_sessions WHERE id = ANY($1::uuid[])`, [sessions]);
      sessions.length = 0;
    }
  });

  afterAll(async () => {
    await closePool();
  });

  describe('reads and derived progress', () => {
    it('lists only open fundraisers, anonymously and with a session', async () => {
      const anon = await list(null);
      expect(anon.status).toBe(200);
      expect(anon.body.fundraisers.length).toBeGreaterThan(0);
      for (const f of anon.body.fundraisers) {
        expect(f.status).toBe('active');
        expect(f.isEnded).toBe(false);
      }

      const { sessionId } = await newSession();
      expect((await list(sessionId)).status).toBe(200);
    });

    it('derives amount raised and supporter count from fundraiser_supports', async () => {
      const res = await detail(openSeededId, null);
      expect(res.status).toBe(200);
      const f = res.body.fundraiser;

      const truth = await query(
        `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS cents, COUNT(*)::int AS n
         FROM fundraiser_supports WHERE fundraiser_id = $1`,
        [openSeededId]
      );
      // Seeded supporters only here: no temporary user has supported it.
      expect(f.amountRaisedCents).toBe(Number(truth.rows[0].cents));
      expect(f.supporterCount).toBe(truth.rows[0].n);
      expect(f.progressPercent).toBe(
        Math.min(Math.round((f.amountRaisedCents / f.goalAmountCents) * 100), 100)
      );
    });

    it('exposes the fields the detail experience needs', async () => {
      const f = (await detail(openSeededId, null)).body.fundraiser;
      expect(typeof f.title).toBe('string');
      expect(typeof f.story).toBe('string');
      expect(f.cause.name).toBeTruthy();
      expect(f.creator.name).toBeTruthy();
      expect(f.beneficiary.name).toBeTruthy();
      expect(f.goalAmountCents).toBeGreaterThan(0);
      // end_date is a calendar DATE and must cross the boundary date-only.
      expect(f.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('404s an unknown fundraiser', async () => {
      const res = await detail('00000000-0000-4000-8000-000000000000', null);
      expect(res.status).toBe(404);
    });
  });

  describe('support', () => {
    it('requires a demo session', async () => {
      const res = await request(app)
        .post(`/api/v1/fundraisers/${openSeededId}/support`)
        .send({ amountCents: 2500 });
      expect(res.status).toBe(401);
    });

    it('rejects a non-positive, fractional, or absurd amount', async () => {
      const { sessionId } = await newSession();
      expect((await support(openSeededId, sessionId, { amountCents: 0 })).status).toBe(400);
      expect((await support(openSeededId, sessionId, { amountCents: -500 })).status).toBe(400);
      expect((await support(openSeededId, sessionId, { amountCents: 12.5 })).status).toBe(400);
      expect((await support(openSeededId, sessionId, { amountCents: 99999999 })).status).toBe(400);
      expect((await support(openSeededId, sessionId, {})).status).toBe(400);
    });

    it('increases raised amount and supporter count by exactly this support', async () => {
      const { sessionId, user } = await newSession();

      const before = (await detail(openSeededId, sessionId)).body.fundraiser;
      expect(before.viewerSupported).toBe(false);
      expect(before.canSupport).toBe(true);

      const res = await support(openSeededId, sessionId, { amountCents: 2500 });
      expect(res.status).toBe(200);
      expect(res.body.supported).toBe(true);

      const after = res.body.fundraiser;
      expect(after.amountRaisedCents).toBe(before.amountRaisedCents + 2500);
      expect(after.supporterCount).toBe(before.supporterCount + 1);
      expect(after.viewerSupported).toBe(true);
      // One-time, not additive: no second support is offered.
      expect(after.canSupport).toBe(false);

      // A real row owned by the session's user.
      const rows = await query(
        `SELECT amount_cents FROM fundraiser_supports WHERE user_id = $1 AND fundraiser_id = $2`,
        [user.id, openSeededId]
      );
      expect(rows.rows).toHaveLength(1);
      expect(Number(rows.rows[0].amount_cents)).toBe(2500);

      // Survives a re-read.
      const reread = (await detail(openSeededId, sessionId)).body.fundraiser;
      expect(reread.amountRaisedCents).toBe(after.amountRaisedCents);
      expect(reread.viewerSupported).toBe(true);
    });

    it('rejects a second support from the same user, cleanly and without a second row', async () => {
      const { sessionId, user } = await newSession();
      await support(openSeededId, sessionId, { amountCents: 2500 });

      const repeat = await support(openSeededId, sessionId, { amountCents: 5000 });
      expect(repeat.status).toBe(409);
      expect(repeat.body.error.code).toBe('fundraiser_already_supported');

      const rows = await query(
        `SELECT COUNT(*)::int n FROM fundraiser_supports WHERE user_id = $1 AND fundraiser_id = $2`,
        [user.id, openSeededId]
      );
      expect(rows.rows[0].n).toBe(1);
    });

    it('cannot support an ended or cancelled fundraiser', async () => {
      const { sessionId } = await newSession();

      const ended = await support(endedSeededId, sessionId, { amountCents: 2500 });
      expect(ended.status).toBe(409);
      expect(ended.body.error.code).toBe('fundraiser_ended');

      const cancelled = await support(cancelledSeededId, sessionId, { amountCents: 2500 });
      expect(cancelled.status).toBe(409);
      expect(cancelled.body.error.code).toBe('fundraiser_not_supportable');

      expect((await detail(endedSeededId, sessionId)).body.fundraiser.canSupport).toBe(false);
      expect((await detail(cancelledSeededId, sessionId)).body.fundraiser.canSupport).toBe(false);
    });

    it("session isolation: one visitor's support is invisible to another and to anonymous", async () => {
      const a = await newSession();
      const b = await newSession();

      const baseline = (await detail(openSeededId, b.sessionId)).body.fundraiser;
      await support(openSeededId, a.sessionId, { amountCents: 7500 });

      const bView = (await detail(openSeededId, b.sessionId)).body.fundraiser;
      expect(bView.amountRaisedCents).toBe(baseline.amountRaisedCents);
      expect(bView.supporterCount).toBe(baseline.supporterCount);
      expect(bView.viewerSupported).toBe(false);
      expect(bView.canSupport).toBe(true);

      const anonView = (await detail(openSeededId, null)).body.fundraiser;
      expect(anonView.amountRaisedCents).toBe(baseline.amountRaisedCents);

      // A still sees their own.
      const aView = (await detail(openSeededId, a.sessionId)).body.fundraiser;
      expect(aView.amountRaisedCents).toBe(baseline.amountRaisedCents + 7500);
    });
  });

  describe('creating a fundraiser', () => {
    it('requires a demo session', async () => {
      const res = await request(app).post('/api/v1/fundraisers').send(VALID);
      expect(res.status).toBe(401);
    });

    it('validates goal, cause, required text, and end date', async () => {
      const { sessionId } = await newSession();
      expect((await createFundraiser(sessionId, { ...VALID, goalAmountCents: 0 })).status).toBe(400);
      expect((await createFundraiser(sessionId, { ...VALID, goalAmountCents: -100 })).status).toBe(400);
      expect((await createFundraiser(sessionId, { ...VALID, causeName: 'Motorsport' })).status).toBe(400);
      expect((await createFundraiser(sessionId, { ...VALID, title: '  ' })).status).toBe(400);
      expect((await createFundraiser(sessionId, { ...VALID, story: '' })).status).toBe(400);
      expect((await createFundraiser(sessionId, { ...VALID, beneficiaryName: '' })).status).toBe(400);
      // End date today or earlier is not a future fundraiser.
      expect((await createFundraiser(sessionId, { ...VALID, endDate: inDays(0) })).status).toBe(400);
      expect((await createFundraiser(sessionId, { ...VALID, endDate: inDays(-5) })).status).toBe(400);
      expect((await createFundraiser(sessionId, { ...VALID, endDate: 'soon' })).status).toBe(400);
    });

    it('creates a real active row owned by the session user, ignoring any caller-supplied creator', async () => {
      const { sessionId, user } = await newSession();
      const seeded = await query(`SELECT id FROM users WHERE demo_session_id IS NULL LIMIT 1`);
      const org = await query(`SELECT id FROM organizations LIMIT 1`);

      const res = await createFundraiser(sessionId, {
        ...VALID,
        creator_user_id: seeded.rows[0].id,
        creatorUserId: seeded.rows[0].id,
        creator_organization_id: org.rows[0].id,
      });
      expect(res.status).toBe(201);
      const created = res.body.fundraiser;

      const rows = await query(
        `SELECT creator_user_id, creator_organization_id, status, goal_amount_cents,
                beneficiary_name, image_url, to_char(end_date, 'YYYY-MM-DD') AS end_date
         FROM fundraisers WHERE id = $1`,
        [created.id]
      );
      expect(rows.rows[0].creator_user_id).toBe(user.id);
      expect(rows.rows[0].creator_organization_id).toBeNull();
      expect(rows.rows[0].status).toBe('active');
      expect(Number(rows.rows[0].goal_amount_cents)).toBe(250000);
      expect(rows.rows[0].end_date).toBe(VALID.endDate);
      // No upload infrastructure: media resolves deterministically on the client.
      expect(rows.rows[0].image_url).toBeNull();

      expect(created.creator).toMatchObject({ type: 'user', id: user.id, name: 'Frank Enstien' });
      // Brand new: nothing raised yet, and open to support.
      expect(created.amountRaisedCents).toBe(0);
      expect(created.supporterCount).toBe(0);
      expect(created.canSupport).toBe(true);
    });

    it('links a beneficiary that matches a Kynd organization, case-insensitively', async () => {
      const { sessionId } = await newSession();
      const res = await createFundraiser(sessionId, {
        ...VALID,
        beneficiaryName: 'riverlight atlanta',
      });
      expect(res.status).toBe(201);
      expect(res.body.fundraiser.beneficiary).toEqual({
        id: '12437f75-adcd-597c-96ee-94534faed332',
        name: 'Riverlight Atlanta',
      });
    });

    it('is visible to its creator and can be supported by them', async () => {
      const { sessionId } = await newSession();
      // The list is capped and ordered by soonest deadline, so a fundraiser
      // ending tomorrow sorts to the front. That makes this assertion (and
      // the invisibility one below) genuinely load-bearing rather than
      // passing simply because the row fell off the end of the page.
      const created = (await createFundraiser(sessionId, { ...VALID, endDate: inDays(1) })).body
        .fundraiser;

      expect((await detail(created.id, sessionId)).status).toBe(200);
      expect((await list(sessionId)).body.fundraisers.map((f) => f.id)).toContain(created.id);

      const res = await support(created.id, sessionId, { amountCents: 5000 });
      expect(res.status).toBe(200);
      expect(res.body.fundraiser.amountRaisedCents).toBe(5000);
      expect(res.body.fundraiser.supporterCount).toBe(1);
    });

    it('is invisible to another session and to anonymous visitors', async () => {
      const a = await newSession();
      const b = await newSession();
      // Ends tomorrow, so it would sort to the front of the list if the
      // visibility rule were not applied.
      const created = (await createFundraiser(a.sessionId, { ...VALID, endDate: inDays(1) })).body
        .fundraiser;

      expect((await detail(created.id, b.sessionId)).status).toBe(404);
      expect((await detail(created.id, null)).status).toBe(404);
      expect((await list(b.sessionId)).body.fundraisers.map((f) => f.id)).not.toContain(created.id);
      expect((await list(null)).body.fundraisers.map((f) => f.id)).not.toContain(created.id);
      // ...while it IS at the front for its creator.
      expect((await list(a.sessionId)).body.fundraisers.map((f) => f.id)).toContain(created.id);

      // Not supportable by id either, rather than merely undiscoverable.
      expect((await support(created.id, b.sessionId, { amountCents: 2500 })).status).toBe(404);

      // A's own view is unaffected.
      expect((await detail(created.id, a.sessionId)).status).toBe(200);
    });
  });

  /*
   * Amount Raised is the one profile metric that aggregates over OTHER
   * people's rows, so making support writable is what makes it leakable.
   */
  describe('profile Amount Raised propagation', () => {
    it("credits the creator for the viewer's own support, and never for another visitor's", async () => {
      const a = await newSession();
      const b = await newSession();

      const created = (await createFundraiser(a.sessionId, VALID)).body.fundraiser;
      const profile = (id, sessionId) =>
        request(app).get(`/api/v1/users/${id}/profile`).set('X-Kynd-Session-Id', sessionId);

      expect((await profile(a.user.id, a.sessionId)).body.profile.metrics.amountRaisedCents).toBe(0);

      await support(created.id, a.sessionId, { amountCents: 5000 });
      expect((await profile(a.user.id, a.sessionId)).body.profile.metrics.amountRaisedCents).toBe(
        5000
      );

      // A seeded creator's Amount Raised must not move for other visitors
      // when one visitor supports their fundraiser.
      const seededCreator = await query(
        `SELECT f.id AS fundraiser_id, f.creator_user_id
         FROM fundraisers f
         WHERE f.creator_user_id IS NOT NULL
           AND f.status = 'active'
           AND f.end_date >= (now() AT TIME ZONE 'America/New_York')::date
         ORDER BY f.id LIMIT 1`
      );
      const { fundraiser_id: seededFundraiserId, creator_user_id: creatorId } =
        seededCreator.rows[0];

      const beforeForB = (await profile(creatorId, b.sessionId)).body.profile.metrics
        .amountRaisedCents;
      await support(seededFundraiserId, a.sessionId, { amountCents: 9900 });

      const afterForB = (await profile(creatorId, b.sessionId)).body.profile.metrics
        .amountRaisedCents;
      expect(afterForB).toBe(beforeForB);

      // ...but A does see their own contribution reflected.
      const afterForA = (await profile(creatorId, a.sessionId)).body.profile.metrics
        .amountRaisedCents;
      expect(afterForA).toBe(beforeForB + 9900);
    });
  });

  describe('runtime role', () => {
    it('kynd_app has INSERT on both fundraiser tables, and no UPDATE or DELETE', async () => {
      const { pool } = require('../src/db/pool');
      const { rows } = await pool.query(
        `SELECT t,
                has_table_privilege('kynd_app', t, 'SELECT') AS sel,
                has_table_privilege('kynd_app', t, 'INSERT') AS ins,
                has_table_privilege('kynd_app', t, 'UPDATE') AS upd,
                has_table_privilege('kynd_app', t, 'DELETE') AS del
         FROM unnest(ARRAY['fundraisers', 'fundraiser_supports']) t`
      );
      for (const row of rows) {
        expect(row).toMatchObject({ sel: true, ins: true, upd: false, del: false });
      }
    });
  });
});
