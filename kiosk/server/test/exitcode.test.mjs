/**
 * The device compares this value with no rate limit at all (it is typed into
 * a local AlertDialog, offline, after five corner taps), so weak-by-shape
 * codes have to be refused here rather than merely discouraged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExitCode } from '../src/exitcode.js';

test('an empty or all-whitespace value is a valid clear', () => {
  assert.deepEqual(validateExitCode(''), { ok: true, value: '' });
  assert.deepEqual(validateExitCode('   '), { ok: true, value: '' });
  assert.deepEqual(validateExitCode(undefined), { ok: true, value: '' });
});

test('ends are trimmed, the middle is not', () => {
  const r = validateExitCode('  ab 12  ');
  assert.equal(r.ok, true);
  assert.equal(r.value, 'ab 12');
});

test('too short is rejected', () => {
  const r = validateExitCode('abc');
  assert.equal(r.ok, false);
});

test('a run of one repeated character is rejected regardless of length', () => {
  for (const bad of ['1111', 'aaaaaa', 'AAAA']) {
    assert.equal(validateExitCode(bad).ok, false, `expected ${bad} to be rejected`);
  }
});

test('a strictly ascending or descending run is rejected', () => {
  for (const bad of ['1234', '4321', 'abcd', 'dcba', '6789', '9876']) {
    assert.equal(validateExitCode(bad).ok, false, `expected ${bad} to be rejected`);
  }
});

test('a plausible code is accepted unchanged', () => {
  for (const good of ['7k2m', 'sunset7', 'Ab3xQ9', '19-84']) {
    const r = validateExitCode(good);
    assert.equal(r.ok, true, `expected ${good} to be accepted`);
    assert.equal(r.value, good);
  }
});

test('a run that is ascending except for one break is accepted', () => {
  // Guards against a shape check that is really just "starts low, ends high".
  assert.equal(validateExitCode('1235').ok, true);
});
