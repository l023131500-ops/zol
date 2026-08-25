/**
 * names.js validates the free-text `name` field shared by POST
 * /api/enrollments, POST/PATCH /api/clients, and POST/PATCH /api/links.
 *
 * The bug this closes: each of those routes bound `name` straight from
 * req.body into a better-sqlite3 .run() call (`name || null` / `name ?? null`
 * / `String(name).trim()`) with no type check — enrollments/clients-PATCH/
 * links-PATCH crashed outright (an object/array reaches the SQL bind and
 * throws RangeError "Too few/many parameter values were provided"; a boolean
 * throws "SQLite3 can only bind numbers, strings, bigints, buffers, and
 * null"); clients-POST/links-POST silently stored "[object Object]" instead.
 * Reproduced live against a real Express app + scratch-file SQLite DB before
 * fixing: `POST /api/enrollments`, `PATCH /clients/:id`, and
 * `PATCH /links/:id` each 500'd on `{ name: { pwn: 1 } }` / `{ name: ["a"] }`.
 * Re-verified live after the fix: all three now answer a clean 400, and a
 * normal string name still saves correctly on every route (200).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateName, MAX_NAME_LENGTH } from '../src/names.js';

test('validateName treats "not sent" as undefined, distinct from an explicit clear', () => {
  assert.deepEqual(validateName(undefined, 'שם הלקוח'), { ok: true, value: undefined });
});

test('validateName treats null and empty string as an explicit clear', () => {
  assert.deepEqual(validateName(null, 'שם הלקוח'), { ok: true, value: '' });
  assert.deepEqual(validateName('', 'שם הלקוח'), { ok: true, value: '' });
});

test('validateName trims a normal name', () => {
  assert.deepEqual(validateName('  Hall One  ', 'שם הלקוח'), { ok: true, value: 'Hall One' });
  assert.deepEqual(validateName('אולם 3', 'שם הקישור'), { ok: true, value: 'אולם 3' });
});

test('validateName rejects a non-string instead of letting it reach the SQL bind', () => {
  for (const bad of [{}, { pwn: 1 }, [], ['a', 'b'], true, false, 42]) {
    const result = validateName(bad, 'שם הלקוח');
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
    assert.match(result.error, /טקסט/);
  }
});

test('validateName uses the caller-supplied label in its error', () => {
  const result = validateName({}, 'שם הקישור');
  assert.equal(result.error, 'שם הקישור חייב להיות טקסט');
});

test('validateName caps length', () => {
  const ok = 'א'.repeat(MAX_NAME_LENGTH);
  assert.deepEqual(validateName(ok, 'שם הלקוח'), { ok: true, value: ok });
  const tooLong = 'א'.repeat(MAX_NAME_LENGTH + 1);
  const result = validateName(tooLong, 'שם הלקוח');
  assert.equal(result.ok, false);
  assert.match(result.error, /ארוך מדי/);
});

test('validateName whitespace-only input trims to an empty clear, not a length violation', () => {
  assert.deepEqual(validateName('   ', 'שם הלקוח'), { ok: true, value: '' });
});
