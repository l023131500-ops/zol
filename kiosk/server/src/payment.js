// Payment input mode for a kiosk (KIOSK_BUILD.md §7 "תשלום ואמצעי קלט (3
// אופציות, ללא שמירת מספר כרטיס)"). This is a *locked* owner decision, not an
// open enum an API caller should be able to extend: the three modes below are
// exactly the three ways a card number is allowed to reach the payment
// gateway's own secured field, each never storing the PAN on this server or
// the device. A fourth shape — a HID keyboard-emulating magstripe reader that
// types 16 raw digits into an ordinary form field — is explicitly banned by
// the spec (it is unencrypted at the OS layer and pulls this system into full
// PCI scope), so it is deliberately absent from this set rather than being
// something a route has to separately reject.
//
// Deliberately free of any db.js/express import, the same shape
// display.js/schedule.js/exitcode.js/signage.js/maintenance.js already use
// for their own validated-input modules — exercised directly in a checkout
// with no better-sqlite3 installed.
export const PAYMENT_MODES = new Set(['none', 'manual', 'reader_prefill', 'emv_terminal']);
export const DEFAULT_PAYMENT_MODE = 'none';

/**
 * @param {*} raw
 * @returns {{ok: true, changed: false}} when the caller did not touch the field
 * @returns {{ok: true, changed: true, value: string}} for a recognized mode
 * @returns {{ok: false, error: string}} for anything else
 */
export function validatePaymentMode(raw) {
  if (raw === undefined) return { ok: true, changed: false };
  if (typeof raw !== 'string' || !PAYMENT_MODES.has(raw)) {
    return { ok: false, error: 'אמצעי תשלום לא נתמך' };
  }
  return { ok: true, changed: true, value: raw };
}
