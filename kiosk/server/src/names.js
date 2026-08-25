// Shared validator for the free-text `name` field used across several
// resources — enrollments/devices (routes/devices.js), clients
// (routes/clients.js), and links (routes/links.js). Mirrors devicename.js's
// validateDeviceName exactly (same undefined/null/'' semantics, same 120-char
// cap), generalized with a caller-supplied Hebrew label so each resource
// keeps its own wording instead of borrowing "שם המכשיר" for a client or link.
//
// The bug this closes: POST /api/enrollments, PATCH /clients/:id, and
// PATCH /links/:id each bound `name` straight from req.body into a
// better-sqlite3 .run() call (`name || null` / `name ?? null`) with no type
// check — the same class already fixed for devices.js's applyDevicePolicy
// (devicename.js), users.js's fullName, agent.js's commandId, etc. An
// object/array value reaches the bind and throws a raw, unhandled 500
// (RangeError "Too few/many parameter values were provided"); a boolean
// throws "SQLite3 can only bind numbers, strings, bigints, buffers, and
// null". Reproduced live against a real server + scratch DB before fixing:
// POST /api/enrollments, PATCH /clients/:id, and PATCH /links/:id each 500'd
// on an object/array `name`.
//
// Kept dependency-free like devicename.js/maintenance.js/etc., so it is
// exercised for real in a checkout with no better-sqlite3 installed.

const MAX_NAME_LENGTH = 120;

/**
 * @param {*} raw
 * @param {string} label Hebrew noun phrase for the error message, e.g. "שם הלקוח".
 * @returns {{ok: true, value: string|undefined} | {ok: false, error: string}}
 */
export function validateName(raw, label) {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null) return { ok: true, value: '' };
  if (typeof raw !== 'string') return { ok: false, error: `${label} חייב להיות טקסט` };
  const trimmed = raw.trim();
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `${label} ארוך מדי (עד ${MAX_NAME_LENGTH} תווים)` };
  }
  return { ok: true, value: trimmed };
}

export { MAX_NAME_LENGTH };
