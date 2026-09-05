import { CAUSES } from './causes';

/*
 * The filter vocabulary the UI offers, mirroring backend/src/lib/discovery.js.
 * Values must stay identical on both sides — the backend ignores anything it
 * does not recognize, so a drift here shows up as a filter that silently
 * does nothing.
 *
 * Deliberately absent: "People I follow are going" (no visitor identity yet)
 * and distance bands (no geolocation — "Around Atlanta" is a real
 * physical/online distinction, not a proximity claim).
 */
export const FILTER_GROUPS = [
  {
    key: 'timing',
    label: 'When',
    options: [
      { value: 'today', label: 'Today' },
      { value: 'weekend', label: 'This weekend' },
      { value: 'next7', label: 'Next 7 days' },
    ],
  },
  {
    key: 'mode',
    label: 'Where',
    options: [
      { value: 'atlanta', label: 'Around Atlanta' },
      { value: 'online', label: 'Online' },
    ],
  },
  {
    key: 'type',
    label: 'Type',
    options: [
      { value: 'volunteer', label: 'Volunteering' },
      { value: 'charity_event', label: 'Charity event' },
    ],
  },
  {
    key: 'host',
    label: 'Hosted by',
    options: [
      { value: 'organization', label: 'Organization' },
      { value: 'community', label: 'Community member' },
    ],
  },
  {
    key: 'commitment',
    label: 'Time commitment',
    options: [
      { value: 'under1', label: 'Under 1 hour' },
      { value: '1to3', label: '1–3 hours' },
      { value: 'half_day', label: 'Half day' },
      { value: 'full_day', label: 'Full day' },
    ],
  },
  {
    key: 'cause',
    label: 'Cause',
    options: CAUSES.map((c) => ({ value: c.name, label: c.name })),
  },
];

export const FILTER_KEYS = FILTER_GROUPS.map((g) => g.key);

export function labelFor(groupKey, value) {
  const group = FILTER_GROUPS.find((g) => g.key === groupKey);
  return group?.options.find((o) => o.value === value)?.label ?? value;
}

// A search term counts as "active" too — both switch Discover out of its
// curated browse mode and into results.
export function activeFilterCount(params) {
  return FILTER_KEYS.filter((key) => params.get(key)).length + (params.get('q') ? 1 : 0);
}
