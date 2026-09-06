'use strict';

const homeQueries = require('../db/queries/home');
const opportunitiesService = require('./opportunities');

const FEED_SIZE = 9;

// like -> "Liked by Maya". The verb states what actually happened rather
// than flattening every reaction into a generic "engaged with".
const REACTION_VERB = {
  like: 'Liked',
  celebrate: 'Celebrated',
  support: 'Supported',
};

/*
 * A deterministic V1 composition, not a ranking engine: a fixed slot plan,
 * filled family-by-family, with a fixed fallback order per slot when a
 * family runs dry. See the Home product decision — human participation
 * outranks organization/cause overlap, which is why personUpcoming leads
 * every fallback list and causeDiscovery leads none.
 */
const SLOT_PLAN = [
  'personUpcoming',
  'personActivity',
  'personUpcoming',
  'orgOpportunity',
  'personActivity',
  'personUpcoming',
  'orgOpportunity',
  'causeDiscovery',
  // Second-degree discovery is APPENDED rather than replacing an existing
  // slot, so the established composition of the first eight is untouched and
  // first-degree people/organization content keeps exactly the share it had.
  // It sits last because it is the furthest from the viewer's own graph.
  'secondDegree',
];

/*
 * secondDegree is added only at the END of each existing fallback list, so
 * it can fill a gap when a family runs dry but can never displace content
 * that would otherwise have been chosen.
 */
const FALLBACK_ORDER = {
  personUpcoming: ['orgOpportunity', 'personActivity', 'causeDiscovery', 'secondDegree'],
  personActivity: ['personUpcoming', 'orgOpportunity', 'causeDiscovery', 'secondDegree'],
  orgOpportunity: ['personUpcoming', 'personActivity', 'causeDiscovery', 'secondDegree'],
  causeDiscovery: ['personUpcoming', 'orgOpportunity', 'personActivity', 'secondDegree'],
  secondDegree: ['causeDiscovery', 'personUpcoming', 'orgOpportunity', 'personActivity'],
};

// Additional signals within the personUpcoming family only ever break ties
// among genuine participation — they never let an org+cause item outrank a
// person one, because org+cause overlap never appears in this family at all
// (that's the orgOpportunity/causeDiscovery families' job).
function personUpcomingSignalStrength(row) {
  return (row.people.length > 1 ? 1 : 0) + (row.org_match ? 1 : 0) + (row.cause_match ? 1 : 0);
}

function sortPersonUpcoming(rows) {
  return [...rows]
    .map((row) => ({ ...row, people: [...row.people].sort((a, b) => a.id.localeCompare(b.id)) }))
    .sort(
      (a, b) =>
        personUpcomingSignalStrength(b) - personUpcomingSignalStrength(a) ||
        new Date(a.starts_at) - new Date(b.starts_at) ||
        a.id.localeCompare(b.id)
    );
}

function sortByStartsAt(rows) {
  return [...rows].sort(
    (a, b) => new Date(a.starts_at) - new Date(b.starts_at) || a.id.localeCompare(b.id)
  );
}

// Round-robin by person: every followed person's most recent activity is
// available before any person's second, so two Maya activities can't crowd
// out David's before he gets a turn.
function diversifyActivitiesByPerson(rows) {
  const byPerson = new Map();
  for (const row of rows) {
    if (!byPerson.has(row.user_id)) byPerson.set(row.user_id, []);
    byPerson.get(row.user_id).push(row);
  }
  const queues = [...byPerson.values()];
  const maxLen = Math.max(0, ...queues.map((q) => q.length));
  const result = [];
  for (let round = 0; round < maxLen; round += 1) {
    const roundItems = queues.map((q) => q[round]).filter(Boolean);
    roundItems.sort(
      (a, b) => new Date(b.occurred_on) - new Date(a.occurred_on) || a.id.localeCompare(b.id)
    );
    result.push(...roundItems);
  }
  return result;
}

function personKey(candidate) {
  return candidate.people.map((p) => p.id).join(',');
}

// Both families carry an activity row, so they share dedup and
// person-diversity handling.
function isActivityFamily(poolKey) {
  return poolKey === 'personActivity' || poolKey === 'secondDegree';
}

function activityToFeedItem(row, family = 'personActivity') {
  const title = row.opportunity_title || row.manual_title;
  const organizationName = row.opportunity_org_name || row.manual_organization_name || null;
  const causeName = row.opportunity_cause_name || row.manual_cause_name || null;
  return {
    family,
    header: `${row.person_name} volunteered`,
    // Truthful attribution for second-degree content: the person the viewer
    // actually follows, and what they actually did. Absent for first-degree.
    context:
      family === 'secondDegree'
        ? `${REACTION_VERB[row.reaction_type] ?? 'Liked'} by ${row.reactor_name}`
        : null,
    person: { id: row.user_id, name: row.person_name },
    activity: {
      id: row.id,
      title,
      occurredOn: row.occurred_on,
      hours: Number(row.hours),
      organizationName,
      causeName,
      story: row.story || null,
      imageUrl: row.image_url || null,
      opportunityId: row.opportunity_id || null,
    },
  };
}

/*
 * Builds the current visitor's Home feed.
 *
 * Candidates derive only from the CURRENT temporary user's own
 * user_follows/organization_follows/user_causes rows (userId is the
 * session's own user id — never another visitor's). Full opportunity data
 * (participants, viewerJoined, images) is fetched through the existing
 * session-aware getOpportunityDetail, so it inherits the seeded+current-
 * session visibility model rather than re-deriving it.
 */
