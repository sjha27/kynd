'use strict';

const { parseDiscoveryParams, normalizeSearchTerm } = require('../src/lib/discovery');
const { commitmentBand, durationMinutes } = require('../src/services/opportunities');

describe('normalizeSearchTerm', () => {
  it('collapses internal whitespace and trims', () => {
    expect(normalizeSearchTerm('  park   cleanup  ')).toBe('park cleanup');
  });

  it('treats a whitespace-only query as absent', () => {
    expect(normalizeSearchTerm('     ')).toBeNull();
    expect(normalizeSearchTerm('\t\n')).toBeNull();
  });

  it('ignores non-string input rather than throwing', () => {
    expect(normalizeSearchTerm(undefined)).toBeNull();
    expect(normalizeSearchTerm(null)).toBeNull();
    expect(normalizeSearchTerm(42)).toBeNull();
    expect(normalizeSearchTerm(['a'])).toBeNull();
  });

  it('truncates an oversized query instead of erroring', () => {
    const result = normalizeSearchTerm('x'.repeat(500));
    expect(result).toHaveLength(120);
  });
});

describe('parseDiscoveryParams', () => {
  it('returns all-null filters and the default sort for an empty query', () => {
    expect(parseDiscoveryParams({})).toEqual({
      q: null,
      type: null,
      host: null,
      timing: null,
      mode: null,
      commitment: null,
      cause: null,
      sort: 'soonest',
    });
  });

  it('accepts every valid enum value', () => {
    const parsed = parseDiscoveryParams({
      type: 'charity_event',
      host: 'community',
      timing: 'weekend',
      mode: 'online',
      commitment: 'half_day',
      sort: 'popular',
      cause: 'Environment',
    });
    expect(parsed).toEqual({
      q: null,
      type: 'charity_event',
      host: 'community',
      timing: 'weekend',
      mode: 'online',
      commitment: 'half_day',
      cause: 'Environment',
      sort: 'popular',
    });
  });

  it('is case-insensitive for enum values', () => {
    expect(parseDiscoveryParams({ type: 'VOLUNTEER' }).type).toBe('volunteer');
    expect(parseDiscoveryParams({ mode: '  Online ' }).mode).toBe('online');
  });

  // Unknown filter values degrade to "no filter" so a stale bookmark or a
  // hand-edited URL still browses instead of 400-ing.
  it('ignores unknown enum values', () => {
    const parsed = parseDiscoveryParams({
      type: 'fundraiser',
      host: 'robot',
      timing: 'next_year',
      mode: 'near_me',
      commitment: 'forever',
      sort: 'magic',
    });
    expect(parsed.type).toBeNull();
    expect(parsed.host).toBeNull();
    expect(parsed.timing).toBeNull();
    expect(parsed.mode).toBeNull();
    expect(parsed.commitment).toBeNull();
    expect(parsed.sort).toBe('soonest');
  });

  it('ignores a blank cause', () => {
    expect(parseDiscoveryParams({ cause: '   ' }).cause).toBeNull();
  });
});

describe('commitment bands', () => {
  const minutesFor = (hours) =>
    durationMinutes('2026-01-01T09:00:00.000Z', new Date(Date.UTC(2026, 0, 1, 9) + hours * 3600000).toISOString());

  it('computes duration in whole minutes', () => {
    expect(minutesFor(1)).toBe(60);
    expect(minutesFor(2.5)).toBe(150);
  });

  it('classifies durations below one hour', () => {
    expect(commitmentBand(minutesFor(0.5))).toBe('under1');
    expect(commitmentBand(minutesFor(0.8))).toBe('under1');
  });

  // Boundaries are the part most likely to drift, so they are pinned
  // explicitly: 60 and 180 belong to 1to3, 300 belongs to half_day.
  it('places exact boundary values deterministically', () => {
    expect(commitmentBand(60)).toBe('1to3');
    expect(commitmentBand(180)).toBe('1to3');
    expect(commitmentBand(181)).toBe('half_day');
    expect(commitmentBand(300)).toBe('half_day');
    expect(commitmentBand(301)).toBe('full_day');
  });

  it('classifies half and full day durations', () => {
    expect(commitmentBand(minutesFor(4))).toBe('half_day');
    expect(commitmentBand(minutesFor(5))).toBe('half_day');
    expect(commitmentBand(minutesFor(6))).toBe('full_day');
    expect(commitmentBand(minutesFor(8))).toBe('full_day');
  });
});
