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

/*
 * Today's Atlanta calendar date as YYYY-MM-DD, for bounding date inputs.
 * en-CA formats as YYYY-MM-DD, which is exactly what <input type="date">
 * takes for min/max and what the API expects. The backend re-checks every
 * date against the real database clock; this only keeps the control honest.
 */
export function todayInAtlanta() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

/*
 * Money is integer cents everywhere in the API and the database; it only
 * becomes dollars at the moment of display. Whole dollars by default,
 * because a fundraiser's progress reads better as "$4,250 of $10,000" than
 * with cents that are always .00 in a simulated demo.
 */
export function formatMoney(cents, { showCents = false } = {}) {
  const amount = (Number(cents) || 0) / 100;
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
}

/*
 * How much longer a fundraiser has, from a calendar end date. Date-only
 * throughout: both sides are reduced to Atlanta calendar days before
 * subtracting, so the answer never shifts by one with the viewer's clock.
 */
export function daysRemaining(endDate) {
  if (!endDate) return null;
  const [y, m, d] = String(endDate).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const end = Date.UTC(y, m - 1, d);
  const [ty, tm, td] = todayInAtlanta().split('-').map(Number);
  const today = Date.UTC(ty, tm - 1, td);
  return Math.round((end - today) / 86400000);
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
