// Shared validators for the `username`/`password` fields on routes/auth.js
// (POST /login, POST /change-password) and routes/admin.js (POST /users,
// POST /users/:id/reset-password). Kept dependency-free like
// names.js/users.js/etc., so it is exercised for real in a checkout with no
// better-sqlite3/bcryptjs installed.
//
// The bug this closes: every one of these routes only ever did a truthiness
// check (`!username`/`!password`) or a `.length` check before handing the
// raw req.body value straight to a better-sqlite3 bind (username) or
// bcryptjs's hashSync/compareSync (password) — the same "expected a string,
// got whatever JSON allows" gap already fixed for name/fullName/commandId/
// device-name/battery on this chain. A non-string username (object/array/
// boolean) throws a raw RangeError/TypeError at the SQL bind; a non-string
// password throws bcryptjs's own "Illegal arguments: <type>, string" — and
// an array password (e.g. 8 elements) slips past a bare `.length < 8` check
// undetected before reaching bcrypt. Unlike every prior fix on this chain,
// POST /login is reachable with **no authentication at all**, so this is the
// first fully-unauthenticated instance of the class. Reproduced live against
// a real server + scratch DB before fixing: POST /api/auth/login with a
// numeric/object/array password, POST /api/auth/change-password with a
// numeric currentPassword, and POST /api/admin/users with an object/array/
// boolean username or a numeric password each 500'd with a raw stack trace.

const MAX_USERNAME_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 200;

/**
 * @param {*} raw
 * @returns {{ok: true, value: string} | {ok: false, error: string}}
 */
export function validateUsername(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'שם משתמש חייב להיות טקסט' };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'שם משתמש נדרש' };
  if (trimmed.length > MAX_USERNAME_LENGTH) {
    return { ok: false, error: `שם משתמש ארוך מדי (עד ${MAX_USERNAME_LENGTH} תווים)` };
  }
  return { ok: true, value: trimmed };
}

/**
 * For setting/changing a password (account creation, admin reset,
 * self-service change) — a real length policy applies.
 * @param {*} raw
 * @param {{minLength?: number, label?: string}} [opts]
 * @returns {{ok: true, value: string} | {ok: false, error: string}}
 */
export function validatePassword(raw, { minLength = 8, label = 'סיסמה' } = {}) {
  if (typeof raw !== 'string') return { ok: false, error: `${label} חייבת להיות טקסט` };
  if (raw.length < minLength) {
    return { ok: false, error: `${label} חייבת להיות באורך ${minLength} תווים לפחות` };
  }
  if (raw.length > MAX_PASSWORD_LENGTH) return { ok: false, error: `${label} ארוכה מדי` };
  return { ok: true, value: raw };
}

/**
 * For *checking* a password already on file (login, change-password's
 * currentPassword) — no length policy here, since an existing account's
 * password was validated under whatever policy applied when it was set. A
 * too-short/too-long/wrong value is simply "wrong password" (401/403), not a
 * validation error; only the type needs to be safe before it reaches bcrypt.
 * @param {*} raw
 * @param {string} label
 * @returns {{ok: true, value: string} | {ok: false, error: string}}
 */
export function requireNonEmptyString(raw, label) {
  if (typeof raw !== 'string' || !raw) return { ok: false, error: `${label} נדרש/ת` };
  return { ok: true, value: raw };
}

export { MAX_USERNAME_LENGTH, MAX_PASSWORD_LENGTH };
