const CONFIG = require('../config');
const { deriveProfileMetrics, buildOrganizationPublicImpact } = require('./activities');

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

function buildActivityDiagnostics(world) {
  const userById = new Map(world.users.map((user) => [user.id, user]));
  const causeById = new Map(world.causes.map((cause) => [cause.id, cause]));
  const organizationById = new Map(world.organizations.map((item) => [item.id, item]));
  const registrationById = new Map(world.registrations.map((row) => [row.id, row]));
  const opportunityById = new Map(world.opportunities.map((item) => [item.id, item]));
  const kynd = world.activities.filter((activity) => activity.registrationId !== null);
  const manual = world.activities.filter((activity) => activity.registrationId === null);
  const activitiesByUser = new Map(world.users.map((user) => [user.id, []]));
  for (const activity of world.activities) activitiesByUser.get(activity.userId).push(activity);

  function opportunityFor(activity) {
    if (!activity.registrationId) return null;
    return opportunityById.get(registrationById.get(activity.registrationId).opportunityId);
  }

  function causeFor(activity) {
    const causeId = activity.registrationId
      ? opportunityFor(activity).causeId : activity.manualCauseId;
    return causeById.get(causeId);
  }

  function organizationFor(activity) {
    if (!activity.registrationId) return activity.manualOrgName;
    const opportunity = opportunityFor(activity);
    return opportunity.hostOrganizationId
      ? organizationById.get(opportunity.hostOrganizationId).name
      : userById.get(opportunity.hostUserId).displayName;
  }

  const eligible = world.registrations.filter((registration) => {
    const opportunity = opportunityById.get(registration.opportunityId);
    return registration.status === 'joined' && opportunity.timeBucket === 'recent_past';
  });
  const conversionByTier = Object.fromEntries(CONFIG.userTiers.map(({ name }) => {
    const eligibleRows = eligible.filter((row) => userById.get(row.userId).tier === name);
    const converted = kynd.filter((activity) => userById.get(activity.userId).tier === name);
    return [name, {
      eligiblePastJoins: eligibleRows.length,
      activities: converted.length,
      conversionPercent: percentage(converted.length, eligibleRows.length),
    }];
  }));

  const activityCounts = world.users.map((user) => activitiesByUser.get(user.id).length);
  const userHours = world.users.map((user) => activitiesByUser.get(user.id)
    .reduce((sum, activity) => sum + activity.hours, 0));
  const usersByTier = Object.fromEntries(CONFIG.userTiers.map(({ name }) => {
    const users = world.users.filter((user) => user.tier === name);
    const rows = users.flatMap((user) => activitiesByUser.get(user.id));
    const counts = users.map((user) => activitiesByUser.get(user.id).length);
    const hours = users.map((user) => activitiesByUser.get(user.id)
      .reduce((sum, activity) => sum + activity.hours, 0));
    return [name, {
      users: users.length,
      activities: rows.length,
      kynd: rows.filter((activity) => activity.registrationId !== null).length,
      manual: rows.filter((activity) => activity.registrationId === null).length,
      averageActivities: rounded(average(counts)),
      medianActivities: percentile(counts, 0.5),
      usersWithZeroActivities: counts.filter((count) => count === 0).length,
      totalHours: rounded(hours.reduce((sum, value) => sum + value, 0)),
      averageHoursPerUser: rounded(average(hours)),
      medianHoursPerUser: percentile(hours, 0.5),
    }];
  }));

  function countBy(rows, keys) {
    return Object.fromEntries(keys.map(([label, predicate]) => [
      label, rows.filter((activity) => predicate(activity, opportunityFor(activity))).length,
    ]));
  }

  const kyndHours = kynd.reduce((sum, activity) => sum + activity.hours, 0);
  const manualHours = manual.reduce((sum, activity) => sum + activity.hours, 0);
  const kyndHourAdjustments = { exact: 0, shorterByHalfHour: 0, longerByHalfHour: 0 };
  for (const activity of kynd) {
    const opportunity = opportunityFor(activity);
    const scheduled = (new Date(opportunity.endsAt) - new Date(opportunity.startsAt)) / 3600000;
    if (activity.hours === scheduled) kyndHourAdjustments.exact += 1;
    else if (activity.hours < scheduled) kyndHourAdjustments.shorterByHalfHour += 1;
    else kyndHourAdjustments.longerByHalfHour += 1;
  }

  const manualCauseMatches = manual.filter((activity) => (
    userById.get(activity.userId).causes.includes(causeById.get(activity.manualCauseId).name)
  )).length;
  const anchorDate = new Date(`${CONFIG.anchorDate.slice(0, 10)}T12:00:00Z`);
  const recency = { previous90Days: 0, days91To180: 0, days181To365: 0 };
  for (const activity of manual) {
    const age = (anchorDate - new Date(`${activity.occurredOn}T12:00:00Z`)) / 86400000;
    if (age <= 90) recency.previous90Days += 1;
    else if (age <= 180) recency.days91To180 += 1;
    else recency.days181To365 += 1;
  }
  const externalCounts = new Map();
  for (const activity of manual.filter((item) => item.manualOrgId === null)) {
    externalCounts.set(activity.manualOrgName, (externalCounts.get(activity.manualOrgName) || 0) + 1);
  }

  function enrichment(rows) {
    const story = rows.filter((activity) => activity.story).length;
    const image = rows.filter((activity) => activity.imageUrl).length;
    return {
      story: { count: story, sharePercent: percentage(story, rows.length) },
      image: { count: image, sharePercent: percentage(image, rows.length) },
      both: rows.filter((activity) => activity.story && activity.imageUrl).length,
      neither: rows.filter((activity) => !activity.story && !activity.imageUrl).length,
    };
  }

  const profileMetrics = deriveProfileMetrics(world);
  const profileValues = [...profileMetrics.values()];
  const profileByTier = Object.fromEntries(CONFIG.userTiers.map(({ name }) => {
    const metrics = world.users.filter((user) => user.tier === name)
      .map((user) => profileMetrics.get(user.id));
    return [name, {
      hours: distribution(metrics.map((value) => value.hours)),
      activities: distribution(metrics.map((value) => value.activities)),
      organizations: distribution(metrics.map((value) => value.organizations)),
    }];
  }));

  const publicImpact = buildOrganizationPublicImpact(world);
  const anchorOrganizationImpact = world.organizations.filter((organization) => organization.anchor)
    .map((organization) => {
      const impact = publicImpact.get(organization.id);
      const linkedManual = manual.filter((activity) => activity.manualOrgId === organization.id);
      return {
        organization: organization.name,
        completedKyndActivities: impact.completedActivities,
        KyndParticipantHours: impact.totalHours,
        distinctKyndParticipants: impact.distinctParticipants,
        linkedManualActivitiesExcluded: linkedManual.length,
        linkedManualHoursExcluded: rounded(linkedManual.reduce((sum, activity) => sum + activity.hours, 0)),
      };
    });

  function describe(activity) {
    const opportunity = opportunityFor(activity);
    const user = userById.get(activity.userId);
    return {
      user: user.displayName,
      title: opportunity?.title || activity.manualTitle,
      source: opportunity ? 'Kynd' : 'manual',
      cause: causeFor(activity).name,
      organizationOrHost: organizationFor(activity),
      occurredOn: activity.occurredOn,
      hours: activity.hours,
      story: activity.story,
      imageUrl: activity.imageUrl,
      originatingOpportunity: opportunity?.title || null,
      mode: opportunity ? (opportunity.isOnline ? 'Online' : `${opportunity.city}, GA`) : 'manual',
    };
  }

  function anchorHistory(name) {
    const user = world.users.find((candidate) => candidate.displayName === name);
    const rows = [...activitiesByUser.get(user.id)].sort((first, second) => (
      first.occurredOn.localeCompare(second.occurredOn) || first.id.localeCompare(second.id)
    ));
    const metrics = profileMetrics.get(user.id);
    return {
      history: rows.map(describe),
      profile: {
        hours: metrics.hours,
        activities: metrics.activities,
        organizations: metrics.organizations,
        causes: Object.fromEntries(world.causes.map((cause) => [
          cause.name, rows.filter((activity) => causeFor(activity).id === cause.id).length,
        ]).filter(([, count]) => count > 0)),
      },
      pastJoinedWithoutActivity: eligible.filter((row) => row.userId === user.id).length
        - rows.filter((activity) => activity.registrationId).length,
    };
  }

  const representative = [];
  function addRepresentative(predicate) {
    const selected = world.activities.find((activity) => (
      !representative.includes(activity) && predicate(activity, opportunityFor(activity))
    ));
    if (selected) representative.push(selected);
  }
  const maya = world.users.find((user) => user.displayName === 'Maya Ellis');
  const david = world.users.find((user) => user.displayName === 'David Mercer');
  addRepresentative((activity) => activity.userId === maya.id);
  addRepresentative((activity) => activity.userId === david.id);
  addRepresentative((activity, opportunity) => opportunity?.hostOrganizationId);
  addRepresentative((activity, opportunity) => opportunity?.hostUserId);
  addRepresentative((activity, opportunity) => opportunity?.isOnline);
  addRepresentative((activity, opportunity) => opportunity?.geography === 'atlanta_metro');
  addRepresentative((activity, opportunity) => opportunity?.geography === 'other_georgia');
  addRepresentative((activity) => activity.hours <= 1);
  addRepresentative((activity) => activity.hours >= 5);
  addRepresentative((activity) => !activity.registrationId && activity.manualOrgId);
  addRepresentative((activity) => !activity.registrationId && !activity.manualOrgId);
  addRepresentative((activity) => activity.story && !activity.imageUrl);
  addRepresentative((activity) => !activity.story && activity.imageUrl);
  addRepresentative((activity) => activity.story && activity.imageUrl);
  addRepresentative((activity) => !activity.story && !activity.imageUrl);

  return {
    sources: {
      total: world.activities.length,
      kynd: kynd.length,
      manual: manual.length,
      manualLinkedKyndOrganization: manual.filter((activity) => activity.manualOrgId).length,
      manualExternalOrganization: manual.filter((activity) => !activity.manualOrgId).length,
    },
    conversion: {
      eligiblePastJoinedRegistrations: eligible.length,
      kyndActivities: kynd.length,
      eligibleWithoutActivity: eligible.length - kynd.length,
      overallConversionPercent: percentage(kynd.length, eligible.length),
      byUserTier: conversionByTier,
    },
    users: { activityCount: distribution(activityCounts), hours: distribution(userHours), byTier: usersByTier },
    hours: {
      total: rounded(kyndHours + manualHours),
      perActivity: distribution(world.activities.map((activity) => activity.hours)),
      kynd: rounded(kyndHours),
      manual: rounded(manualHours),
      kyndAdjustments: {
        ...kyndHourAdjustments,
        exactSharePercent: percentage(kyndHourAdjustments.exact, kynd.length),
        shorterSharePercent: percentage(kyndHourAdjustments.shorterByHalfHour, kynd.length),
        longerSharePercent: percentage(kyndHourAdjustments.longerByHalfHour, kynd.length),
      },
    },
    kyndActivities: {
      byOpportunityType: countBy(kynd, [
        ['volunteer', (_, item) => item.opportunityType === 'volunteer'],
        ['charity_event', (_, item) => item.opportunityType === 'charity_event'],
      ]),
      byHostType: countBy(kynd, [
        ['organization', (_, item) => Boolean(item.hostOrganizationId)],
        ['user', (_, item) => Boolean(item.hostUserId)],
      ]),
      byModeAndGeography: countBy(kynd, [
        ['online', (_, item) => item.isOnline], ['physical', (_, item) => !item.isOnline],
        ['atlanta_metro_physical', (_, item) => item.geography === 'atlanta_metro'],
        ['other_georgia_physical', (_, item) => item.geography === 'other_georgia'],
      ]),
      byCause: Object.fromEntries(world.causes.map((cause) => [
        cause.name, kynd.filter((activity) => causeFor(activity).id === cause.id).length,
      ])),
    },
    manualActivities: {
      linkedKyndOrganization: manual.filter((activity) => activity.manualOrgId).length,
      externalOrganization: manual.filter((activity) => !activity.manualOrgId).length,
      byUserTier: Object.fromEntries(CONFIG.userTiers.map(({ name }) => [
        name, manual.filter((activity) => userById.get(activity.userId).tier === name).length,
      ])),
      byCause: Object.fromEntries(world.causes.map((cause) => [
        cause.name, manual.filter((activity) => activity.manualCauseId === cause.id).length,
      ])),
      causeMatchPercent: percentage(manualCauseMatches, manual.length),
      recency,
      distinctExternalOrganizations: externalCounts.size,
      topExternalOrganizations: [...externalCounts]
        .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
        .slice(0, 10).map(([organization, activities]) => ({ organization, activities })),
    },
    enrichment: { kynd: enrichment(kynd), manual: enrichment(manual) },
    profiles: {
      hours: distribution(profileValues.map((value) => value.hours)),
      activities: distribution(profileValues.map((value) => value.activities)),
      organizations: distribution(profileValues.map((value) => value.organizations)),
      byUserTier: profileByTier,
    },
    organizationPublicImpact: {
      sourceRule: 'Kynd-originated activities from organization-hosted opportunities only',
      manualActivitiesIncluded: 0,
      anchorOrganizations: anchorOrganizationImpact,
    },
    anchors: { maya: anchorHistory('Maya Ellis'), david: anchorHistory('David Mercer') },
    representativeActivities: representative.map(describe),
  };
}

module.exports = { buildActivityDiagnostics };
