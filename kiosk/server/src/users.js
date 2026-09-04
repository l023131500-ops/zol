// Validation for the super-admin-only account-management fields
// (routes/admin.js's POST/PATCH /admin/users).
//
// Kept dependency-free like maintenance.js/exitcode.js/hosts.js, so it can be
// unit-tested in this checkout without better-sqlite3.

const MAX_FULL_NAME_LENGTH = 120;

/**
 * Validates the optional `fullName` field on a managed account. It used to go
 * straight from req.body into a raw SQL bind (`fullName || null` / `fullName
 * ?? null`) with no type check — the same "expected a string, got whatever
 * JSON allows" gap already fixed for other free-text fields in this app
 * (maintenance.js's message, watchdog.js's detail). An object/array/boolean
 * value passed straight to better-sqlite3's .run() throws (RangeError/
 * TypeError, not a validation error), crashing this admin-only route with a
 * raw 500 instead of a clean 400. Same length-cap shape as maintenance.js's
 * MAX_MESSAGE_LENGTH.
 *
 * `undefined` means "field not sent" and must stay undefined (not null):
 * POST has no existing row to clear, and PATCH's own COALESCE(?, full_name)
 * treats a bound NULL as "leave it alone" only because the caller coalesces
 * this validator's `undefined` back to null right before the bind —
 * collapsing it here instead would make every PATCH that omits fullName
 * silently clear it. `null`/'' is an explicit clear, same convention as the
 * other optional free-text fields in this app (maintenance.js's message,
 * exitcode.js's code).
 */
export function validateFullName(raw) {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'שם מלא חייב להיות טקסט' };
  const trimmed = raw.trim();
  if (trimmed.length > MAX_FULL_NAME_LENGTH) {
    return { ok: false, error: `שם מלא ארוך מדי (עד ${MAX_FULL_NAME_LENGTH} תווים)` };
  }
  return { ok: true, value: trimmed || null };
}

export { MAX_FULL_NAME_LENGTH };
