// Validation for the `battery` field POST /api/agent/heartbeat accepts
// (KIOSK_BUILD.md §9 "סוללה נמוכה"/fleet console battery readout).
//
// Device-authored, like deviceinfo.js's model/androidVersion/appVersion/
// status/ip — /heartbeat only requires a device_token, not human review, so
// the caller cannot be trusted to send a well-formed number. Before this,
// `b.battery ?? null` reached `db.prepare(...).run(...)` unchecked, which is
// two separate live bugs, not one: an object/array value (e.g. `{}`) is not
// one of better-sqlite3's bindable types and throws out of the route
// handler with no try/catch, 500ing the request with a raw stack trace
// (reproduced live); and a string value (e.g. an `<img onerror=…>` payload)
// binds fine as SQLite TEXT and is returned as-is by GET /devices, which
// public/js/app.js's deviceCard() then interpolates completely unescaped
// (`${d.battery != null ? d.battery + '%' : '—'}`, unlike every neighbouring
// field in that same template) into an `el()`-built DOM node — a stored XSS
// in the fleet owner's own console, reachable by anything holding a valid
// device_token (including a fresh enrollment, the one credential this app
// hands to unattended hardware). Reproduced live: a malicious string battery
// survives a heartbeat unchanged and is handed back verbatim by GET /devices.
//
// Like sanitizeDeviceInfo, bad input is dropped to null (COALESCE leaves the
// device's last known-good reading in place) rather than failing the whole
// heartbeat — a kiosk that fails to parse its own battery API should not
// also lose its liveness/command-delivery heartbeat over it.

const MIN_BATTERY_PERCENT = 0;
const MAX_BATTERY_PERCENT = 100;

/**
 * @param {*} raw
 * @returns {number|null} an integer in [0, 100], or null for anything that
 *   is not a finite in-range number (missing field, wrong type, NaN, out of
 *   range) — including objects/arrays, which must never reach the SQL bind.
 */
export function sanitizeBatteryLevel(raw) {
  // Number('') is 0, a finite in-range value that would otherwise turn an
  // empty string into a real "0%" reading — same trap display.js's
  // clampZoomPercent already guards against for the same reason.
  if ((typeof raw !== 'number' && typeof raw !== 'string') || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < MIN_BATTERY_PERCENT || rounded > MAX_BATTERY_PERCENT) return null;
  return rounded;
}
