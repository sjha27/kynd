import { trackEvent } from '../api/client';

/*
 * Navigation-source attribution.
 *
 * The backend can see that an opportunity was fetched but not where the
 * visitor came from — and "does social discovery actually drive
 * participation" is the question Kynd's whole thesis rests on. That is the
 * one thing the browser genuinely knows better, so it is the only thing
 * this reports.
 *
 * Source travels in React Router's location state, set by whichever surface
 * linked to the page. When it is absent the answer is honestly `direct`
 * (a deep link or refresh) rather than a guess, and anything unrecognised
 * degrades to `other` — the backend rejects values outside this list
 * anyway.
 */
export const SOURCES = [
  'home_person',
  'home_org',
  'home_second_degree',
  'home_cause',
  'discover',
  'activity_saved',
  'activity_upcoming',
  'direct',
  'other',
];

// Maps a Home feed family onto its analytics source, so the feed's own
// vocabulary stays the single definition of what each item is.
const HOME_FAMILY_SOURCE = {
  personUpcoming: 'home_person',
  personActivity: 'home_person',
  orgOpportunity: 'home_org',
  causeDiscovery: 'home_cause',
  secondDegree: 'home_second_degree',
};

export function sourceForHomeFamily(family) {
  return HOME_FAMILY_SOURCE[family] ?? 'other';
}

/*
 * Reads the source a link declared. `direct` is a real answer: it means the
 * visitor arrived without passing through an internal surface.
 */
export function resolveSource(locationState) {
  const source = locationState?.source;
  if (!source) return 'direct';
  return SOURCES.includes(source) ? source : 'other';
}

export function trackOpportunityViewed(opportunity, source) {
  if (!opportunity) return;
  trackEvent('opportunity_viewed', {
    opportunity_id: opportunity.id,
    cause: opportunity.cause?.name,
    host_type: opportunity.host?.type,
    source,
  });
}

export function trackFundraiserViewed(fundraiser, source) {
  if (!fundraiser) return;
  trackEvent('fundraiser_viewed', {
    fundraiser_id: fundraiser.id,
    cause: fundraiser.cause?.name,
    source,
  });
}

// browse = the curated landing view; search/filter = an intentional query.
export function trackDiscoverViewed(mode) {
  trackEvent('discover_viewed', { mode });
}
