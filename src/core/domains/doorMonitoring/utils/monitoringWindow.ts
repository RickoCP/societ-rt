/**
 * Monitoring-window time utilities (pure functions, no external deps).
 *
 * The app currently uses a single constant timezone for interpreting the
 * resident-configured monitoring window. This is intentionally centralized in
 * one place (`APP_TIMEZONE`) so it can be changed later (or made per-tenant)
 * without touching the trigger logic.
 */

/**
 * The timezone used to interpret monitoring windows. Kept as a single constant
 * so it is trivial to change later or replace with a per-tenant lookup.
 *
 * @see requirement: "pakai satu timezone konstan dulu dan bikin mudah diubah"
 */
export const APP_TIMEZONE = 'Asia/Jakarta';

/** Matches a valid 24h HH:mm time-of-day string. */
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Returns true when `value` is a valid HH:mm (24h) string. */
export function isValidTimeOfDay(value: string): boolean {
  return HHMM_RE.test(value);
}

/** Convert a valid HH:mm string to minutes since midnight (0..1439). */
export function toMinutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * Get the minutes-since-midnight for a given instant, in APP_TIMEZONE (or a
 * provided override). Uses Intl to avoid pulling in a date library.
 */
export function minutesOfDayInZone(
  instant: Date,
  timeZone: string = APP_TIMEZONE,
): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);

  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === 'hour') hour = Number(p.value) % 24;
    if (p.type === 'minute') minute = Number(p.value);
  }
  return hour * 60 + minute;
}

/**
 * Returns true when `now` falls inside the monitoring window [start, end),
 * interpreted in `timeZone`. Supports windows that wrap past midnight
 * (e.g. 22:00 -> 05:00).
 *
 * Semantics:
 *  - start === end  → treated as an empty window (never inside). This avoids
 *    accidentally arming a 24h window from a misconfiguration.
 *  - start <  end   → simple same-day window: start <= t < end.
 *  - start >  end   → wraps midnight: t >= start OR t < end.
 */
export function isWithinMonitoringWindow(
  now: Date,
  start: string,
  end: string,
  timeZone: string = APP_TIMEZONE,
): boolean {
  if (!isValidTimeOfDay(start) || !isValidTimeOfDay(end)) {
    return false;
  }

  const startMin = toMinutesOfDay(start);
  const endMin = toMinutesOfDay(end);
  const nowMin = minutesOfDayInZone(now, timeZone);

  if (startMin === endMin) {
    // Empty window — nothing is monitored.
    return false;
  }

  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }

  // Wraps past midnight.
  return nowMin >= startMin || nowMin < endMin;
}
