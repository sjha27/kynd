'use strict';

const request = require('supertest');

const { createApp } = require('../src/app');
const { query, closePool } = require('../src/db/pool');

const FLAGSHIP = 'bc09559d-77de-5bde-b248-00a1480d6d94';

const app = createApp();
const sessions = [];

async function newSession() {
  const res = await request(app).post('/api/v1/demo-sessions');
  sessions.push(res.body.sessionId);
  return res.body;
}

const engagement = (type, id, sessionId) => {
  const req = request(app).get(`/api/v1/engagement/${type}/${id}`);
  return sessionId ? req.set('X-Kynd-Session-Id', sessionId) : req;
};
const react = (type, id, sessionId, reactionType) =>
  request(app)
    .post(`/api/v1/engagement/${type}/${id}/reactions`)
    .set('X-Kynd-Session-Id', sessionId)
    .send({ type: reactionType });
const comment = (type, id, sessionId, body) =>
  request(app)
    .post(`/api/v1/engagement/${type}/${id}/comments`)
    .set('X-Kynd-Session-Id', sessionId)
    .send({ body });
const save = (id, sessionId) =>
  request(app).post(`/api/v1/opportunities/${id}/save`).set('X-Kynd-Session-Id', sessionId);
const unsave = (id, sessionId) =>
  request(app).delete(`/api/v1/opportunities/${id}/save`).set('X-Kynd-Session-Id', sessionId);
const activity = (sessionId) =>
  request(app).get('/api/v1/activity').set('X-Kynd-Session-Id', sessionId);
const home = (sessionId) => request(app).get('/api/v1/home').set('X-Kynd-Session-Id', sessionId);

const countOf = (reactions, type) => reactions.find((r) => r.type === type).count;
const viewerOf = (reactions, type) => reactions.find((r) => r.type === type).viewerReacted;

