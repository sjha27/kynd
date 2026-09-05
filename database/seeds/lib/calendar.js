const CONFIG = require('../config');

/*
 * Atlanta-local calendar math for the synthetic world.
 *
 * Every synthetic timestamp is positioned relative to CONFIG.anchorDate,
 * which is derived from WORLD_REFERENCE_DATE (see database/seeds/config.js).
 * Keeping that arithmetic here means the DST rule has one definition instead
 * of being copied into each generator.
 *
 * Note this is synthetic PRODUCT-world time. Real infrastructure time —
 * demo-session creation and expiry, logging, deployment health — must keep
 * using the actual clock and must not be routed through these helpers.
 */

// US Eastern DST: second Sunday in March to first Sunday in November.
function nthSunday(year, monthIndex, occurrence) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const firstSunday = 1 + ((7 - first.getUTCDay()) % 7);
  return firstSunday + (occurrence - 1) * 7;
}

function easternOffsetForDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const dstStart = `${year}-03-${String(nthSunday(year, 2, 2)).padStart(2, '0')}`;
  const dstEnd = `${year}-11-${String(nthSunday(year, 10, 1)).padStart(2, '0')}`;
  const current = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return current >= dstStart && current < dstEnd ? '-04:00' : '-05:00';
}

// The reference date's own calendar day, as YYYY-MM-DD.
function referenceCalendarDate() {
  return CONFIG.anchorDate.slice(0, 10);
}

// Calendar date `dayOffset` days from the reference date. Midday UTC avoids
// any chance of the arithmetic slipping across a day boundary.
function dateAtOffset(dayOffset) {
  const date = new Date(`${referenceCalendarDate()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

// An exact instant: `time` is the Atlanta-local wall clock on the day
// `dayOffset` days from the reference date.
function timestampAtOffset(dayOffset, time) {
  const dateString = dateAtOffset(dayOffset);
  return new Date(
    `${dateString}T${time}:00${easternOffsetForDate(dateString)}`
  ).toISOString();
}

function dayOfWeekAtOffset(dayOffset) {
  return new Date(`${dateAtOffset(dayOffset)}T12:00:00Z`).getUTCDay();
}

module.exports = {
  easternOffsetForDate,
  referenceCalendarDate,
  dateAtOffset,
  timestampAtOffset,
  dayOfWeekAtOffset,
};
