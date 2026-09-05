// Everything renders in Atlanta time: the seeded world is an Atlanta
// ecosystem, so a visitor in another timezone should still see the local
// time the event actually happens.
const TZ = 'America/New_York';

const COMMITMENT_LABELS = {
  under1: 'Under 1 hour',
  '1to3': '1–3 hours',
  half_day: 'Half day',
  full_day: 'Full day',
};

export function commitmentLabel(key) {
  return COMMITMENT_LABELS[key] ?? null;
}

export function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  const rounded = Number.isInteger(hours) ? hours : Math.round(hours * 10) / 10;
  return `${rounded} ${rounded === 1 ? 'hour' : 'hours'}`;
}

function parts(value) {
  const date = new Date(value);
  return {
    date,
    weekday: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: TZ }),
    month: date.toLocaleDateString('en-US', { month: 'short', timeZone: TZ }),
    day: date.toLocaleDateString('en-US', { day: 'numeric', timeZone: TZ }),
    time: date
      .toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: TZ,
      })
      .replace(':00', ''),
  };
}

// "Sat, Sep 12 · 9 AM" — weekday first, because when you can go is the
// question a volunteer actually asks first.
export function formatWhen(startsAt) {
  if (!startsAt) return null;
  const p = parts(startsAt);
  return `${p.weekday}, ${p.month} ${p.day} · ${p.time}`;
}

export function formatDayRange(startsAt, endsAt) {
  if (!startsAt) return null;
  const start = parts(startsAt);
  const end = endsAt ? parts(endsAt) : null;
  const base = `${start.weekday}, ${start.month} ${start.day}`;
  if (!end) return `${base} · ${start.time}`;
  return `${base} · ${start.time} – ${end.time}`;
}

/*
 * A calendar date, not an instant.
 *
 * activities.occurred_on is a plain DATE and the API sends it as
 * 'YYYY-MM-DD'. It must be formatted without any timezone conversion:
 * `new Date('2026-09-05')` parses as UTC midnight, so rendering it in
 * Atlanta time would display September 4. Reading the parts and formatting
 * in UTC keeps the day shown equal to the day stored, for every viewer.
 *
 * This is deliberately separate from the TZ-converting formatters above,
 * which handle genuinely timed values (an opportunity's starts_at/ends_at).
 */
export function formatCalendarDate(value, options = { month: 'short', day: 'numeric' }) {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    ...options,
    timeZone: 'UTC',
  });
}

export function formatLocation(location) {
  if (!location) return null;
  if (location.isOnline) return 'Online';
  return [location.name, location.city].filter(Boolean).join(', ') || location.city || null;
}

/*
 * Non-personalized social proof. Names the people actually registered, and
 * degrades to a plain count when there is no preview to show.
 *
 * When the social graph lands this becomes "Maya and 3 people you follow"
 * without the callers changing.
 */
export function formatAttendees({ joined = 0, preview = [] } = {}) {
  if (joined <= 0) return null;
  if (preview.length === 0) {
    return `${joined} ${joined === 1 ? 'person is' : 'people are'} going`;
  }

  const [first] = preview;
  const others = joined - 1;
  if (others <= 0) return `${first.name} is going`;
  return `${first.name} + ${others} ${others === 1 ? 'other' : 'others'} going`;
}

// Capacity only becomes visually notable when it is genuinely scarce. This
// is a real derived fact, not manufactured urgency.
export function isScarce({ available, capacity }) {
  if (available === null || available === undefined || !capacity) return false;
  return available > 0 && available <= Math.max(3, Math.round(capacity * 0.15));
}
