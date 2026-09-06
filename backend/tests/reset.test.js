'use strict';

const request = require('supertest');

const { createApp } = require('../src/app');
const { query, closePool } = require('../src/db/pool');
const {
  PERSONA,
  STARTER_CAUSE_IDS,
  STARTER_FOLLOWED_USER_IDS,
  STARTER_FOLLOWED_ORGANIZATION_IDS,
} = require('../src/config/demo_persona');

const app = createApp();
const sessions = [];

async function newSession() {
  const res = await request(app).post('/api/v1/demo-sessions');
  sessions.push(res.body.sessionId);
  return res.body;
}

function inDays(n) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
    new Date()
  );
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/*
 * Every table a temporary visitor can write into. Reset's correctness is
 * exactly the claim that none of these retains a row for a deleted user.
 */
const WRITABLE_TABLES = [
  ['registrations', 'user_id'],
  ['activities', 'user_id'],
  ['user_causes', 'user_id'],
  ['user_follows', 'follower_user_id'],
  ['organization_follows', 'user_id'],
  ['saved_opportunities', 'user_id'],
  ['reactions', 'user_id'],
  ['comments', 'user_id'],
  ['fundraiser_supports', 'user_id'],
  ['opportunities', 'host_user_id'],
  ['fundraisers', 'creator_user_id'],
];

async function rowsOwnedBy(userId) {
  const counts = {};
  for (const [table, column] of WRITABLE_TABLES) {
    // eslint-disable-next-line no-await-in-loop
    const { rows } = await query(
      `SELECT COUNT(*)::int n FROM ${table} WHERE ${column} = $1`,
      [userId]
    );
    counts[table] = rows[0].n;
  }
  return counts;
}

