'use strict';

const request = require('supertest');

const { createApp } = require('../src/app');
const { query, closePool } = require('../src/db/pool');
const {
  STARTER_FOLLOWED_USER_IDS,
  STARTER_FOLLOWED_ORGANIZATION_IDS,
} = require('../src/config/demo_persona');

const FLAGSHIP = 'bc09559d-77de-5bde-b248-00a1480d6d94';
const [MAYA, DAVID] = STARTER_FOLLOWED_USER_IDS;

const app = createApp();
const sessions = [];

async function newSession() {
  const res = await request(app).post('/api/v1/demo-sessions');
  sessions.push(res.body.sessionId);
  return res.body; // { sessionId, expiresAt, user: { id, name } }
}

const home = (sessionId) => {
  const req = request(app).get('/api/v1/home');
  return sessionId ? req.set('X-Kynd-Session-Id', sessionId) : req;
};
const join = (id, sessionId) =>
  request(app).post(`/api/v1/opportunities/${id}/join`).set('X-Kynd-Session-Id', sessionId);
const unfollowUser = (id, sessionId) =>
  request(app).delete(`/api/v1/users/${id}/follow`).set('X-Kynd-Session-Id', sessionId);

function opportunityIds(items) {
  return items
    .filter((item) => item.opportunity)
    .map((item) => item.opportunity.id);
}