describe('Social engagement', () => {
  let seededActivityId;
  let seededFundraiserId;

  beforeAll(async () => {
    const a = await query(`SELECT id FROM activities ORDER BY id LIMIT 1`);
    seededActivityId = a.rows[0].id;
    const f = await query(`SELECT id FROM fundraisers ORDER BY id LIMIT 1`);
    seededFundraiserId = f.rows[0].id;
  });

  afterEach(async () => {
    if (sessions.length > 0) {
      // Cascades from the temporary user through reactions, comments and saves.
      await query(`DELETE FROM demo_sessions WHERE id = ANY($1::uuid[])`, [sessions]);
      sessions.length = 0;
    }
  });

  afterAll(async () => {
    await closePool();
  });

  describe('reactions', () => {
    it('toggles on and off, moving the count by exactly one', async () => {
      const { sessionId, user } = await newSession();

      const before = (await engagement('opportunities', FLAGSHIP, sessionId)).body;
      expect(viewerOf(before.reactions, 'like')).toBe(false);
      const baseline = countOf(before.reactions, 'like');

      const on = await react('opportunities', FLAGSHIP, sessionId, 'like');
      expect(on.status).toBe(200);
      expect(on.body.reacted).toBe(true);
      expect(countOf(on.body.reactions, 'like')).toBe(baseline + 1);
      expect(viewerOf(on.body.reactions, 'like')).toBe(true);

      // Persists across a re-read.
      const reread = (await engagement('opportunities', FLAGSHIP, sessionId)).body;
      expect(viewerOf(reread.reactions, 'like')).toBe(true);
      expect(countOf(reread.reactions, 'like')).toBe(baseline + 1);

      const off = await react('opportunities', FLAGSHIP, sessionId, 'like');
      expect(off.body.reacted).toBe(false);
      expect(countOf(off.body.reactions, 'like')).toBe(baseline);
      expect(viewerOf(off.body.reactions, 'like')).toBe(false);

      const rows = await query(`SELECT COUNT(*)::int n FROM reactions WHERE user_id = $1`, [
        user.id,
      ]);
      expect(rows.rows[0].n).toBe(0);
    });

    /*
     * The schema allows at most one reaction per (user, target) via the
     * partial unique indexes, and its own note says changing a reaction
     * updates the existing row. Types are therefore alternatives, not
     * independent toggles — this pins that model rather than assuming a
     * more familiar per-type one.
     */
    it('holds one reaction per target, switching type in place rather than adding a second', async () => {
      const { sessionId, user } = await newSession();

      const liked = await react('activities', seededActivityId, sessionId, 'like');
      expect(liked.status).toBe(200);
      const rowAfterLike = await query(
        `SELECT id, reaction_type FROM reactions WHERE user_id = $1 AND activity_id = $2`,
        [user.id, seededActivityId]
      );
      expect(rowAfterLike.rows).toHaveLength(1);

      // Switching type: still one row, and the SAME row.
      const switched = await react('activities', seededActivityId, sessionId, 'celebrate');
      expect(switched.status).toBe(200);
      expect(switched.body.reacted).toBe(true);
      expect(viewerOf(switched.body.reactions, 'celebrate')).toBe(true);
      expect(viewerOf(switched.body.reactions, 'like')).toBe(false);

      const rowAfterSwitch = await query(
        `SELECT id, reaction_type FROM reactions WHERE user_id = $1 AND activity_id = $2`,
        [user.id, seededActivityId]
      );
      expect(rowAfterSwitch.rows).toHaveLength(1);
      expect(rowAfterSwitch.rows[0].reaction_type).toBe('celebrate');
      expect(rowAfterSwitch.rows[0].id).toBe(rowAfterLike.rows[0].id);

      // Tapping the active type again removes it entirely.
      const removed = await react('activities', seededActivityId, sessionId, 'celebrate');
      expect(removed.body.reacted).toBe(false);
      const after = await query(
        `SELECT COUNT(*)::int n FROM reactions WHERE user_id = $1 AND activity_id = $2`,
        [user.id, seededActivityId]
      );
      expect(after.rows[0].n).toBe(0);
    });

    it('forbids a social support reaction on a fundraiser, but allows the others', async () => {
      const { sessionId } = await newSession();

      const forbidden = await react('fundraisers', seededFundraiserId, sessionId, 'support');
      expect(forbidden.status).toBe(400);

      const allowed = await react('fundraisers', seededFundraiserId, sessionId, 'like');
      expect(allowed.status).toBe(200);

      // The option is not even offered for a fundraiser.
      const body = (await engagement('fundraisers', seededFundraiserId, sessionId)).body;
      expect(body.reactions.map((r) => r.type).sort()).toEqual(['celebrate', 'like']);

      // ...while an activity offers all three.
      const onActivity = (await engagement('activities', seededActivityId, sessionId)).body;
      expect(onActivity.reactions.map((r) => r.type).sort()).toEqual([
        'celebrate',
        'like',
        'support',
      ]);
    });

    it('rejects an unknown reaction type or content type', async () => {
      const { sessionId } = await newSession();
      expect((await react('opportunities', FLAGSHIP, sessionId, 'clap')).status).toBe(400);
      expect((await react('widgets', FLAGSHIP, sessionId, 'like')).status).toBe(404);
    });

    it('requires a session to write, but not to read', async () => {
      const anon = await engagement('opportunities', FLAGSHIP, null);
      expect(anon.status).toBe(200);

      const res = await request(app)
        .post(`/api/v1/engagement/opportunities/${FLAGSHIP}/reactions`)
        .send({ type: 'like' });
      expect(res.status).toBe(401);
    });

    it("session isolation: one visitor's reaction never appears in another's counts", async () => {
      const a = await newSession();
      const b = await newSession();

      const baseline = countOf((await engagement('opportunities', FLAGSHIP, b.sessionId)).body.reactions, 'like');
      await react('opportunities', FLAGSHIP, a.sessionId, 'like');

      const bView = (await engagement('opportunities', FLAGSHIP, b.sessionId)).body;
      expect(countOf(bView.reactions, 'like')).toBe(baseline);
      expect(viewerOf(bView.reactions, 'like')).toBe(false);

      const anonView = (await engagement('opportunities', FLAGSHIP, null)).body;
      expect(countOf(anonView.reactions, 'like')).toBe(baseline);

      const aView = (await engagement('opportunities', FLAGSHIP, a.sessionId)).body;
      expect(countOf(aView.reactions, 'like')).toBe(baseline + 1);
    });
  });

  describe('comments', () => {
    it('adds a comment that reads back with its author and survives a re-read', async () => {
      const { sessionId, user } = await newSession();

      const before = (await engagement('opportunities', FLAGSHIP, sessionId)).body;
      const baseline = before.commentCount;

      const res = await comment('opportunities', FLAGSHIP, sessionId, '  Excited for this one!  ');
      expect(res.status).toBe(201);
      expect(res.body.commentCount).toBe(baseline + 1);

      const mine = res.body.comments.find((c) => c.author.id === user.id);
      expect(mine.body).toBe('Excited for this one!'); // trimmed
      expect(mine.author.name).toBe('Frank Enstien');

      const reread = (await engagement('opportunities', FLAGSHIP, sessionId)).body;
      expect(reread.comments.some((c) => c.author.id === user.id)).toBe(true);
    });

    it('renders existing seeded comments', async () => {
      const withComments = await query(
        `SELECT opportunity_id FROM comments
         WHERE opportunity_id IS NOT NULL GROUP BY opportunity_id
         ORDER BY COUNT(*) DESC LIMIT 1`
      );
      const id = withComments.rows[0].opportunity_id;
      const body = (await engagement('opportunities', id, null)).body;
      expect(body.commentCount).toBeGreaterThan(0);
      expect(body.comments[0].author.name).toBeTruthy();
    });

    it('rejects an empty or oversized comment', async () => {
      const { sessionId } = await newSession();
      expect((await comment('opportunities', FLAGSHIP, sessionId, '   ')).status).toBe(400);
      expect((await comment('opportunities', FLAGSHIP, sessionId, '')).status).toBe(400);
      expect((await comment('opportunities', FLAGSHIP, sessionId, 'x'.repeat(1001))).status).toBe(
        400
      );
    });

    it("session isolation: one visitor's comment is invisible to another and to anonymous", async () => {
      const a = await newSession();
      const b = await newSession();

      await comment('opportunities', FLAGSHIP, a.sessionId, 'Only session A should see this');

      const bBodies = (await engagement('opportunities', FLAGSHIP, b.sessionId)).body.comments.map(
        (c) => c.body
      );
      expect(bBodies).not.toContain('Only session A should see this');

      const anonBodies = (await engagement('opportunities', FLAGSHIP, null)).body.comments.map(
        (c) => c.body
      );
      expect(anonBodies).not.toContain('Only session A should see this');

      const aBodies = (await engagement('opportunities', FLAGSHIP, a.sessionId)).body.comments.map(
        (c) => c.body
      );
      expect(aBodies).toContain('Only session A should see this');
    });
  });

  describe('save', () => {
    it('saves, appears in Activity -> Saved, and unsaves', async () => {
      const { sessionId } = await newSession();

      const fresh = await activity(sessionId);
      expect(fresh.body.saved).toEqual([]);

      const res = await save(FLAGSHIP, sessionId);
      expect(res.status).toBe(200);
      expect(res.body.saved).toBe(true);

      const after = await activity(sessionId);
      expect(after.body.saved.map((o) => o.id)).toContain(FLAGSHIP);
      expect(after.body.saved[0].viewerSaved).toBe(true);

      // Saving is not joining.
      expect(after.body.upcoming.map((o) => o.id)).not.toContain(FLAGSHIP);

      const detail = await request(app)
        .get(`/api/v1/opportunities/${FLAGSHIP}`)
        .set('X-Kynd-Session-Id', sessionId);
      expect(detail.body.opportunity.viewerSaved).toBe(true);

      const removed = await unsave(FLAGSHIP, sessionId);
      expect(removed.body.saved).toBe(false);
      const final = await activity(sessionId);
      expect(final.body.saved).toEqual([]);
    });

    it('is idempotent in both directions', async () => {
      const { sessionId, user } = await newSession();
      await save(FLAGSHIP, sessionId);
      expect((await save(FLAGSHIP, sessionId)).status).toBe(200);

      const rows = await query(
        `SELECT COUNT(*)::int n FROM saved_opportunities WHERE user_id = $1`,
        [user.id]
      );
      expect(rows.rows[0].n).toBe(1);

      await unsave(FLAGSHIP, sessionId);
      expect((await unsave(FLAGSHIP, sessionId)).status).toBe(200);
    });

    it("session isolation: one visitor's save never appears for another", async () => {
      const a = await newSession();
      const b = await newSession();
      await save(FLAGSHIP, a.sessionId);

      const bActivity = await activity(b.sessionId);
      expect(bActivity.body.saved).toEqual([]);

      const bDetail = await request(app)
        .get(`/api/v1/opportunities/${FLAGSHIP}`)
        .set('X-Kynd-Session-Id', b.sessionId);
      expect(bDetail.body.opportunity.viewerSaved).toBe(false);
    });

    it('requires a session', async () => {
      expect((await request(app).post(`/api/v1/opportunities/${FLAGSHIP}/save`)).status).toBe(401);
      expect((await request(app).delete(`/api/v1/opportunities/${FLAGSHIP}/save`)).status).toBe(401);
    });
  });

  describe('second-degree Home discovery', () => {
    it('surfaces an activity by someone the viewer does NOT follow, attributed to someone they do', async () => {
      const { sessionId, user } = await newSession();
      const { body } = await home(sessionId);

      const item = body.items.find((i) => i.family === 'secondDegree');
      expect(item).toBeDefined();

      // Truthful attribution, naming a real reaction by a real followed person.
      expect(item.context).toMatch(/^(Liked|Celebrated|Supported) by .+$/);

      const followed = await query(
        `SELECT followed_user_id FROM user_follows WHERE follower_user_id = $1`,
        [user.id]
      );
      const followedIds = followed.rows.map((r) => r.followed_user_id);

      // The author is outside the follow graph; that is the whole point.
      expect(followedIds).not.toContain(item.person.id);
      expect(item.person.id).not.toBe(user.id);

      // The attributed reactor really is followed, and really did react.
      const reaction = await query(
        `SELECT r.user_id, u.display_name
         FROM reactions r JOIN users u ON u.id = r.user_id
         WHERE r.activity_id = $1 AND r.user_id = ANY($2::uuid[])`,
        [item.activity.id, followedIds]
      );
      expect(reaction.rows.length).toBeGreaterThan(0);
      expect(item.context).toContain(reaction.rows[0].display_name);
    });

    it('does not overwhelm first-degree content, and never repeats an activity', async () => {
      const { sessionId } = await newSession();
      const { body } = await home(sessionId);

      const secondDegree = body.items.filter((i) => i.family === 'secondDegree');
      const firstDegree = body.items.filter((i) =>
        ['personUpcoming', 'personActivity', 'orgOpportunity'].includes(i.family)
      );
      expect(secondDegree.length).toBeLessThanOrEqual(2);
      expect(firstDegree.length).toBeGreaterThan(secondDegree.length);

      // The established first-degree composition is untouched: second-degree
      // was appended, not swapped in.
      expect(body.items[0].family).toBe('personUpcoming');
      expect(body.items[1].family).toBe('personActivity');
      expect(body.items.some((i) => i.family === 'causeDiscovery')).toBe(true);

      const activityIds = body.items.filter((i) => i.activity).map((i) => i.activity.id);
      expect(new Set(activityIds).size).toBe(activityIds.length);
    });
  });

  describe('runtime role', () => {
    it('holds only the privileges these interactions require', async () => {
      const { pool } = require('../src/db/pool');
      const { rows } = await pool.query(
        `SELECT t,
                has_table_privilege('kynd_app', t, 'SELECT') AS sel,
                has_table_privilege('kynd_app', t, 'INSERT') AS ins,
                has_table_privilege('kynd_app', t, 'UPDATE') AS upd,
                has_table_privilege('kynd_app', t, 'DELETE') AS del
         FROM unnest(ARRAY['reactions', 'comments', 'saved_opportunities']) t
         ORDER BY t`
      );
      // Comments are never removed or edited, so they get no DELETE/UPDATE.
      // Reactions and saves are toggles, so they need DELETE.
      // No table-level UPDATE anywhere.
      expect(rows).toEqual([
        { t: 'comments', sel: true, ins: true, upd: false, del: false },
        { t: 'reactions', sel: true, ins: true, upd: false, del: true },
        { t: 'saved_opportunities', sel: true, ins: true, upd: false, del: true },
      ]);
    });

    it('can change a reaction type but cannot reassign a reaction to another user', async () => {
      const { pool } = require('../src/db/pool');
      // Switching a reaction updates the existing row, which the schema
      // documents — so UPDATE is granted on that ONE column, not the table.
      const { rows } = await pool.query(
        `SELECT
           has_column_privilege('kynd_app', 'reactions', 'reaction_type', 'UPDATE') AS type_col,
           has_column_privilege('kynd_app', 'reactions', 'user_id', 'UPDATE') AS user_col,
           has_column_privilege('kynd_app', 'reactions', 'activity_id', 'UPDATE') AS target_col`
      );
      expect(rows[0]).toEqual({ type_col: true, user_col: false, target_col: false });
    });
  });
});
