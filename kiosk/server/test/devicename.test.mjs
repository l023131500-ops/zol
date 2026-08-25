/**
 * devicename.js validates the `name` field policy.js's applyDevicePolicy
 * accepts — the shared write path behind PATCH /devices/:id and POST
 * /templates/:id/apply. No database dependency, so it is exercised for
 * real, the same shape maintenance.js/schedule.js/signage.js/display.js/
 * exitcode.js/users.js already use.
 *
 * The bug this closes: `name` used to go straight from req.body into a raw
 * SQL bind (`name ?? null` in applyDevicePolicy's .run() call) with no type
 * check at all — the one field in that function that skipped the
 * validate-then-bind shape every other field there already follows. An
 * object/array value reaches better-sqlite3's .run() as an extra/mistyped
 * bind parameter and throws synchronously (RangeError "Too few/many
 * parameter values were provided"); a boolean throws a TypeError ("SQLite3
 * can only bind numbers, strings, bigints, buffers, and null") — not a
 * validation error, an unhandled exception that crashes the route with a
 * raw 500 stack trace. Reproduced live against a real Express app + temp-
 * file SQLite DB before fixing: PATCH /api/devices/:id with
 * `{ name: { pwn: 1 } }` blew up with a 500 whose body was the RangeError's
 * stack trace at src/policy.js's applyDevicePolicy .run() call; `{ name: [] }`
 * and `{ name: true }` each blew up the same route with their own distinct
 * stack traces. Re-verified live after the fix: the same three requests now
 * answer 400 with a clean error, and a normal string name still saves
 * correctly (200).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDeviceName, MAX_NAME_LENGTH } from '../src/devicename.js';

test('validateDeviceName treats "not sent" as undefined, distinct from an explicit clear', () => {
  // undefined must round-trip as undefined (not null/'') — applyDevicePolicy's
  // own COALESCE(?, name) relies on this to leave the device's name untouched
  // when a PATCH omits the field, instead of wiping it on every partial edit.
  assert.deepEqual(validateDeviceName(undefined), { ok: true, value: undefined });
});

test('validateDeviceName treats null and empty string as an explicit clear', () => {
  assert.deepEqual(validateDeviceName(null), { ok: true, value: '' });
  assert.deepEqual(validateDeviceName(''), { ok: true, value: '' });
});

test('validateDeviceName trims a normal name', () => {
  assert.deepEqual(validateDeviceName('  Kiosk 1  '), { ok: true, value: 'Kiosk 1' });
  assert.deepEqual(validateDeviceName('עמדה 3'), { ok: true, value: 'עמדה 3' });
});

test('validateDeviceName rejects a non-string instead of letting it reach the SQL bind', () => {
  for (const bad of [{}, { pwn: 1 }, [], ['a', 'b'], true, false, 42]) {
    const result = validateDeviceName(bad);
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
    assert.match(result.error, /טקסט/);
  }
});

test('validateDeviceName caps length', () => {
  const ok = 'א'.repeat(MAX_NAME_LENGTH);
  assert.deepEqual(validateDeviceName(ok), { ok: true, value: ok });
  const tooLong = 'א'.repeat(MAX_NAME_LENGTH + 1);
  const result = validateDeviceName(tooLong);
  assert.equal(result.ok, false);
  assert.match(result.error, /ארוך מדי/);
});

test('validateDeviceName whitespace-only input trims to an empty clear, not a length violation', () => {
  assert.deepEqual(validateDeviceName('   '), { ok: true, value: '' });
});
