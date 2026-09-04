// Validation for the device's display-zoom setting (KIOSK_BUILD.md §5).
//
// The console sends this as a plain number from a range input; nothing on
// that path stops a hand-crafted API call from sending a string, a negative
// number, or something absurd like 10000 — which the WebView would apply
// verbatim as `document.documentElement.style.zoom`, either doing nothing
// visible (out-of-range CSS zoom values are simply ignored by the engine) or,
// at the low end, shrinking the kiosk's own content to unreadable/unusable.
// Clamped to a range a 21"+ kiosk screen can actually use: 50% (a
// desktop-built site that needs shrinking to fit) to 300% (a phone-built site
// blown up to fill a large panel).

const MIN_PERCENT = 50;
const MAX_PERCENT = 300;
const DEFAULT_PERCENT = 100;

/**
 * @param {*} raw
 * @returns {number} an integer in [MIN_PERCENT, MAX_PERCENT]; DEFAULT_PERCENT
 *   for anything that is not a finite number (missing field, bad input).
 */
export function clampZoomPercent(raw) {
  // Number(null) and Number('') are both 0 — a finite number that would
  // otherwise clamp to MIN_PERCENT and silently turn "nothing sent" into
  // "50% requested". Reject those (and non-number/non-string shapes like {}
  // or []) before the numeric coercion, so only an actual number — including
  // 0 or a negative one, both real out-of-range requests — reaches it.
  if ((typeof raw !== 'number' && typeof raw !== 'string') || raw === '') return DEFAULT_PERCENT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_PERCENT;
  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, Math.round(n)));
}

export { MIN_PERCENT, MAX_PERCENT, DEFAULT_PERCENT };
