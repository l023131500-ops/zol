// Validation for the device's auto-return-when-idle setting (KIOSK_BUILD.md
// §4 "חזרה אוטומטית" — after X idle seconds, snap back to the locked home
// URL). Deliberately free of any db.js/express import, same convention as
// hosts.js/schedule.js/signage.js/display.js/exitcode.js/clients.js.
//
// Three write paths set this field: policy.js's applyDevicePolicy (shared by
// routes/devices.js's PATCH /devices/:id and a template bulk-apply),
// templatepolicy.js's buildTemplateFields (saving a template itself), and
// routes/devices.js's POST /enrollments (the code a fresh device redeems).
// All three used to compute it inline as `Math.max(0, Number(idleReturnSeconds))`
// (or `|| 0` at the enrollment/template sites) with no shared gate:
//
// - policy.js had no NaN guard at all: `Math.max(0, Number("abc"))` is
//   `Math.max(0, NaN)`, which is `NaN` — and better-sqlite3 binds NaN as SQL
//   NULL, which then threw `NOT NULL constraint failed` out of the UPDATE
//   (idle_return_seconds is NOT NULL) instead of the clean 400 every other
//   malformed field on this same path already returns.
// - None of the three had an upper bound, so an absurd value (e.g.
//   999999999) would be stored and pushed straight to the device via
//   update_config / a template apply, silently defeating the auto-return
//   safety net it exists to provide.
//
// 0 means "off" and must pass through unclamped — it is the device's
// explicit "no auto-return" state, not a missing/invalid value.

const MIN_SECONDS = 5;
const MAX_SECONDS = 86400; // 24h — long enough to never fire in practice, short enough to still be a real cap
const OFF = 0;

/**
 * @param {*} raw
 * @returns {number} OFF (0) for anything that is not a finite positive
 *   number (missing field, bad input, 0, or a negative number); otherwise an
 *   integer in [MIN_SECONDS, MAX_SECONDS].
 */
export function clampIdleReturnSeconds(raw) {
  if ((typeof raw !== 'number' && typeof raw !== 'string') || raw === '') return OFF;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return OFF;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(n)));
}

export { MIN_SECONDS, MAX_SECONDS, OFF };
