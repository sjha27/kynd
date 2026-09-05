'use strict';

const request = require('supertest');

const { createApp } = require('../src/app');
const { query, closePool } = require('../src/db/pool');

const RIVERLIGHT_ID = '12437f75-adcd-597c-96ee-94534faed332';
const RIVERLIGHT_NAME = 'Riverlight Atlanta';

const app = createApp();
const sessions = [];

async function newSession() {
  const res = await request(app).post('/api/v1/demo-sessions');
  sessions.push(res.body.sessionId);
  return res.body;
}

const logActivity = (sessionId, body) =>
  request(app).post('/api/v1/activities').set('X-Kynd-Session-Id', sessionId).send(body);
const activity = (sessionId) =>
  request(app).get('/api/v1/activity').set('X-Kynd-Session-Id', sessionId);
const profile = (id, sessionId) =>
  request(app).get(`/api/v1/users/${id}/profile`).set('X-Kynd-Session-Id', sessionId);

// A real past calendar date, so the "not in the future" rule is exercised
// against the actual clock rather than a fabricated one.
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function inDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const EXTERNAL_LOG = {
  title: 'Saturday shift at the pantry',
  causeName: 'Food & Hunger',
  organizationName: 'Westside Neighborhood Pantry',
  occurredOn: daysAgo(7),
  hours: 2,
  story: 'Sorted and boxed donations with a few neighbors.',
};

