// Free-text display name shared by devices, enrollments, clients, links, and
// templates (KIOSK_BUILD.md §2★/§8) — the console's own label for a resource,
// distinct from a code/URL/id, each of which already has its own validator
// (clients.js's normalizeClientCode, hosts.js's normalizeHomeUrl, ...). Every
// other free-text field in this app already caps its length (maintenance.js's
// MAX_MESSAGE_LENGTH, watchdog.js's MAX_DETAIL_LENGTH) — `name` was the one
// left unbounded on every write path (device PATCH, enrollment, client, link,
// template), letting an arbitrarily long string reach the single SQLite file
// this whole fleet shares (see apps/35-kioskfleet/app.json: a 1GB Railway
// volume) and the console's device/client/template lists that render it.
//
// Dependency-free like maintenance.js/exitcode.js, so it can be unit-tested
// in this checkout without better-sqlite3.

const MAX_NAME_LENGTH = 120;

/**
 * Validates an optional free-text name. Returns `{ ok: true, value }` where
 * `value` is `undefined` when the caller did not send the field at all ("no
 * change" — every call site's own COALESCE(?, name)-style update already
 * treats undefined that way), or the trimmed string otherwise (an explicit
 * '' clears the field, matching existing behaviour). Only length is capped —
 * like a maintenance message, a name is free text with no character-set
 * restriction of its own.
 */
export function validateName(raw, label = 'שם') {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: `${label} חייב להיות טקסט` };
  const trimmed = raw.trim();
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `${label} ארוך מדי (עד ${MAX_NAME_LENGTH} תווים)` };
  }
  return { ok: true, value: trimmed };
}
