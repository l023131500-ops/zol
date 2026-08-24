// Business-hours screen scheduling (KIOSK_BUILD.md §9 "תזמון: נעילה/פתיחה/
// כיבוי לפי שעות (שעות פעילות אולם/חנות)").
//
// Kept free of every other module's import (db/commands/express) so it can be
// exercised here without better-sqlite3, which this checkout does not have
// installed — the same shape display.js/hosts.js/exitcode.js already use for
// their own validated-input modules. The db-touching enforcement loop that
// calls these lives in index.js, next to the existing offline-marking
// interval it is modeled on.

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "HH:MM" (24h) -> minutes since midnight, or null for anything else. */
export function parseTimeToMinutes(raw) {
  if (typeof raw !== 'string') return null;
  const m = TIME_RE.exec(raw.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Validates an open/close pair before it is stored. Both must parse, and
 * they must not be equal — an equal pair is ambiguous (a zero-length open
 * window vs. "open all day", which already has its own on/off switch —
 * scheduleEnabled) rather than a window this can silently pick one meaning
 * for.
 */
export function validateScheduleWindow(openRaw, closeRaw) {
  const openMinutes = parseTimeToMinutes(openRaw);
  const closeMinutes = parseTimeToMinutes(closeRaw);
  if (openMinutes == null || closeMinutes == null) {
    return { ok: false, error: 'שעות פתיחה/סגירה חייבות בפורמט HH:MM (למשל 09:00)' };
  }
  if (openMinutes === closeMinutes) {
    return { ok: false, error: 'שעת הפתיחה והסגירה לא יכולות להיות זהות' };
  }
  return { ok: true, openMinutes, closeMinutes };
}

/**
 * Whether `nowMinutes` falls inside the open window. Supports an overnight
 * window (close < open, e.g. 22:00–06:00 for a night venue) the same way a
 * same-day window (open < close, e.g. 09:00–21:00 for a shop) is supported —
 * only the two clock times are configured, not which side of midnight they
 * fall on.
 */
export function isWithinOpenWindow(nowMinutes, openMinutes, closeMinutes) {
  if (openMinutes < closeMinutes) return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
}

/** 'on' during the open window, 'off' outside it — the screen state a schedule enforces. */
export function desiredScreenState(nowMinutes, openMinutes, closeMinutes) {
  return isWithinOpenWindow(nowMinutes, openMinutes, closeMinutes) ? 'on' : 'off';
}

/** Minutes since local midnight for a Date — the server's own local clock, matching how the open/close strings are entered. */
export function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}
