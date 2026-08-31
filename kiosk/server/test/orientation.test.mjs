/**
 * orientation.js validates the §5 per-device screen-orientation field
 * (KIOSK_BUILD.md §5 "בחירת אוריינטציה: אורך / רוחב — נכפה על המכשיר"). No
 * database dependency, so it is exercised for real, the same shape
 * schedule.js/signage.js/display.js/exitcode.js/maintenance.js/payment.js
 * already use.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ORIENTATIONS, ORIENTATION_LABELS, DEFAULT_ORIENTATION, validateOrientation } from '../src/orientation.js';

test('DEFAULT_ORIENTATION is landscape — matches every device\'s pre-existing hardcoded behavior', () => {
  assert.equal(DEFAULT_ORIENTATION, 'landscape');
});

test('validateOrientation defaults null/undefined/empty to landscape', () => {
  assert.deepEqual(validateOrientation(null), { ok: true, value: 'landscape' });
  assert.deepEqual(validateOrientation(undefined), { ok: true, value: 'landscape' });
  assert.deepEqual(validateOrientation(''), { ok: true, value: 'landscape' });
});

test('validateOrientation accepts each of the three known values', () => {
  for (const o of ORIENTATIONS) {
    assert.deepEqual(validateOrientation(o), { ok: true, value: o });
  }
});

test('validateOrientation is case-insensitive and trims whitespace', () => {
  assert.deepEqual(validateOrientation('  PORTRAIT  '), { ok: true, value: 'portrait' });
  assert.deepEqual(validateOrientation('Auto'), { ok: true, value: 'auto' });
  assert.deepEqual(validateOrientation('LANDSCAPE'), { ok: true, value: 'landscape' });
});

test('validateOrientation rejects anything outside the three known values', () => {
  assert.match(validateOrientation('upside-down').error, /לא נתמכת/);
  assert.match(validateOrientation('square').error, /לא נתמכת/);
  assert.match(validateOrientation(42).error, /לא נתמכת/);
});

test('ORIENTATION_LABELS has a label for every orientation', () => {
  for (const o of ORIENTATIONS) {
    assert.ok(ORIENTATION_LABELS[o], `missing label for ${o}`);
  }
});
