const CONFIG = Object.freeze({
  seed: 20260830,

  // Fixed clock for reproducible demo data.
  anchorDate: '2026-08-30T12:00:00-04:00',

  counts: {
    users: 500,
    organizations: 250,
    opportunities: 2000,
    registrations: 7000,
    activities: 2500,
    savedOpportunities: 2000,
    userFollows: 6000,
    organizationFollows: 5000,
    fundraisers: 250,
    fundraiserSupports: 1500,
    reactions: 7000,
    comments: 2000,
  },

  geography: {
    atlantaMetroShare: 0.8,
  },

  opportunityMix: {
    organizationHostedShare: 0.85,
    volunteerShare: 0.85,
  },

  opportunityTimeMix: {
    upcoming: 0.50,
    recentPast: 0.35,
    future: 0.10,
    cancelled: 0.05,
  },

  // Milestone 3 product decisions. Keep these exact so validation
  // protects the intended Discover marketplace composition.
  opportunityTargets: {
    hosts: {
      organization: 1700,
      user: 300,
    },
    types: {
      volunteer: 1700,
      charityEvent: 300,
    },
    time: {
      upcoming: 1000,
      recentPast: 700,
      fartherFuture: 200,
      cancelled: 100,
    },
    geography: {
      online: 800,
      physical: 1200,
      atlantaMetroPhysical: 960,
      otherGeorgiaPhysical: 240,
    },
  },

  // Milestone 4 product decisions. These exact totals preserve the
  // difference between active commitment and historical cancellation.
  participationTargets: {
    registrations: {
      recentPast: { joined: 3200, cancelled: 300 },
      upcoming: { joined: 2600, cancelled: 200 },
      fartherFuture: { joined: 450, cancelled: 50 },
      cancelled: { joined: 0, cancelled: 200 },
    },
    savedOpportunities: 2000,
    flagshipJoined: 5,
  },

  userTiers: [
    { name: 'light', weight: 0.55 },
    { name: 'regular', weight: 0.30 },
    { name: 'highly_active', weight: 0.12 },
    { name: 'connector', weight: 0.03 },
  ],

  organizationTiers: [
    { name: 'community', weight: 0.65 },
    { name: 'established', weight: 0.28 },
    { name: 'high_visibility', weight: 0.07 },
  ],
});

module.exports = CONFIG;
