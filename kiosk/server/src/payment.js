// KIOSK_BUILD.md §7 "תשלום ואמצעי קלט (3 אופציות, ללא שמירת מספר כרטיס)" —
// entirely unbuilt. The allow-list already lets a device lock to a payment
// gateway's own checkout page (hosts.js's own comment already names "payment
// gateway" as one of the extra hosts an owner adds, and docs/payment-he.md
// documents the underlying "Method A/B" split), but nothing recorded *which*
// of the spec's three input methods a given device actually uses — so the
// console could not show the owner the right instructions/warning for their
// choice, and there was no per-device record of how that device's card input
// is meant to work at all.
//
// Deliberately server/console-only: none of the three modes changes what the
// Android agent enforces (a payment page is just another allow-listed link,
// same as any other), so — unlike exit_code/display_zoom_percent/schedule_*/
// signage_*/maintenance_* — this never rides on commands.js's update_config
// payload. It sits next to `access_code` in devicepayload.js's allow-list
// instead: owner-facing metadata, not on-device policy.
//
// Deliberately free of any db.js/express import, like exitcode.js/
// schedule.js/signage.js/maintenance.js/clients.js — exercised directly in a
// checkout with no better-sqlite3 installed.

export const PAYMENT_MODES = ['none', 'manual', 'card_reader', 'emv'];

/**
 * Validate a §7 payment-mode value. 'none' (also the fallback for null/
 * undefined/'') is the honest default for every device — no payment flow
 * configured — matching exit_code/schedule_enabled's own "unset means never
 * configured" convention elsewhere in this codebase.
 */
export function validatePaymentMode(raw) {
  const v = String(raw ?? 'none').trim().toLowerCase() || 'none';
  if (!PAYMENT_MODES.includes(v)) {
    return { ok: false, error: `אמצעי תשלום לא נתמך (אפשרויות: ${PAYMENT_MODES.join(', ')})` };
  }
  return { ok: true, value: v };
}

// Hebrew label + the spec's own recommended note per mode (KIOSK_BUILD.md
// §7's exact three options), for the console's device-edit form and device
// card. `note` is omitted for 'none' — there is nothing to warn about for a
// device with no payment flow configured.
export const PAYMENT_MODE_INFO = {
  none: { label: 'לא הוגדר תשלום במכשיר זה' },
  manual: {
    label: 'הקלדה ידנית מלאה בטופס המאובטח של ספק הסליקה',
    note: 'הקיוסק ננעל לעמוד/iframe המאובטח של הספק (deep-link) — שום ספרת כרטיס לא עוברת דרך הקוד שלנו.',
  },
  card_reader: {
    label: 'קורא מקליד רק את 16 הספרות + הלקוח משלים תוקף/CVV',
    note: 'מומלץ לוודא מול ספק הסליקה שאופציה זו מאושרת אצלו לפני שימוש. הקורא מוזין כמקלדת רגילה (HID) לתוך הטופס המאובטח — לא נשמר בקיוסק.',
  },
  emv: {
    label: 'מסופון מוסמך ומצפין (EMV, semi-integrated) לכרטיס פיזי',
    note: 'המסופון מצפין בראש הקריאה ומדבר ישירות עם הסליקה, ומחזיר טוקן+אישור בלבד. ראו docs/payment-he.md ("שיטה B") לדרישות אינטגרציה לפי דגם.',
  },
};
