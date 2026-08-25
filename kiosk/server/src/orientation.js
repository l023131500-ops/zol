// KIOSK_BUILD.md §5 "בחירת אוריינטציה: אורך / רוחב — נכפה על המכשיר" — until
// this field existed every device was locked to landscape only, hardcoded in
// AndroidManifest.xml's static `android:screenOrientation="landscape"` on
// KioskActivity (display.js's own CSS-zoom fix, right above this file in the
// same §5, never touched orientation — only scale). There was no way for an
// owner to force a specific device to portrait, or leave rotation unforced,
// from the console.
//
// Like display_zoom_percent (and unlike payment_mode/access_code), this
// changes what the Android agent actually enforces at runtime
// (KioskActivity.applyOrientation() via requestedOrientation), so it rides
// commands.js's update_config payload — see policy.js's pushConfigUpdate.
//
// Deliberately free of any db.js/express import, exercised directly in a
// checkout with no better-sqlite3 installed, same as display.js/payment.js/
// exitcode.js/schedule.js/signage.js/maintenance.js.

export const ORIENTATIONS = ['landscape', 'portrait', 'auto'];

// Matches exactly what every device already does today (the manifest's
// static value) — the only default that changes no device's behavior the
// moment this field is introduced.
export const DEFAULT_ORIENTATION = 'landscape';

/**
 * Validate a §5 orientation value. Null/undefined/'' default to
 * DEFAULT_ORIENTATION, the honest value for every device before this field
 * existed — matching payment_mode's own "missing means the default, not an
 * error" contract. Anything else outside the three known values is rejected.
 */
export function validateOrientation(raw) {
  const v = String(raw ?? DEFAULT_ORIENTATION).trim().toLowerCase() || DEFAULT_ORIENTATION;
  if (!ORIENTATIONS.includes(v)) {
    return { ok: false, error: `אוריינטציה לא נתמכת (אפשרויות: ${ORIENTATIONS.join(', ')})` };
  }
  return { ok: true, value: v };
}

// Hebrew label for the console's device-edit form and template builder.
export const ORIENTATION_LABELS = {
  landscape: 'רוחב (Landscape) — נעול',
  portrait: 'אורך (Portrait) — נעול',
  auto: 'לפי סיבוב המכשיר (לא נכפה)',
};