describe('Home feed', () => {
  afterEach(async () => {
    if (sessions.length > 0) {
      await query(`DELETE FROM demo_sessions WHERE id = ANY($1::uuid[])`, [sessions]);
      sessions.length = 0;
    }
  });

  afterAll(async () => {
    await closePool();
  });

  it('requires a session (never silently anonymous)', async () => {
    const res = await home();
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('demo_session_invalid');
  });

  it('gives a fresh Frank a finite personalized feed of at most 8 items', async () => {
    const { sessionId } = await newSession();
    const res = await home(sessionId);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.length).toBeLessThanOrEqual(8);
  });

  it('surfaces the flagship within the first 3 items, without any UUID pinning in the request', async () => {
    const { sessionId } = await newSession();
    const { body } = await home(sessionId);

    const flagshipIndex = body.items.findIndex(
      (item) => item.opportunity && item.opportunity.id === FLAGSHIP
    );
    expect(flagshipIndex).toBeGreaterThanOrEqual(0);
    expect(flagshipIndex).toBeLessThan(3);
  });

  it('ranks followed-person participation above plain organization/cause overlap', async () => {
    const { sessionId } = await newSession();
    const { body } = await home(sessionId);

    const firstPersonIdx = body.items.findIndex((item) => item.family === 'personUpcoming');
    const firstOrgIdx = body.items.findIndex((item) => item.family === 'orgOpportunity');

    expect(firstPersonIdx).toBeGreaterThanOrEqual(0);
    if (firstOrgIdx >= 0) {
      expect(firstPersonIdx).toBeLessThan(firstOrgIdx);
    }
  });

  it('includes at least one recent followed-person activity in the first 8', async () => {
    const { sessionId } = await newSession();
    const { body } = await home(sessionId);
    expect(body.items.some((item) => item.family === 'personActivity')).toBe(true);
  });

  it("does not repeat the preceding item's followed person in a personActivity slot when another followed person has an eligible activity", async () => {
    const { sessionId } = await newSession();
    const { body } = await home(sessionId);

    const personOf = (item) => {
      if (item.family === 'personUpcoming') return item.people[0]?.id;
      if (item.family === 'personActivity') return item.person.id;
      return null;
    };

    for (let i = 1; i < body.items.length; i += 1) {
      if (body.items[i].family !== 'personActivity') continue;
      const prevPerson = personOf(body.items[i - 1]);
      const thisPerson = personOf(body.items[i]);
      if (prevPerson && thisPerson === prevPerson) {
        // Only acceptable if no other followed person had an eligible
        // activity left to offer at this point in composition.
        const laterAlternative = body.items
          .slice(i + 1)
          .some((item) => item.family === 'personActivity' && item.person.id !== prevPerson);
        expect(laterAlternative).toBe(false);
      }
    }

    // For fresh Frank specifically (Maya upcoming, then an activity slot,
    // then Maya/Piedmont), the activity slot must be David's, not Maya's.
    expect(body.items[0].family).toBe('personUpcoming');
    expect(body.items[0].people[0].name).toBe('Maya Ellis');
    expect(body.items[1].family).toBe('personActivity');
    expect(body.items[1].person.name).toBe('David Mercer');
  });

  it('never shows the same opportunity twice, even when multiple signals match it', async () => {
    const { sessionId } = await newSession();
    const { body } = await home(sessionId);

    const ids = opportunityIds(body.items);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('prefers cause-discovery content outside the follow graph', async () => {
    const { sessionId } = await newSession();
    const { body } = await home(sessionId);

    const causeItem = body.items.find((item) => item.family === 'causeDiscovery');
    expect(causeItem).toBeDefined();

    const { rows } = await query(
      `SELECT host_organization_id, host_user_id FROM opportunities WHERE id = $1`,
      [causeItem.opportunity.id]
    );
    expect(STARTER_FOLLOWED_ORGANIZATION_IDS).not.toContain(rows[0].host_organization_id);
    expect(STARTER_FOLLOWED_USER_IDS).not.toContain(rows[0].host_user_id);
  });

  it("session isolation: A's extra follow never affects B's feed", async () => {
    const a = await newSession();
    const b = await newSession();

    // A follows a seeded person who is NOT one of the starter follows, and
    // who has upcoming participation, so it could plausibly appear in a feed.
    const extra = await query(
      `SELECT id FROM users WHERE display_name = 'Priya Griffin' AND demo_session_id IS NULL`
    );
    const extraPersonId = extra.rows[0].id;
    await request(app)
      .post(`/api/v1/users/${extraPersonId}/follow`)
      .set('X-Kynd-Session-Id', a.sessionId);

    const bFeed = await home(b.sessionId);
    const bMentionsExtra = bFeed.body.items.some(
      (item) =>
        (item.people && item.people.some((p) => p.id === extraPersonId)) ||
        (item.person && item.person.id === extraPersonId)
    );
    expect(bMentionsExtra).toBe(false);
  });

  it("another session's temporary user is never a candidate actor in Home", async () => {
    const a = await newSession();
    const b = await newSession();

    const aFeed = await home(a.sessionId);
    const mentionsB = aFeed.body.items.some(
      (item) =>
        (item.people && item.people.some((p) => p.id === b.user.id)) ||
        (item.person && item.person.id === b.user.id) ||
        (item.organization && item.organization.id === b.user.id)
    );
    expect(mentionsB).toBe(false);
  });

  it('viewerJoined turns truthfully true after joining the flagship, as one unchanged feed item', async () => {
    const { sessionId } = await newSession();

    const before = await home(sessionId);
    const beforeIdx = before.body.items.findIndex(
      (item) => item.opportunity && item.opportunity.id === FLAGSHIP
    );
    expect(before.body.items[beforeIdx].opportunity.viewerJoined).toBe(false);

    await join(FLAGSHIP, sessionId);

    const after = await home(sessionId);
    const flagshipItems = after.body.items.filter(
      (item) => item.opportunity && item.opportunity.id === FLAGSHIP
    );
    expect(flagshipItems).toHaveLength(1);
    expect(flagshipItems[0].opportunity.viewerJoined).toBe(true);
  });

  it("unfollowing Maya removes her as a social feed source on the next read", async () => {
    const { sessionId } = await newSession();
    await unfollowUser(MAYA, sessionId);

    const { body } = await home(sessionId);
    const mentionsMaya = body.items.some(
      (item) =>
        (item.people && item.people.some((p) => p.id === MAYA)) ||
        (item.person && item.person.id === MAYA)
    );
    expect(mentionsMaya).toBe(false);
  });
});
