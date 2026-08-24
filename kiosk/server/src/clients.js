// KIOSK_BUILD.md §2★ד — the owner's own customer registry ("מזהה לקוח").
//
// A code is typed on a locked device by whoever is standing in front of it,
// so it has to survive the same sloppy input hostAllowed's host normaliser
// already defends against: stray spacing, mixed case, punctuation pasted in
// by accident. Codes are compared case-insensitively and stored upper-cased
// so "ab12" and "AB12" are the same customer, matching how enrollment codes
// (routes/agent.js's `codeGen`) already behave.
//
// Deliberately free of any `db.js` import (unlike devices.js/agent.js) so
// this validator can be unit-tested in this checkout, which has no
// better-sqlite3 installed — the same reason hosts.js/exitcode.js stay
// dependency-free. The db-touching half (`approvedClientsForDevice`) lives
// in db.js instead, next to `logEvent`.

const MIN_LENGTH = 2;
const MAX_LENGTH = 24;

/** Turn whatever a human typed into a bare client code, or '' if it cannot be one. */
export function normalizeClientCode(raw) {
  const s = String(raw ?? '').trim().toUpperCase().replace(/[\s-]+/g, '');
  if (s.length < MIN_LENGTH || s.length > MAX_LENGTH) return '';
  if (!/^[A-Z0-9]+$/.test(s)) return '';
  return s;
}
