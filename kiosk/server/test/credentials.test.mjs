/**
 * credentials.js validates `username`/`password` on routes/auth.js (POST
 * /login, POST /change-password) and routes/admin.js (POST /users, POST
 * /users/:id/reset-password). No database dependency, exercised for real,
 * same shape as names.test.mjs/users.test.mjs.
 *
 * The bug this closes: every one of these routes only did a truthiness/
 * `.length` check before handing the raw value to a better-sqlite3 bind
 * (username) or bcryptjs's hashSync/compareSync (password). A non-string
 * value reached the bind/bcrypt call raw and crashed with an unhandled
 * exception, not a validation error — POST /login is reachable with no
 * authentication at all, so this is the first fully-unauthenticated crash
 * on this chain. Reproduced live against a real Express app + temp-file
 * SQLite DB before fixing: POST /api/auth/login with a numeric/object/array
 * password and POST /api/admin/users with an object/array/boolean username
 * or a numeric password each blew up with a 500 whose body was the raw
 * bcryptjs/better-sqlite3 error. Re-verified live after the fix: the same
 * requests now answer a clean 400/401, and a normal login/user-create still
 * succeeds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateUsername,
  validatePassword,
  requireNonEmptyString,
  MAX_USERNAME_LENGTH,
} from '../src/credentials.js';

test('validateUsername rejects a non-string instead of letting it reach the SQL bind', () => {
  for (const bad of [{}, { a: 1 }, [], ['a', 'b'], true, false, 42, undefined, null]) {
    const result = validateUsername(bad);
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
    assert.match(result.error, /טקסט/);
  }
});

test('validateUsername trims and rejects empty/whitespace-only', () => {
  assert.deepEqual(validateUsername('  admin  '), { ok: true, value: 'admin' });
  assert.equal(validateUsername('').ok, false);
  assert.equal(validateUsername('   ').ok, false);
});

test('validateUsername caps length', () => {
  const ok = 'a'.repeat(MAX_USERNAME_LENGTH);
  assert.deepEqual(validateUsername(ok), { ok: true, value: ok });
  const tooLong = 'a'.repeat(MAX_USERNAME_LENGTH + 1);
  assert.match(validateUsername(tooLong).error, /ארוך מדי/);
});

test('validatePassword rejects a non-string instead of letting it reach bcrypt', () => {
  for (const bad of [{}, [], [1, 2, 3, 4, 5, 6, 7, 8], true, false, 12345678, undefined, null]) {
    const result = validatePassword(bad);
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
    assert.match(result.error, /טקסט/);
  }
});

test('validatePassword enforces a minimum length and accepts a valid password', () => {
  assert.equal(validatePassword('short').ok, false);
  assert.deepEqual(validatePassword('longenough1'), { ok: true, value: 'longenough1' });
});

test('validatePassword uses the caller-supplied label in its error', () => {
  const tooShort = validatePassword('a', { label: 'סיסמה חדשה' });
  assert.match(tooShort.error, /^סיסמה חדשה/);
  const wrongType = validatePassword(42, { label: 'סיסמה חדשה' });
  assert.match(wrongType.error, /^סיסמה חדשה חייבת להיות טקסט$/);
});

test('requireNonEmptyString rejects non-strings and empty strings without a length policy', () => {
  for (const bad of [{}, [], true, 12345678, '', undefined, null]) {
    assert.equal(requireNonEmptyString(bad, 'סיסמה').ok, false);
  }
  assert.deepEqual(requireNonEmptyString('x', 'סיסמה'), { ok: true, value: 'x' });
});