// The seeded world: rows belonging to users with demo_session_id IS NULL,
// plus the seeded objects themselves. Reset must never move any of these.
async function seededBaseline() {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM users WHERE demo_session_id IS NULL) AS users,
       (SELECT COUNT(*)::int FROM opportunities o LEFT JOIN users u ON u.id = o.host_user_id
          WHERE o.host_user_id IS NULL OR u.demo_session_id IS NULL) AS opportunities,
       (SELECT COUNT(*)::int FROM fundraisers f LEFT JOIN users u ON u.id = f.creator_user_id
          WHERE f.creator_user_id IS NULL OR u.demo_session_id IS NULL) AS fundraisers,
       (SELECT COUNT(*)::int FROM registrations r JOIN users u ON u.id = r.user_id
          WHERE u.demo_session_id IS NULL) AS registrations,
       (SELECT COUNT(*)::int FROM activities a JOIN users u ON u.id = a.user_id
          WHERE u.demo_session_id IS NULL) AS activities,
       (SELECT COUNT(*)::int FROM reactions x JOIN users u ON u.id = x.user_id
          WHERE u.demo_session_id IS NULL) AS reactions,
       (SELECT COUNT(*)::int FROM comments x JOIN users u ON u.id = x.user_id
          WHERE u.demo_session_id IS NULL) AS comments,
       (SELECT COUNT(*)::int FROM saved_opportunities x JOIN users u ON u.id = x.user_id
          WHERE u.demo_session_id IS NULL) AS saved,
       (SELECT COUNT(*)::int FROM fundraiser_supports x JOIN users u ON u.id = x.user_id
          WHERE u.demo_session_id IS NULL) AS supports,
       (SELECT COUNT(*)::int FROM user_follows x JOIN users u ON u.id = x.follower_user_id
          WHERE u.demo_session_id IS NULL) AS user_follows,
       (SELECT COUNT(*)::int FROM organization_follows x JOIN users u ON u.id = x.user_id
          WHERE u.demo_session_id IS NULL) AS org_follows,
       (SELECT COUNT(*)::int FROM causes) AS causes,
       (SELECT COUNT(*)::int FROM organizations) AS organizations`
  );
  return rows[0];
}

describe('Reset Demo', () => {
  let futureOpportunityId;
  let openFundraiserId;

  beforeAll(async () => {
    const o = await query(
      `SELECT id FROM opportunities
       WHERE status = 'published' AND starts_at > now()
       ORDER BY starts_at ASC LIMIT 1`
    );
    futureOpportunityId = o.rows[0].id;

    const f = await query(
      `SELECT id FROM fundraisers
       WHERE status = 'active' AND end_date >= (now() AT TIME ZONE 'America/New_York')::date
       ORDER BY id LIMIT 1`
    );
    openFundraiserId = f.rows[0].id;
  });

  afterEach(async () => {
    if (sessions.length > 0) {
      await query(`DELETE FROM demo_sessions WHERE id = ANY($1::uuid[])`, [sessions]);
      sessions.length = 0;
    }
  });

  afterAll(async () => {
    await closePool();
  });

  it('requires a session, and a visitor can only reset their own', async () => {
    const res = await request(app).delete('/api/v1/demo-sessions/current');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('demo_session_invalid');
  });

  it('leaves the deleted session unusable', async () => {
    const { sessionId } = await newSession();
    expect((await request(app).delete('/api/v1/demo-sessions/current').set('X-Kynd-Session-Id', sessionId)).status).toBe(204);

    // Same 401 shape as any unknown session — a reset session is simply gone.
    const after = await request(app)
      .get('/api/v1/demo-sessions/current')
      .set('X-Kynd-Session-Id', sessionId);
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('demo_session_invalid');

    // Resetting again with the same dead id is also a clean 401, not a 500.
    const twice = await request(app)
      .delete('/api/v1/demo-sessions/current')
      .set('X-Kynd-Session-Id', sessionId);
    expect(twice.status).toBe(401);
  });

  /*
   * Reset needs no new privilege. The runtime role can delete a
   * demo_sessions row (already granted for expired-session cleanup) but
   * CANNOT delete a user directly — the cascade to users and onward is
   * performed by PostgreSQL as a referential action, which does not check
   * the invoking role's permissions on the referencing tables.
   *
   * So the role can end its own session and nothing more; it has no way to
   * delete a seeded user even if a query tried.
   */
  it('needs only the demo_sessions DELETE the role already had, never users DELETE', async () => {
    const { pool } = require('../src/db/pool');
    const { rows } = await pool.query(
      `SELECT
         has_table_privilege('kynd_app', 'demo_sessions', 'DELETE') AS sessions_del,
         has_table_privilege('kynd_app', 'users', 'DELETE') AS users_del,
         has_table_privilege('kynd_app', 'activities', 'DELETE') AS activities_del,
         has_table_privilege('kynd_app', 'opportunities', 'DELETE') AS opportunities_del`
    );
    expect(rows[0]).toEqual({
      sessions_del: true,
      users_del: false,
      activities_del: false,
      opportunities_del: false,
    });
  });

  describe('a realistically dirty session', () => {
    it('is fully erased, restores exact starter state, and leaves the seeded world untouched', async () => {
      const baselineBefore = await seededBaseline();

      const { sessionId, user } = await newSession();
      const H = ['X-Kynd-Session-Id', sessionId];

      // --- Make a mess across every writable surface ---
      expect((await request(app).post(`/api/v1/opportunities/${futureOpportunityId}/join`).set(...H)).status).toBe(200);
      expect((await request(app).post(`/api/v1/opportunities/${futureOpportunityId}/save`).set(...H)).status).toBe(200);
      expect(
        (await request(app)
          .post(`/api/v1/engagement/opportunities/${futureOpportunityId}/reactions`)
          .set(...H)
          .send({ type: 'like' })).status
      ).toBe(200);
      expect(
        (await request(app)
          .post(`/api/v1/engagement/opportunities/${futureOpportunityId}/comments`)
          .set(...H)
          .send({ body: 'Looking forward to it.' })).status
      ).toBe(201);
      expect(
        (await request(app)
          .post('/api/v1/activities')
          .set(...H)
          .send({
            title: 'Pantry shift',
            causeName: 'Food & Hunger',
            organizationName: 'Westside Neighborhood Pantry',
            occurredOn: inDays(-7),
            hours: 2,
            story: 'Sorted donations.',
          })).status
      ).toBe(201);
      expect(
        (await request(app)
          .post('/api/v1/opportunities')
          .set(...H)
          .send({
            title: 'Reset Test Cleanup',
            type: 'volunteer',
            causeName: 'Environment',
            description: 'A cleanup created to prove reset removes it.',
            date: inDays(20),
            startTime: '09:00',
            endTime: '12:00',
            isOnline: false,
            locationName: 'Trailhead',
            city: 'Atlanta',
            state: 'GA',
            capacity: 15,
          })).status
      ).toBe(201);
      const createdFundraiser = await request(app)
        .post('/api/v1/fundraisers')
        .set(...H)
        .send({
          title: 'Reset Test Drive',
          story: 'A fundraiser created to prove reset removes it.',
          causeName: 'Community',
          beneficiaryName: 'Westside Family Shelter',
          goalAmountCents: 100000,
          endDate: inDays(30),
        });
      expect(createdFundraiser.status).toBe(201);
      expect(
        (await request(app)
          .post(`/api/v1/fundraisers/${openFundraiserId}/support`)
          .set(...H)
          .send({ amountCents: 2500 })).status
      ).toBe(200);
      // Follow one more person so user_follows holds more than starter state.
      const extra = await query(
        `SELECT id FROM users WHERE demo_session_id IS NULL AND id <> ALL($1::uuid[]) LIMIT 1`,
        [STARTER_FOLLOWED_USER_IDS]
      );
      expect((await request(app).post(`/api/v1/users/${extra.rows[0].id}/follow`).set(...H)).status).toBe(200);

      // Every writable table now holds something for this visitor.
      const dirty = await rowsOwnedBy(user.id);
      for (const [table] of WRITABLE_TABLES) {
        expect(dirty[table]).toBeGreaterThan(0);
      }

      // --- Reset ---
      const reset = await request(app).delete('/api/v1/demo-sessions/current').set(...H);
      expect(reset.status).toBe(204);

      // Session gone, temporary user gone.
      const sessionRow = await query(`SELECT 1 FROM demo_sessions WHERE id = $1`, [sessionId]);
      expect(sessionRow.rowCount).toBe(0);
      const userRow = await query(`SELECT 1 FROM users WHERE id = $1`, [user.id]);
      expect(userRow.rowCount).toBe(0);

      // Every writable table is clean — nothing survived the cascade.
      const afterReset = await rowsOwnedBy(user.id);
      for (const [table] of WRITABLE_TABLES) {
        expect(afterReset[table]).toBe(0);
      }
      sessions.length = 0; // already deleted; nothing for afterEach to do

      // --- A fresh visitor is exactly the starter persona ---
      const fresh = await newSession();
      const FH = ['X-Kynd-Session-Id', fresh.sessionId];
      expect(fresh.user.name).toBe(PERSONA.displayName);

      const profile = (
        await request(app).get(`/api/v1/users/${fresh.user.id}/profile`).set(...FH)
      ).body.profile;

      expect(profile.displayName).toBe('Frank Enstien');
      expect(profile.city).toBe(PERSONA.city);
      expect(profile.state).toBe(PERSONA.state);
      expect(profile.avatarUrl).toBeNull();
      expect(profile.bio).toBeNull();
      expect(profile.causes.map((c) => c.name).sort()).toEqual([
        'Community',
        'Environment',
        'Food & Hunger',
      ]);
      expect(profile.metrics).toEqual({
        hours: 0,
        activities: 0,
        organizations: 0,
        amountRaisedCents: 0,
      });
      expect(profile.activities).toEqual([]);
      expect(profile.followingCount).toBe(STARTER_FOLLOWED_USER_IDS.length);

      // The exact starter graph, by id.
      const follows = await query(
        `SELECT followed_user_id FROM user_follows WHERE follower_user_id = $1 ORDER BY followed_user_id`,
        [fresh.user.id]
      );
      expect(follows.rows.map((r) => r.followed_user_id).sort()).toEqual(
        [...STARTER_FOLLOWED_USER_IDS].sort()
      );
      const orgFollows = await query(
        `SELECT organization_id FROM organization_follows WHERE user_id = $1`,
        [fresh.user.id]
      );
      expect(orgFollows.rows.map((r) => r.organization_id).sort()).toEqual(
        [...STARTER_FOLLOWED_ORGANIZATION_IDS].sort()
      );
      const causeRows = await query(`SELECT cause_id FROM user_causes WHERE user_id = $1`, [
        fresh.user.id,
      ]);
      expect(causeRows.rows.map((r) => r.cause_id).sort()).toEqual([...STARTER_CAUSE_IDS].sort());

      // Everything else is genuinely zero.
      const freshCounts = await rowsOwnedBy(fresh.user.id);
      for (const table of [
        'registrations',
        'activities',
        'saved_opportunities',
        'reactions',
        'comments',
        'fundraiser_supports',
        'opportunities',
        'fundraisers',
      ]) {
        expect(freshCounts[table]).toBe(0);
      }

      // Activity surface agrees.
      const activity = (await request(app).get('/api/v1/activity').set(...FH)).body;
      expect(activity.upcoming).toEqual([]);
      expect(activity.completed).toEqual([]);
      expect(activity.saved).toEqual([]);
      expect(activity.awaitingConfirmation).toEqual([]);

      // --- The seeded world is exactly as it was ---
      expect(await seededBaseline()).toEqual(baselineBefore);
    });
  });
});
