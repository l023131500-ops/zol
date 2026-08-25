// KIOSK_BUILD.md §4 "מחוֹת יציאה מדורגות (מוגדרות מראש)... הכל ניתן להגדרה
// בלוח (כמה הקשות, איזו פינה, אורך החזקה, קודים)" — until now only the code
// (exitcode.js) was configurable from the console; the tap-count, which
// corner, and hold-duration half of that sentence were hardcoded constants
// in KioskActivity.kt (CORNER_TAPS_REQUIRED = 5, a top-left-only bounding
// box, no hold requirement at all) with no server field and no console
// control — an owner who wanted a different corner (a kiosk mounted with one
// corner against a wall/stand), more taps (a busier public location where 5
// quick corner taps happens by accident more often), or the spec's own
// "הקשה מורכבת + החזקה" hold step had no way to ask for it.
//
// Three independent fields, each with its own always-valid default — same
// shape orientation.js/payment.js use, not the conditional "enabled" groups
// schedule.js/signage.js use, because the corner-tap gesture itself is not
// optional the way a schedule or signage playlist is: every device has
// *some* tap-count/corner/hold value at all times (defaulting to exactly
// what every device already does today), never an on/off switch.
//
// Deliberately free of any db.js/express import, like exitcode.js/display.js/
// orientation.js/payment.js/schedule.js/signage.js/maintenance.js — exercised
// directly in a checkout with no better-sqlite3 installed.

export const GESTURE_CORNERS = ['tl', 'tr', 'bl', 'br'];

// Matches exactly what every device already does today (KioskActivity's own
// hardcoded CORNER_TAPS_REQUIRED/top-left bounding-box/no-hold behavior) —
// the only defaults that change no device's behavior the moment these fields
// are introduced.
export const DEFAULT_GESTURE_TAPS = 5;
export const DEFAULT_GESTURE_CORNER = 'tl';
export const DEFAULT_GESTURE_HOLD_MS = 0;

const MIN_GESTURE_TAPS = 3;
const MAX_GESTURE_TAPS = 10;
const MAX_GESTURE_HOLD_MS = 5000;

/**
 * Clamp a §4 tap-count value. Below 3 makes the gesture trivially accidental
 * (a customer resting a finger in the corner); above 10 makes it
 * impractical to perform on purpose. Non-finite/missing falls back to the
 * pre-existing default, the same "clamp, don't reject" shape display.js's
 * clampZoomPercent uses for the same reason: this only ever feeds a
 * generated on-device value, never something a rejected request should
 * block the rest of a policy write over.
 */
export function clampGestureTaps(raw) {
  if ((typeof raw !== 'number' && typeof raw !== 'string') || raw === '') return DEFAULT_GESTURE_TAPS;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_GESTURE_TAPS;
  return Math.min(MAX_GESTURE_TAPS, Math.max(MIN_GESTURE_TAPS, Math.round(n)));
}

/**
 * Validate a §4 corner value. Null/undefined/'' default to
 * DEFAULT_GESTURE_CORNER, the honest value for every device before this
 * field existed — matching orientation.js's own "missing means the default,
 * not an error" contract. Anything else outside the four screen corners is
 * rejected (unlike the numeric fields above, there is no sensible clamp for
 * an enum).
 */
export function validateGestureCorner(raw) {
  const v = String(raw ?? DEFAULT_GESTURE_CORNER).trim().toLowerCase() || DEFAULT_GESTURE_CORNER;
  if (!GESTURE_CORNERS.includes(v)) {
    return { ok: false, error: `פינה לא נתמכת (אפשרויות: ${GESTURE_CORNERS.join(', ')})` };
  }
  return { ok: true, value: v };
}

/**
 * Clamp a §4 hold-duration value (milliseconds the final tap must stay
 * pressed before the gesture completes). 0 = no hold required, matching
 * every device's pre-existing behavior. Capped at 5s — long enough to be a
 * deliberate action, short enough that a legitimate technician is never
 * stuck holding a corner for an unreasonable time.
 */
export function clampGestureHoldMs(raw) {
  if ((typeof raw !== 'number' && typeof raw !== 'string') || raw === '') return DEFAULT_GESTURE_HOLD_MS;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_GESTURE_HOLD_MS;
  return Math.min(MAX_GESTURE_HOLD_MS, Math.max(0, Math.round(n)));
}

// Hebrew label for the console's device-edit form — physical on-screen
// position, direction-agnostic (unaffected by the console's own RTL layout).
export const GESTURE_CORNER_LABELS = {
  tl: 'פינה שמאלית עליונה',
  tr: 'פינה ימנית עליונה',
  bl: 'פינה שמאלית תחתונה',
  br: 'פינה ימנית תחתונה',
};
