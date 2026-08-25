// Validation for the `name` field policy.js's applyDevicePolicy accepts —
// the shared write path behind PATCH /devices/:id (an owner editing one
// device's friendly name by hand) and POST /templates/:id/apply (a bulk
// policy push, though policyPatchFromTemplate never actually sets `name` on
// that path today).
//
// Every other field applyDevicePolicy touches already goes through its own
// validator (exitcode.js's validateExitCode, schedule.js's
// validateScheduleWindow, signage.js's validateSignagePlaylist/Interval,
// maintenance.js's validateMaintenanceMessage) before reaching the SQL bind
// at the bottom of that function — `name` was the one field that skipped
// straight from req.body to `name ?? null` in the .run() call with no type
// check at all. An object/array/boolean value crashes with a raw, unhandled
// 500 (RangeError "Too few/many parameter values were provided" for an
// object/array, TypeError "SQLite3 can only bind numbers, strings, bigints,
// buffers, and null" for a boolean — reproduced live, all three shapes)
// instead of a clean 400: the same "expected a primitive, got whatever JSON
// allows" gap already fixed for other free-text fields in this app
// (users.js's validateFullName, maintenance.js's message, watchdog.js's
// detail).
//
// Kept dependency-free like those other validators, so it can be
// unit-tested in this checkout without better-sqlite3.
//
// Matches applyDevicePolicy's existing semantics exactly: `undefined` means
// "field not sent" (COALESCE(?, name) leaves the device's current name
// alone) and must stay undefined, not null — collapsing it here would turn
// every PATCH that omits `name` into one that clears it. An explicit `''`
// is a real, if unusual, request to blank the name out (the previous
// `name ?? null` already bound '' as '', not null, since '' is not
// nullish) — preserved rather than reinterpreted as "no change".

const MAX_NAME_LENGTH = 120;

/**
 * @param {*} raw
 * @returns {{ok: true, value: string|undefined} | {ok: false, error: string}}
 */
export function validateDeviceName(raw) {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null) return { ok: true, value: '' };
  if (typeof raw !== 'string') return { ok: false, error: 'שם המכשיר חייב להיות טקסט' };
  const trimmed = raw.trim();
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `שם המכשיר ארוך מדי (עד ${MAX_NAME_LENGTH} תווים)` };
  }
  return { ok: true, value: trimmed };
}

export { MAX_NAME_LENGTH };
