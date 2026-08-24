// Remote maintenance mode (KIOSK_BUILD.md §9 "מצב תחזוקה מרחוק") — was
// entirely unbuilt. Lets an owner take one device out of customer-facing
// service (cleaning, a stuck payment terminal, a venue between events)
// without disenrolling it or wiping its allow-list/home-URL, and bring it
// back with one click. Distinct from exitcode.js's "maintenance code": that
// is the *local*, on-device corner-tap code a technician types to reach
// device settings; this is a *remote* on/off switch pushed from the console
// that shows a blocking screen in place of the locked site.
//
// Kept free of every other module's import (db/commands/express) so it can
// be exercised here without better-sqlite3, which this checkout does not
// have installed — the same shape schedule.js/signage.js/display.js/
// exitcode.js already use for their own validated-input modules.

const MAX_MESSAGE_LENGTH = 200;

/**
 * Validates the optional customer-facing message shown on a device's
 * maintenance screen. Unlike exitcode.js's code (a secret) or a URL (must
 * resolve), a maintenance message is free text with only a length cap — long
 * enough for a real sentence, short enough that a device with a small screen
 * can still render it without scrolling. An empty/omitted message is valid;
 * the on-device default ("המכשיר בתחזוקה זמנית") is used instead.
 */
export function validateMaintenanceMessage(raw) {
  if (raw == null || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'הודעת התחזוקה חייבת להיות טקסט' };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `הודעת התחזוקה ארוכה מדי (עד ${MAX_MESSAGE_LENGTH} תווים)` };
  }
  return { ok: true, value: trimmed };
}
