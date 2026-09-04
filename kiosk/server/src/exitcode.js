// Validation for the device's local maintenance/exit code.
//
// KioskActivity.showAdminDialog() (five taps in the corner) compares whatever
// is typed there against Prefs.ADMIN_CODE, character for character, entirely
// on-device — it is the only way out of a locked kiosk that survives a tablet
// with no network at all. That comparison has no rate limit and nothing to
// throttle a guess, so "obviously weak" has to be refused by shape here, at
// the one place a value is chosen, rather than relied on to be typed
// carefully by an owner setting it from a phone.

const MIN_LENGTH = 4;

function isTrivial(code) {
  const c = code.toLowerCase();
  if (new Set(c).size === 1) return true; // "1111", "aaaa"
  // A strictly ascending or descending run ("1234", "4321", "abcd") is the
  // other thing a person picks first when asked for "any 4 characters".
  let ascending = true;
  let descending = true;
  for (let i = 1; i < c.length; i++) {
    const diff = c.charCodeAt(i) - c.charCodeAt(i - 1);
    if (diff !== 1) ascending = false;
    if (diff !== -1) descending = false;
  }
  return ascending || descending;
}

/**
 * Validate a maintenance/exit code.
 * An empty (post-trim) string is a valid answer — it means "clear the code" —
 * and is returned distinctly from an invalid one so the caller can tell a
 * deliberate clear from a rejected value.
 *
 * The ends are trimmed (a trailing space is invisible in a form field and
 * unenterable on the device's dialog) and the middle is not (an interior
 * space may be part of a passphrase someone chose).
 */
export function validateExitCode(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { ok: true, value: '' };
  if (trimmed.length < MIN_LENGTH) {
    return { ok: false, error: `קוד תחזוקה חייב להיות באורך ${MIN_LENGTH} תווים לפחות` };
  }
  if (isTrivial(trimmed)) {
    return { ok: false, error: 'קוד תחזוקה זה קל מדי לניחוש — נסו קוד פחות צפוי' };
  }
  return { ok: true, value: trimmed };
}
