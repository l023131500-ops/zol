/**
 * users.js validates the optional `fullName` field on routes/admin.js's
 * POST/PATCH /admin/users (super-admin-only account management). No database
 * dependency, so it is exercised for real, the same shape
 * maintenance.js/schedule.js/signage.js/display.js/exitcode.js already use.
 *
 * The bug this closes: `fullName` used to go straight from req.body into a
 * raw SQL bind (`fullName || null` on POST, `fullName ?? null` on PATCH)
 * with no type check. An object/array/boolean value reaches better-sqlite3's
 * .run() as an extra/mistyped bind parameter, which throws synchronously
 * (RangeError "Too few/many parameter values were provided", or for a plain
 * boolean a TypeError) — not a validation error, an unhandled exception that
 * crashed the route with a raw 500 stack trace. Reproduced live against a
 * real Express app + temp-file SQLite DB before fixing: both POST
 * /admin/users and PATCH /admin/users/:id with `{ fullName: { a: 1 } }` blew
 * up with a 500 whose body was the RangeError's stack trace, at
 * src/routes/admin.js's INSERT/UPDATE .run() call. Re-verified live after
 * the fix: the same request now answers 400 with a clean error, and a normal
 * string fullName still saves correctly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFullName, MAX_FULL_NAME_LENGTH } from '../src/users.js';

test('validateFullName treats "not sent" as undefined, distinct from an explicit clear', () => {
  // undefined must round-trip as undefined (not null) — see users.js's own
  // comment: routes/admin.js's PATCH relies on this to leave full_name
  // untouched via COALESCE(?, full_name) when the caller does not send the
  // field at all, instead of wiping it on every partial update.
  assert.deepEqual(validateFullName(undefined), { ok: true, value: undefined });
  assert.deepEqual(validateFullName(null), { ok: true, value: null });
  assert.deepEqual(validateFullName(''), { ok: true, value: null });
});

test('validateFullName trims and treats whitespace-only as an explicit clear', () => {
  assert.deepEqual(validateFullName('   '), { ok: true, value: null });
  assert.deepEqual(validateFullName('  Dana Levi  '), { ok: true, value: 'Dana Levi' });
});

test('validateFullName rejects a non-string instead of letting it reach the SQL bind', () => {
  for (const bad of [{}, { a: 1 }, [], [1, 2], true, false, 42]) {
    const result = validateFullName(bad);
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
    assert.match(result.error, /טקסט/);
  }
});

test('validateFullName caps length', () => {
  const ok = 'א'.repeat(MAX_FULL_NAME_LENGTH);
  assert.deepEqual(validateFullName(ok), { ok: true, value: ok });
  const tooLong = 'א'.repeat(MAX_FULL_NAME_LENGTH + 1);
  assert.match(validateFullName(tooLong).error, /ארוך מדי/);
});
