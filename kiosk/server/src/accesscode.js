// KIOSK_BUILD.md §2★ז "device access-code + unauthenticated launcher page":
// a short code a technician can type into GET /k/:code, in any browser, to
// see a device's own approved client/link list and pick one — without a
// device_token, an ADB session, or a console login. This is the concrete
// implementation §2★ז names as missing (see STATUS.md's most recent
// housekeeping finding: earlier entries described this as built, but no
// route/table for it existed anywhere in this checkout).
//
// Same alphabet as routes/agent.js's enrollment `tokenGen` / routes/devices.js's
// `codeGen` (drops 0/1/I/O so a code read aloud over the phone is never
// ambiguous), kept as its own copy rather than imported from either: both of
// those live inside files that import nanoid/express/db.js, none of which
// are installed in this sandbox — this module stays dependency-free (only
// node:crypto, a runtime builtin) so it can be unit-tested here, the same
// reason hosts.js/exitcode.js/clients.js already stay import-free of db.js.
import { randomInt } from 'node:crypto';

export const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ACCESS_CODE_LENGTH = 6;

/** A fresh random code. Uniqueness against existing rows is the caller's job (see db.js's nextAccessCode). */
export function generateAccessCode() {
  let out = '';
  for (let i = 0; i < ACCESS_CODE_LENGTH; i++) {
    out += ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Turn whatever a human typed (or a URL path segment) into a bare access
 * code, or null if it cannot be one. Case-insensitive and tolerant of
 * stray spacing/hyphens, matching normalizeClientCode's (clients.js) reasoning
 * that this is typed by whoever is standing in front of a device. Unlike
 * normalizeClientCode's 2-24 char range (an owner-chosen customer id), this
 * is a generated code with one fixed shape — anything not exactly
 * ACCESS_CODE_LENGTH characters from ACCESS_CODE_ALPHABET is rejected
 * outright rather than accepted-and-mismatched, since a code that is merely
 * a truncated prefix of the real one must never resolve.
 */
export function normalizeAccessCode(raw) {
  const cleaned = String(raw ?? '').trim().toUpperCase().replace(/[\s-]+/g, '');
  if (cleaned.length !== ACCESS_CODE_LENGTH) return null;
  for (const ch of cleaned) if (!ACCESS_CODE_ALPHABET.includes(ch)) return null;
  return cleaned;
}
