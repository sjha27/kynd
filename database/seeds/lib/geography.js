const CITY_CENTROIDS = Object.freeze({
  Atlanta: { latitude: 33.7490, longitude: -84.3880 },
  Decatur: { latitude: 33.7748, longitude: -84.2963 },
  'Sandy Springs': { latitude: 33.9304, longitude: -84.3733 },
  Brookhaven: { latitude: 33.8651, longitude: -84.3366 },
  Marietta: { latitude: 33.9526, longitude: -84.5499 },
  Smyrna: { latitude: 33.8839, longitude: -84.5144 },
  Roswell: { latitude: 34.0232, longitude: -84.3616 },
  Alpharetta: { latitude: 34.0754, longitude: -84.2941 },
  Athens: { latitude: 33.9519, longitude: -83.3576 },
  Savannah: { latitude: 32.0809, longitude: -81.0912 },
  Augusta: { latitude: 33.4735, longitude: -82.0105 },
  Macon: { latitude: 32.8407, longitude: -83.6324 },
  Columbus: { latitude: 32.4610, longitude: -84.9877 },
});

function radians(degrees) {
  return degrees * Math.PI / 180;
}

function haversineMiles(first, second) {
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const firstLatitude = radians(first.latitude);
  const secondLatitude = radians(second.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude)
      * Math.sin(longitudeDelta / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function userCoordinates(user) {
  const coordinates = CITY_CENTROIDS[user.city];
  if (!coordinates || user.state !== 'GA') {
    throw new Error(`Missing deterministic Georgia centroid for ${user.city}, ${user.state}`);
  }
  return coordinates;
}

function opportunityCoordinates(opportunity) {
  if (opportunity.isOnline) return null;
  return { latitude: opportunity.latitude, longitude: opportunity.longitude };
}

function userOpportunityMiles(user, opportunity) {
  if (opportunity.isOnline) return 0;
  return haversineMiles(userCoordinates(user), opportunityCoordinates(opportunity));
}

function travelBucket(miles) {
  if (miles <= 5) return '0–5';
  if (miles <= 15) return '5–15';
  if (miles <= 30) return '15–30';
  if (miles <= 60) return '30–60';
  if (miles <= 100) return '60–100';
  return '100+';
}

function completedPhysicalRows(world) {
  const userById = new Map(world.users.map((user) => [user.id, user]));
  const registrationById = new Map(world.registrations.map((row) => [row.id, row]));
  const opportunityById = new Map(world.opportunities.map((item) => [item.id, item]));
  return world.activities.flatMap((activity) => {
    if (!activity.registrationId) return [];
    const registration = registrationById.get(activity.registrationId);
    const opportunity = opportunityById.get(registration.opportunityId);
    if (opportunity.isOnline) return [];
    const user = userById.get(activity.userId);
    return [{ activity, registration, opportunity, user, miles: userOpportunityMiles(user, opportunity) }];
  });
}

function implausibleSameDayPairs(world) {
  const rowsByUserAndDate = new Map();
  for (const row of completedPhysicalRows(world)) {
    const key = `${row.user.id}|${row.activity.occurredOn}`;
    if (!rowsByUserAndDate.has(key)) rowsByUserAndDate.set(key, []);
    rowsByUserAndDate.get(key).push(row);
  }
  const failures = [];
  for (const [key, rows] of rowsByUserAndDate) {
    for (let firstIndex = 0; firstIndex < rows.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < rows.length; secondIndex += 1) {
        const first = rows[firstIndex];
        const second = rows[secondIndex];
        const betweenMiles = haversineMiles(
          opportunityCoordinates(first.opportunity), opportunityCoordinates(second.opportunity)
        );
        const ordered = [first, second].sort((a, b) => (
          new Date(a.opportunity.startsAt) - new Date(b.opportunity.startsAt)
        ));
        const gapHours = Math.max(0, (
          new Date(ordered[1].opportunity.startsAt) - new Date(ordered[0].opportunity.endsAt)
        ) / 3600000);
        const distantAndLocal = Math.max(first.miles, second.miles) > 60
          && Math.min(first.miles, second.miles) <= 30;
        const cannotTravelBetween = betweenMiles > Math.max(30, gapHours * 55);
        if (betweenMiles > 60 && (distantAndLocal || cannotTravelBetween)) {
          failures.push({
            key,
            activityIds: [first.activity.id, second.activity.id],
            homeMiles: [first.miles, second.miles],
            betweenMiles,
            gapHours,
          });
        }
      }
    }
  }
  return failures;
}

module.exports = {
  CITY_CENTROIDS,
  haversineMiles,
  userOpportunityMiles,
  travelBucket,
  completedPhysicalRows,
  implausibleSameDayPairs,
};