async function buildHomeFeed({ sessionId, userId }) {
  const [followedUserIds, followedOrgIds, causeIds] = await Promise.all([
    homeQueries.findFollowedUserIds(userId),
    homeQueries.findFollowedOrganizationIds(userId),
    homeQueries.findCauseIds(userId),
  ]);

  const [personUpcomingRows, personActivityRows, orgOpportunityRows, causeRows, secondDegreeRows] =
    await Promise.all([
      homeQueries.findFollowedPersonUpcoming(followedUserIds, followedOrgIds, causeIds),
      homeQueries.findFollowedPersonActivities(followedUserIds),
      homeQueries.findFollowedOrganizationOpportunities(followedOrgIds),
      homeQueries.findCauseDiscoveryOpportunities(
        causeIds,
        followedUserIds,
        followedOrgIds,
        sessionId
      ),
      homeQueries.findSecondDegreeActivities(followedUserIds, userId, sessionId),
    ]);

  const pools = {
    personUpcoming: sortPersonUpcoming(personUpcomingRows),
    personActivity: diversifyActivitiesByPerson(personActivityRows),
    orgOpportunity: sortByStartsAt(orgOpportunityRows),
    causeDiscovery: causeRows, // already ordered by the query itself
    // Round-robin by author for the same reason the first-degree family
    // does it: one prolific person shouldn't own the discovery slot.
    secondDegree: diversifyActivitiesByPerson(secondDegreeRows),
  };

  const usedOpportunityIds = new Set();
  const usedActivityIds = new Set();

  /*
   * Diversity is judged against the immediately preceding item in the
   * FINAL rendered feed, not against neighbors inside a pool. The fixed
   * slot plan already keeps personUpcoming slots (1, 3, 6) apart, so this
   * only ever intervenes in a fallback collision (e.g. personActivity ran
   * dry and personUpcoming fills two slots in a row) — it must never
   * reorder personUpcoming's own priority sort, which is what puts
   * Piedmont in the top 3 in the first place.
   */
  function takeFrom(poolKey, lastPick) {
    const pool = pools[poolKey];

    if (poolKey === 'personUpcoming' && lastPick?.poolKey === 'personUpcoming') {
      const lastKey = personKey(lastPick.candidate);
      const altIdx = pool.findIndex(
        (c) => !usedOpportunityIds.has(c.id) && personKey(c) !== lastKey
      );
      if (altIdx > 0) {
        const [alt] = pool.splice(altIdx, 1);
        pool.unshift(alt);
      }
    }

    // Same rule, for the activity family: if the top-ranked activity's
    // person is the same person as the immediately preceding feed item
    // (whichever family that item came from), and another followed
    // person has an eligible activity, prefer that one. Ranking within
    // the family (most-recent-per-person round robin) is untouched —
    // this only reorders when the two adjacent feed items would
    // otherwise repeat the same person.
    if (isActivityFamily(poolKey) && lastPick) {
      const lastPersonId =
        lastPick.poolKey === 'personUpcoming'
          ? lastPick.candidate.people[0]?.id
          : isActivityFamily(lastPick.poolKey)
            ? lastPick.candidate.user_id
            : null;
      if (lastPersonId) {
        const altIdx = pool.findIndex(
          (c) => !usedActivityIds.has(c.id) && c.user_id !== lastPersonId
        );
        if (altIdx > 0) {
          const [alt] = pool.splice(altIdx, 1);
          pool.unshift(alt);
        }
      }
    }

    while (pool.length > 0) {
      const candidate = pool.shift();
      // Activity-level dedup applies across BOTH activity-bearing families,
      // so a second-degree item can never repeat an activity the
      // first-degree family already claimed.
      if (isActivityFamily(poolKey)) {
        if (usedActivityIds.has(candidate.id)) continue;
        usedActivityIds.add(candidate.id);
        return { poolKey, candidate };
      }
      // Opportunity-level dedup applies across ALL opportunity-bearing
      // families: whichever family claims an opportunity first keeps it.
      if (usedOpportunityIds.has(candidate.id)) continue;
      usedOpportunityIds.add(candidate.id);
      return { poolKey, candidate };
    }
    return null;
  }

  const picks = [];
  for (const slot of SLOT_PLAN) {
    const lastPick = picks[picks.length - 1] ?? null;
    let taken = takeFrom(slot, lastPick);
    if (!taken) {
      for (const fallback of FALLBACK_ORDER[slot]) {
        taken = takeFrom(fallback, lastPick);
        if (taken) break;
      }
    }
    if (taken) picks.push(taken);
    if (picks.length >= FEED_SIZE) break;
  }

  const items = [];
  for (const { poolKey, candidate } of picks) {
    if (isActivityFamily(poolKey)) {
      items.push(activityToFeedItem(candidate, poolKey));
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const opportunity = await opportunitiesService.getOpportunityDetail(candidate.id, sessionId);

    if (poolKey === 'personUpcoming') {
      items.push({
        family: 'personUpcoming',
        header: `${candidate.people[0].name} is volunteering`,
        people: candidate.people,
        opportunity,
      });
    } else if (poolKey === 'orgOpportunity') {
      items.push({
        family: 'orgOpportunity',
        header: `${candidate.org_name} has an upcoming opportunity`,
        organization: { id: candidate.host_organization_id, name: candidate.org_name },
        opportunity,
      });
    } else if (poolKey === 'causeDiscovery') {
      items.push({
        family: 'causeDiscovery',
        header: `Because you care about ${candidate.cause_name}`,
        cause: { name: candidate.cause_name },
        opportunity,
      });
    }
  }

  return items;
}

module.exports = { buildHomeFeed };
