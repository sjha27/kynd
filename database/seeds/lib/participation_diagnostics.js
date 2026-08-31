const CONFIG = require('../config');
const { buildSignals, region } = require('./participation');

function rounded(value) {
  return Number((value || 0).toFixed(2));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

function distribution(values) {
  return {
    average: rounded(average(values)),
    median: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    p90: percentile(values, 0.9),
    maximum: Math.max(...values),
    zero: values.filter((value) => value === 0).length,
  };
}

function percentage(numerator, denominator) {
  return rounded(denominator ? numerator * 100 / denominator : 0);
}

function hostName(opportunity, userById, organizationById) {
  return opportunity.hostUserId
    ? userById.get(opportunity.hostUserId).displayName
    : organizationById.get(opportunity.hostOrganizationId).name;
}

function fillBucket(joined, capacity) {
  if (joined === 0) return '0%';
  const rate = joined / capacity;
  if (rate === 1) return '100%';
  if (rate >= 0.8) return '80–99%';
  if (rate >= 0.5) return '50–79%';
  if (rate >= 0.25) return '25–49%';
  return '1–24%';
}

function buildParticipationDiagnostics(world) {
  const userById = new Map(world.users.map((user) => [user.id, user]));
  const opportunityById = new Map(world.opportunities.map((item) => [item.id, item]));
  const organizationById = new Map(world.organizations.map((item) => [item.id, item]));
  const causeById = new Map(world.causes.map((cause) => [cause.id, cause]));
  const signals = buildSignals(world);
  const registrationsByUser = new Map(world.users.map((user) => [user.id, []]));
  const registrationsByOpportunity = new Map(world.opportunities.map((item) => [item.id, []]));
  for (const row of world.registrations) {
    registrationsByUser.get(row.userId).push(row);
    registrationsByOpportunity.get(row.opportunityId).push(row);
  }
  const savesByUser = new Map(world.users.map((user) => [user.id, []]));
  for (const row of world.savedOpportunities) savesByUser.get(row.userId).push(row);
  const joinedIdsByOpportunity = new Map([...registrationsByOpportunity].map(([id, rows]) => [
    id, rows.filter((row) => row.status === 'joined').map((row) => row.userId),
  ]));

  const registrationBreakdown = (selector) => Object.fromEntries(selector.map(([label, predicate]) => {
    const rows = world.registrations.filter((row) => predicate(opportunityById.get(row.opportunityId)));
    return [label, {
      total: rows.length,
      joined: rows.filter((row) => row.status === 'joined').length,
      cancelled: rows.filter((row) => row.status === 'cancelled').length,
    }];
  }));

  const userCounts = world.users.map((user) => registrationsByUser.get(user.id).length);
  const byTier = Object.fromEntries(CONFIG.userTiers.map(({ name }) => {
    const users = world.users.filter((user) => user.tier === name);
    const total = users.flatMap((user) => registrationsByUser.get(user.id));
    const joinedCounts = users.map((user) => registrationsByUser.get(user.id)
      .filter((row) => row.status === 'joined').length);
    return [name, {
      users: users.length,
      registrations: total.length,
      averageRegistrations: rounded(total.length / users.length),
      averageJoined: rounded(joinedCounts.reduce((sum, value) => sum + value, 0) / users.length),
      averageCancelled: rounded(total.filter((row) => row.status === 'cancelled').length / users.length),
      medianJoined: percentile(joinedCounts, 0.5),
    }];
  }));

  const joinedCounts = world.opportunities.map((item) => joinedIdsByOpportunity.get(item.id).length);
  const upcoming = world.opportunities.filter((item) => item.timeBucket === 'upcoming');
  const upcomingJoined = upcoming.map((item) => joinedIdsByOpportunity.get(item.id).length);
  const fillRates = Object.fromEntries(['0%', '1–24%', '25–49%', '50–79%', '80–99%', '100%']
    .map((bucket) => [bucket, upcoming.filter((item) => (
      fillBucket(joinedIdsByOpportunity.get(item.id).length, item.capacity) === bucket
    )).length]));

  function registrationAffinity(rows) {
    let causeMatches = 0;
    let physical = 0;
    let sameCity = 0;
    let sameRegion = 0;
    let organizationHosted = 0;
    let organizationFollow = 0;
    let userHosted = 0;
    let userFollow = 0;
    let socialProof = 0;
    for (const row of rows) {
      const user = userById.get(row.userId);
      const item = opportunityById.get(row.opportunityId);
      if (user.causes.includes(causeById.get(item.causeId).name)) causeMatches += 1;
      if (!item.isOnline) {
        physical += 1;
        if (user.city === item.city) sameCity += 1;
        if (region(user) === item.geography) sameRegion += 1;
      }
      if (item.hostOrganizationId) {
        organizationHosted += 1;
        if (signals.organizationFollows.has(`${user.id}|${item.hostOrganizationId}`)) organizationFollow += 1;
      } else {
        userHosted += 1;
        if (signals.userFollows.has(`${user.id}|${item.hostUserId}`)) userFollow += 1;
      }
      const others = joinedIdsByOpportunity.get(item.id).filter((id) => id !== user.id);
      if (others.some((id) => signals.userFollows.has(`${user.id}|${id}`))) socialProof += 1;
    }
    return {
      causeMatchPercent: percentage(causeMatches, rows.length),
      physicalSameCityPercent: percentage(sameCity, physical),
      physicalSameRegionPercent: percentage(sameRegion, physical),
      organizationHostFollowPercent: percentage(organizationFollow, organizationHosted),
      userHostFollowPercent: percentage(userFollow, userHosted),
      followsAnotherJoinedParticipantPercent: percentage(socialProof, rows.length),
      baselines: {
        declaredCauseShare: percentage(world.users.reduce((sum, user) => sum + user.causes.length, 0), world.users.length * world.causes.length),
        organizationFollowDensity: percentage(world.organizationFollows.length, world.users.length * world.organizations.length),
        userFollowDensity: percentage(world.userFollows.length, world.users.length * (world.users.length - 1)),
      },
    };
  }

  const saveRowsAsRegistrations = world.savedOpportunities.map((row) => ({ ...row }));
  const saveCounts = world.users.map((user) => savesByUser.get(user.id).length);
  const saveByTier = Object.fromEntries(CONFIG.userTiers.map(({ name }) => {
    const users = world.users.filter((user) => user.tier === name);
    const saves = users.reduce((sum, user) => sum + savesByUser.get(user.id).length, 0);
    return [name, { users: users.length, saves, average: rounded(saves / users.length) }];
  }));

  function describedRelationship(row) {
    const item = opportunityById.get(row.opportunityId);
    return {
      title: item.title,
      cause: causeById.get(item.causeId).name,
      host: hostName(item, userById, organizationById),
      startsAt: item.startsAt,
      timeBucket: item.timeBucket,
      status: row.status || 'saved',
      mode: item.isOnline ? 'Online' : `${item.city}, GA`,
    };
  }

  function anchorDiagnostics(name) {
    const user = world.users.find((item) => item.displayName === name);
    const rows = registrationsByUser.get(user.id);
    const saves = savesByUser.get(user.id);
    const joined = rows.filter((row) => row.status === 'joined');
    return {
      totalRegistrations: rows.length,
      joined: joined.length,
      cancelled: rows.filter((row) => row.status === 'cancelled').length,
      pastJoined: joined.filter((row) => opportunityById.get(row.opportunityId).timeBucket === 'recent_past').length,
      upcomingJoined: joined.filter((row) => opportunityById.get(row.opportunityId).timeBucket === 'upcoming').length,
      fartherFutureJoined: joined.filter((row) => opportunityById.get(row.opportunityId).timeBucket === 'farther_future').length,
      registrations: rows.map(describedRelationship).sort((first, second) => first.startsAt.localeCompare(second.startsAt)),
      savedOpportunities: saves.map(describedRelationship).sort((first, second) => first.startsAt.localeCompare(second.startsAt)),
    };
  }

  function opportunityStory(item) {
    const rows = registrationsByOpportunity.get(item.id);
    const active = rows.filter((row) => row.status === 'joined');
    return {
      title: item.title,
      host: hostName(item, userById, organizationById),
      cause: causeById.get(item.causeId).name,
      status: item.status,
      timeBucket: item.timeBucket,
      mode: item.isOnline ? 'Online' : `${item.city}, GA`,
      capacity: item.capacity,
      joined: active.length,
      cancelled: rows.length - active.length,
      fillRatePercent: rounded(active.length * 100 / item.capacity),
      participantNames: active.slice(0, 8).map((row) => userById.get(row.userId).displayName),
    };
  }

  const storySelections = [];
  function addStory(predicate, chooser = (items) => items[0]) {
    const candidates = world.opportunities.filter((item) => (
      !storySelections.includes(item) && predicate(item, joinedIdsByOpportunity.get(item.id).length)
    ));
    const selected = chooser(candidates);
    if (selected) storySelections.push(selected);
  }
  addStory((item) => item.flagship);
  addStory((item) => item.davidAnchor);
  addStory((item, joined) => item.timeBucket === 'upcoming' && joined === 0);
  addStory((item, joined) => item.timeBucket === 'upcoming' && joined > 0 && joined <= 2);
  addStory((item, joined) => item.timeBucket === 'upcoming' && joined / item.capacity >= 0.5 && joined / item.capacity < 0.8);
  addStory((item, joined) => item.timeBucket === 'upcoming' && joined / item.capacity >= 0.8 && joined < item.capacity);
  addStory((item, joined) => item.timeBucket === 'upcoming' && joined === item.capacity);
  addStory((item, joined) => item.isOnline && item.timeBucket === 'upcoming' && joined > 0);
  addStory((item, joined) => !item.isOnline && item.geography === 'atlanta_metro' && joined > 0);
  addStory((item, joined) => !item.isOnline && item.geography === 'other_georgia' && joined > 0);
  addStory((item, joined) => item.hostUserId && joined > 0);
  addStory((item) => item.timeBucket === 'recent_past' && registrationsByOpportunity.get(item.id).some((row) => row.status === 'cancelled'));
  addStory((item) => item.timeBucket === 'cancelled' && registrationsByOpportunity.get(item.id).length > 0);

  const flagship = world.opportunities.find((item) => item.flagship);
  const flagshipNames = joinedIdsByOpportunity.get(flagship.id).map((id) => userById.get(id).displayName);
  const davidHosted = world.opportunities.find((item) => item.davidAnchor);
  const david = world.users.find((user) => user.displayName === 'David Mercer');

  const representativeSaves = [];
  for (const row of [
    ...savesByUser.get(world.users.find((user) => user.displayName === 'Maya Ellis').id),
    ...savesByUser.get(david.id),
    ...world.savedOpportunities,
  ]) {
    if (representativeSaves.length >= 9) break;
    if (representativeSaves.some((item) => item.userId === row.userId && item.opportunityId === row.opportunityId)) continue;
    const user = userById.get(row.userId);
    const item = opportunityById.get(row.opportunityId);
    const others = joinedIdsByOpportunity.get(item.id);
    representativeSaves.push({
      userId: row.userId,
      opportunityId: row.opportunityId,
      user: user.displayName,
      opportunity: item.title,
      cause: causeById.get(item.causeId).name,
      causeMatch: user.causes.includes(causeById.get(item.causeId).name),
      followsHost: item.hostOrganizationId
        ? signals.organizationFollows.has(`${user.id}|${item.hostOrganizationId}`)
        : signals.userFollows.has(`${user.id}|${item.hostUserId}`),
      mode: item.isOnline ? 'Online' : `${item.city}, GA`,
      startsAt: item.startsAt,
      followsAttendee: others.some((id) => signals.userFollows.has(`${user.id}|${id}`)),
    });
  }

  return {
    registrations: {
      totals: {
        total: world.registrations.length,
        joined: world.registrations.filter((row) => row.status === 'joined').length,
        cancelled: world.registrations.filter((row) => row.status === 'cancelled').length,
      },
      byTimeBucket: registrationBreakdown([
        ['recent_past', (item) => item.timeBucket === 'recent_past'],
        ['upcoming', (item) => item.timeBucket === 'upcoming'],
        ['farther_future', (item) => item.timeBucket === 'farther_future'],
        ['cancelled', (item) => item.timeBucket === 'cancelled'],
      ]),
      byType: registrationBreakdown([
        ['volunteer', (item) => item.opportunityType === 'volunteer'],
        ['charity_event', (item) => item.opportunityType === 'charity_event'],
      ]),
      byHostType: registrationBreakdown([
        ['organization', (item) => Boolean(item.hostOrganizationId)],
        ['user', (item) => Boolean(item.hostUserId)],
      ]),
      byModeAndGeography: registrationBreakdown([
        ['online', (item) => item.isOnline],
        ['physical', (item) => !item.isOnline],
        ['atlanta_metro_physical', (item) => item.geography === 'atlanta_metro'],
        ['other_georgia_physical', (item) => item.geography === 'other_georgia'],
      ]),
    },
    users: { ...distribution(userCounts), usersWithZeroRegistrations: userCounts.filter((count) => count === 0).length, byTier },
    opportunities: {
      all: distribution(joinedCounts),
      upcoming: {
        ...distribution(upcomingJoined),
        zeroParticipantOpportunities: fillRates['0%'],
        nearFullOpportunities: fillRates['80–99%'],
        fullOpportunities: fillRates['100%'],
        fillRateBuckets: fillRates,
      },
      capacityExceeded: world.opportunities.filter((item) => joinedIdsByOpportunity.get(item.id).length > item.capacity).length,
      totalRowsExceedCapacityWithCancellations: world.opportunities.filter((item) => (
        registrationsByOpportunity.get(item.id).length > item.capacity
        && joinedIdsByOpportunity.get(item.id).length <= item.capacity
      )).length,
    },
    affinity: registrationAffinity(world.registrations),
    saves: {
      total: world.savedOpportunities.length,
      usersWithAtLeastOne: saveCounts.filter((count) => count > 0).length,
      usersWithZero: saveCounts.filter((count) => count === 0).length,
      averagePerUser: rounded(average(saveCounts)),
      median: percentile(saveCounts, 0.5),
      maximum: Math.max(...saveCounts),
      byTier: saveByTier,
      byTimeBucket: {
        upcoming: world.savedOpportunities.filter((row) => opportunityById.get(row.opportunityId).timeBucket === 'upcoming').length,
        farther_future: world.savedOpportunities.filter((row) => opportunityById.get(row.opportunityId).timeBucket === 'farther_future').length,
      },
      affinity: registrationAffinity(saveRowsAsRegistrations),
    },
    anchors: {
      maya: anchorDiagnostics('Maya Ellis'),
      david: {
        ...anchorDiagnostics('David Mercer'),
        registeredForOwnHostedOpportunity: registrationsByUser.get(david.id)
          .some((row) => row.opportunityId === davidHosted.id),
      },
      flagship: {
        mayaJoined: flagshipNames.includes('Maya Ellis'),
        joinedParticipants: flagshipNames.length,
        capacity: flagship.capacity,
        availableSpots: flagship.capacity - flagshipNames.length,
        participantNames: flagshipNames,
      },
      davidHostedOpportunity: opportunityStory(davidHosted),
    },
    representativeParticipationStories: storySelections.map(opportunityStory),
    representativeSaveStories: representativeSaves.map(({ userId, opportunityId, ...story }) => story),
  };
}

module.exports = { buildParticipationDiagnostics };
