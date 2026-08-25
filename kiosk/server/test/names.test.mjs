/**
 * names.js validates the free-text `name` shared by devices, enrollments,
 * clients, links, and templates — the one field every one of those write
 * paths left completely unbounded while every other free-text field
 * (maintenance.js's message, watchdog.js's detail) already caps its length.
 * No database dependency, same shape as maintenance.js/exitcode.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateName } from '../src/names.js';

test('validateName treats undefined as "no change", not empty', () => {
  assert.deepEqual(validateName(undefined), { ok: true, value: undefined });
});

test('validateName treats null as "no change" too', () => {
  assert.deepEqual(validateName(null), { ok: true, value: null });
});

test('validateName trims and treats an explicit empty string as "clear"', () => {
  assert.deepEqual(validateName(''), { ok: true, value: '' });
  assert.deepEqual(validateName('   '), { ok: true, value: '' });
  assert.deepEqual(validateName('  Front Door  '), { ok: true, value: 'Front Door' });
});

test('validateName rejects a non-string', () => {
  assert.match(validateName(42).error, /טקסט/);
  assert.match(validateName({}).error, /טקסט/);
});

test('validateName caps length at 120 characters', () => {
  const ok = 'א'.repeat(120);
  assert.deepEqual(validateName(ok), { ok: true, value: ok });
  const tooLong = 'א'.repeat(121);
  assert.match(validateName(tooLong).error, /ארוך מדי/);
});

test('validateName includes the given label in its error message', () => {
  assert.match(validateName('א'.repeat(200), 'שם המכשיר').error, /שם המכשיר/);
  assert.match(validateName(42, 'שם הלקוח').error, /שם הלקוח/);
});