describe('Manual activity logging', () => {
  afterEach(async () => {
    if (sessions.length > 0) {
      await query(`DELETE FROM demo_sessions WHERE id = ANY($1::uuid[])`, [sessions]);
      sessions.length = 0;
    }
  });

  afterAll(async () => {
    await closePool();
  });

  it('requires a demo session', async () => {
    const res = await request(app).post('/api/v1/activities').send(EXTERNAL_LOG);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('demo_session_invalid');
  });

  describe('validation', () => {
    it('rejects a future date', async () => {
      const { sessionId } = await newSession();
      const res = await logActivity(sessionId, { ...EXTERNAL_LOG, occurredOn: inDays(3) });
      expect(res.status).toBe(400);
    });

    it('rejects a malformed or impossible date', async () => {
      const { sessionId } = await newSession();
      expect((await logActivity(sessionId, { ...EXTERNAL_LOG, occurredOn: 'last Tuesday' })).status).toBe(400);
      expect((await logActivity(sessionId, { ...EXTERNAL_LOG, occurredOn: '2026-02-31' })).status).toBe(400);
    });

    it('rejects non-positive, missing, or non-numeric hours', async () => {
      const { sessionId } = await newSession();
      expect((await logActivity(sessionId, { ...EXTERNAL_LOG, hours: 0 })).status).toBe(400);
      expect((await logActivity(sessionId, { ...EXTERNAL_LOG, hours: -3 })).status).toBe(400);
      expect((await logActivity(sessionId, { ...EXTERNAL_LOG, hours: undefined })).status).toBe(400);
      expect((await logActivity(sessionId, { ...EXTERNAL_LOG, hours: 'three' })).status).toBe(400);
    });

    it('rejects a cause outside the seeded set', async () => {
      const { sessionId } = await newSession();
      const res = await logActivity(sessionId, { ...EXTERNAL_LOG, causeName: 'Motorsport' });
      expect(res.status).toBe(400);
    });

    it('rejects a missing title or organization', async () => {
      const { sessionId } = await newSession();
      expect((await logActivity(sessionId, { ...EXTERNAL_LOG, title: '   ' })).status).toBe(400);
      expect((await logActivity(sessionId, { ...EXTERNAL_LOG, organizationName: '' })).status).toBe(400);
    });

    it('writes no row when validation fails', async () => {
      const { sessionId, user } = await newSession();
      await logActivity(sessionId, { ...EXTERNAL_LOG, occurredOn: inDays(1) });
      const rows = await query(`SELECT COUNT(*)::int n FROM activities WHERE user_id = $1`, [user.id]);
      expect(rows.rows[0].n).toBe(0);
    });
  });

  describe('an external organization', () => {
    it('creates the activity in the correct manual source shape, owned by the session user', async () => {
      const { sessionId, user } = await newSession();

      const res = await logActivity(sessionId, EXTERNAL_LOG);
      expect(res.status).toBe(201);
      expect(res.body.logged).toBe(true);

      const { rows } = await query(
        `SELECT user_id, registration_id, occurred_on, hours,
                manual_title, manual_cause_id, manual_organization_id, manual_organization_name,
                story, image_url
         FROM activities WHERE id = $1`,
        [res.body.activityId]
      );
      expect(rows).toHaveLength(1);
      const row = rows[0];

      expect(row.user_id).toBe(user.id);
      expect(row.registration_id).toBeNull();
      expect(row.manual_title).toBe(EXTERNAL_LOG.title);
      expect(row.manual_cause_id).not.toBeNull();
      // External: named but not linked to a Kynd organization.
      expect(row.manual_organization_id).toBeNull();
      expect(row.manual_organization_name).toBe(EXTERNAL_LOG.organizationName);
      expect(Number(row.hours)).toBe(2);
      expect(row.story).toBe(EXTERNAL_LOG.story);
      // No media-upload infrastructure exists, so this stays null.
      expect(row.image_url).toBeNull();
    });

    it('appears in Activity -> Completed and survives a re-read', async () => {
      const { sessionId } = await newSession();
      await logActivity(sessionId, EXTERNAL_LOG);

      const res = await activity(sessionId);
      expect(res.body.completed).toHaveLength(1);

      const item = res.body.completed[0];
      expect(item.source).toBe('manual');
      expect(item.opportunityId).toBeNull();
      expect(item.title).toBe(EXTERNAL_LOG.title);
      expect(item.hours).toBe(2);
      expect(item.story).toBe(EXTERNAL_LOG.story);
      expect(item.occurredOn).toBe(EXTERNAL_LOG.occurredOn);
      expect(item.cause).toEqual({ name: 'Food & Hunger' });
      expect(item.host).toEqual({
        type: 'external',
        id: null,
        name: EXTERNAL_LOG.organizationName,
      });

      // It is real persisted state, not a response-shaped artifact.
      const reread = await activity(sessionId);
      expect(reread.body.completed).toHaveLength(1);
      expect(reread.body.upcoming).toEqual([]);
    });

    it('updates Hours, Activities and Organizations, and leaves Amount Raised alone', async () => {
      const { sessionId, user } = await newSession();

      const fresh = await profile(user.id, sessionId);
      expect(fresh.body.profile.metrics).toEqual({
        hours: 0,
        activities: 0,
        organizations: 0,
        amountRaisedCents: 0,
      });

      await logActivity(sessionId, EXTERNAL_LOG);

      const after = await profile(user.id, sessionId);
      expect(after.body.profile.metrics).toEqual({
        hours: 2,
        activities: 1,
        organizations: 1,
        amountRaisedCents: 0,
      });
    });

    it('counts a second activity with the same external organization as one organization', async () => {
      const { sessionId, user } = await newSession();
      await logActivity(sessionId, EXTERNAL_LOG);
      await logActivity(sessionId, { ...EXTERNAL_LOG, title: 'Another shift', hours: 1.5 });

      const after = await profile(user.id, sessionId);
      expect(after.body.profile.metrics.hours).toBe(3.5);
      expect(after.body.profile.metrics.activities).toBe(2);
      expect(after.body.profile.metrics.organizations).toBe(1);
    });
  });

  describe('an existing Kynd organization', () => {
    it('links the organization by id and presents it as a real Kynd host', async () => {
      const { sessionId, user } = await newSession();

      // Typed with different casing: matching is case-insensitive, and the
      // stored name is the organization's canonical one.
      const res = await logActivity(sessionId, {
        ...EXTERNAL_LOG,
        title: 'Trail cleanup with Riverlight',
        causeName: 'Environment',
        organizationName: 'riverlight atlanta',
        hours: 3,
        story: null,
      });
      expect(res.status).toBe(201);

      const { rows } = await query(
        `SELECT manual_organization_id, manual_organization_name, story
         FROM activities WHERE id = $1`,
        [res.body.activityId]
      );
      expect(rows[0].manual_organization_id).toBe(RIVERLIGHT_ID);
      expect(rows[0].manual_organization_name).toBe(RIVERLIGHT_NAME);
      expect(rows[0].story).toBeNull();

      const list = await activity(sessionId);
      expect(list.body.completed[0].host).toEqual({
        type: 'organization',
        id: RIVERLIGHT_ID,
        name: RIVERLIGHT_NAME,
      });

      const after = await profile(user.id, sessionId);
      expect(after.body.profile.metrics).toEqual({
        hours: 3,
        activities: 1,
        organizations: 1,
        amountRaisedCents: 0,
      });
    });
  });

  /*
   * occurred_on is a calendar DATE. It must cross the API boundary as the
   * same day it is stored as, whatever timezone the Node process runs in —
   * locally America/New_York, on Render UTC. Pinned to a literal stored date
   * so the assertion cannot drift with the real clock.
   */
  it('returns a stored date of 2026-09-05 as the date-only string 2026-09-05', async () => {
    const { sessionId, user } = await newSession();

    const inserted = await query(
      `INSERT INTO activities
         (id, user_id, occurred_on, hours, manual_title, manual_cause_id, manual_organization_name)
       VALUES (gen_random_uuid(), $1, DATE '2026-09-05', 2,
               'Pinned date check', (SELECT id FROM causes WHERE name = 'Community'), 'Somewhere')
       RETURNING id`,
      [user.id]
    );

    const res = await activity(sessionId);
    const item = res.body.completed.find((a) => a.id === inserted.rows[0].id);
    expect(item.occurredOn).toBe('2026-09-05');
  });

  it("session isolation: another visitor's manual activity is invisible and does not affect their metrics", async () => {
    const a = await newSession();
    const b = await newSession();

    await logActivity(a.sessionId, EXTERNAL_LOG);

    const bActivity = await activity(b.sessionId);
    expect(bActivity.body.completed).toEqual([]);

    const bProfile = await profile(b.user.id, b.sessionId);
    expect(bProfile.body.profile.metrics).toEqual({
      hours: 0,
      activities: 0,
      organizations: 0,
      amountRaisedCents: 0,
    });

    // A's own state is untouched by B existing.
    const aActivity = await activity(a.sessionId);
    expect(aActivity.body.completed).toHaveLength(1);
  });

  it('a manual activity and a Kynd-originated one coexist in one history', async () => {
    const { sessionId, user } = await newSession();
    const FLAGSHIP = 'bc09559d-77de-5bde-b248-00a1480d6d94';

    await request(app)
      .post(`/api/v1/opportunities/${FLAGSHIP}/join`)
      .set('X-Kynd-Session-Id', sessionId);
    await request(app)
      .post(`/api/v1/opportunities/${FLAGSHIP}/complete`)
      .set('X-Kynd-Session-Id', sessionId)
      .send({ hours: 3, story: null });

    await logActivity(sessionId, EXTERNAL_LOG);

    const res = await activity(sessionId);
    expect(res.body.completed).toHaveLength(2);
    expect(res.body.completed.map((a) => a.source).sort()).toEqual(['kynd', 'manual']);

    const kynd = res.body.completed.find((a) => a.source === 'kynd');
    expect(kynd.opportunityId).toBe(FLAGSHIP);
    expect(kynd.host.name).toBe(RIVERLIGHT_NAME);

    const after = await profile(user.id, sessionId);
    expect(after.body.profile.metrics).toEqual({
      hours: 5,
      activities: 2,
      organizations: 2,
      amountRaisedCents: 0,
    });
  });
});
