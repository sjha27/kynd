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

  // Milestone 5 product decisions. Activities are the authoritative
  // contribution history, not an automatic mirror of registrations.
  activityTargets: {
    sources: {
      kynd: 2100,
      manual: 400,
    },
    kyndByUserTier: {
      light: 580,
      regular: 790,
      highly_active: 500,
      connector: 230,
    },
    manualByUserTier: {
      light: 60,
      regular: 140,
      highly_active: 130,
      connector: 70,
    },
    manualOrganizations: {
      linkedKynd: 120,
      external: 280,
    },
    manualRecency: {
      previous90Days: 250,
      days91To180: 110,
      days181To365: 40,
    },
    anchors: {
      maya: { kynd: 4, manual: 1 },
      david: { kynd: 9, manual: 3 },
    },
  },

  // Milestone 6 product decisions. Fundraiser progress and personal Amount
  // Raised are always derived from fundraiser-support relationships.
  fundraiserTargets: {
    creators: {
      user: 175,
      organization: 75,
      userByTier: { light: 30, regular: 65, highly_active: 55, connector: 25 },
      organizationByTier: { community: 20, established: 35, high_visibility: 20 },
    },
    lifecycle: { open: 150, ended: 80, cancelled: 20 },
    beneficiaries: {
      linkedKynd: 170,
      external: 80,
      userLinkedKynd: 105,
      userExternal: 70,
      organizationSelf: 55,
      organizationOtherKynd: 10,
      organizationExternal: 10,
    },
    supports: { open: 900, ended: 600, cancelled: 0 },
    supporterPoolSize: 400,
    imageCoverage: 0.86,
    goalBounds: { minimum: 25000, maximum: 2000000 },
    anchors: {
      maya: { goal: 100000, raised: 65000, supporters: 10 },
      david: { goal: 250000, raised: 185000, supporters: 15 },
      riverlight: { goal: 500000, raised: 420000, supporters: 24 },
      mosaic: { goal: 250000, raised: 275000, supporters: 20 },
    },
  },

  // Milestone 7 product decisions. Social engagement amplifies existing
  // contribution and fundraising truth; it never creates either kind of truth.
  socialTargets: {
    reactions: {
      total: 7000,
      byTarget: { activity: 4200, opportunity: 1800, fundraiser: 1000 },
      byTargetAndType: {
        activity: { like: 1400, celebrate: 2200, support: 600 },
        opportunity: { like: 1000, celebrate: 100, support: 700 },
        fundraiser: { like: 700, celebrate: 300, support: 0 },
      },
      activitySource: { kynd: 3500, manual: 700 },
      opportunityLifecycle: {
        upcoming: 1350, recent_past: 300, farther_future: 150, cancelled: 0,
      },
      fundraiserLifecycle: { open: 750, ended: 250, cancelled: 0 },
      activeTargets: {
        activityKynd: 1025, activityManual: 225,
        opportunityUpcoming: 500, opportunityRecentPast: 120,
        opportunityFartherFuture: 55, fundraiserOpen: 145, fundraiserEnded: 50,
      },
      inactiveUsers: 36,
      inactiveUsersByTier: { light: 24, regular: 10, highly_active: 2, connector: 0 },
    },
    comments: {
      total: 2000,
      byTarget: { activity: 1100, opportunity: 550, fundraiser: 350 },
      activitySource: { kynd: 900, manual: 200 },
      opportunityLifecycle: {
        upcoming: 420, recent_past: 90, farther_future: 40, cancelled: 0,
      },
      fundraiserLifecycle: { open: 270, ended: 80, cancelled: 0 },
      activeTargets: {
        activityKynd: 550, activityManual: 130,
        opportunityUpcoming: 210, opportunityRecentPast: 60,
        opportunityFartherFuture: 30, fundraiserOpen: 110, fundraiserEnded: 40,
      },
      inactiveUsers: 150,
      inactiveUsersByTier: { light: 100, regular: 42, highly_active: 8, connector: 0 },
    },
    anchors: {
      mayaActivity: { reactions: 8, comments: 3 },
      davidActivity: { reactions: 10, comments: 4 },
      flagshipOpportunity: { reactions: 12, comments: 4 },
      mayaFundraiser: { reactions: 14, comments: 5 },
      davidFundraiser: { reactions: 16, comments: 5 },
      riverlightFundraiser: { reactions: 20, comments: 6 },
      mosaicFundraiser: { reactions: 15, comments: 4 },
    },
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
