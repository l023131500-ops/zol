// Validation for the device's idle-return-to-home timeout (KIOSK_BUILD.md §4:
// "חזרה אוטומטית: אחרי X שניות חוסר פעילות → חזרה לקישור הראשי/המדויק").
//
// 0 is a real, meaningful value here (idle_return_seconds's schema default,
// meaning "no auto-return configured") — unlike clampZoomPercent's 0, which
// is out-of-range input to reject, not a valid setting to keep.
//
// Before this, the two write paths that accept this field each rolled their
// own inline coercion instead of sharing one gate the way every other
// numeric policy field already does (clampZoomPercent in display.js,
// validateSignageInterval in signage.js):
//   - policy.js (single-device PATCH /devices/:id): `Math.max(0,
//     Number(idleReturnSeconds))`, with no NaN guard — `idleReturnSeconds:
//     "abc"` computed Math.max(0, NaN) === NaN, which better-sqlite3 binds as
//     NULL, which then threw "NOT NULL constraint failed" out of the UPDATE
//     (the column is NOT NULL) instead of a clean 400 — an authenticated
//     owner editing their own device could 500 it by fat-fingering the field.
//   - templatepolicy.js (bulk template apply): `Math.max(0, Number(...) ||
//     0)` already guarded against NaN, but like policy.js's version had no
//     upper bound at all — an absurd value like 999999999 would be stored
//     and pushed to every device the template is applied to.
// Both now share this one clamp.
const MIN_NONZERO_SECONDS = 5; // avoid a value so small it fights normal use
const MAX_SECONDS = 86400; // 24h — beyond this, "auto-return" stops being a safety net
const DEFAULT_SECONDS = 0; // 0 = off, the same default the devices/enrollments columns use

/**
 * @param {*} raw
 * @returns {number} 0, or an integer in [MIN_NONZERO_SECONDS, MAX_SECONDS];
 *   DEFAULT_SECONDS (0) for anything that is not a finite number.
 */
export function clampIdleReturnSeconds(raw) {
  if ((typeof raw !== 'number' && typeof raw !== 'string') || raw === '') return DEFAULT_SECONDS;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SECONDS;
  const rounded = Math.round(n);
  if (rounded <= 0) return 0;
  return Math.min(MAX_SECONDS, Math.max(MIN_NONZERO_SECONDS, rounded));
}

export { MIN_NONZERO_SECONDS, MAX_SECONDS, DEFAULT_SECONDS };
