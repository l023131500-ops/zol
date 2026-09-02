/**
 * gesturesettings.js validates the §4 per-device exit-gesture fields
 * (KIOSK_BUILD.md §4 "מחוֹת יציאה מדורגות... הכל ניתן להגדרה בלוח (כמה
 * הקשות, איזו פינה, אורך החזקה, קודים)"). No database dependency, so it is
 * exercised for real, the same shape orientation.js/payment.js/display.js/
 * exitcode.js already use.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GESTURE_CORNERS, GESTURE_CORNER_LABELS,
  DEFAULT_GESTURE_TAPS, DEFAULT_GESTURE_CORNER, DEFAULT_GESTURE_HOLD_MS,
  clampGestureTaps, validateGestureCorner, clampGestureHoldMs,
} from '../src/gesturesettings.js';

test('defaults match every device\'s pre-existing hardcoded behavior', () => {
  assert.equal(DEFAULT_GESTURE_TAPS, 5);
  assert.equal(DEFAULT_GESTURE_CORNER, 'tl');
  assert.equal(DEFAULT_GESTURE_HOLD_MS, 0);
});

test('clampGestureTaps defaults null/undefined/empty to 5', () => {
  assert.equal(clampGestureTaps(null), 5);
  assert.equal(clampGestureTaps(undefined), 5);
  assert.equal(clampGestureTaps(''), 5);
});

test('clampGestureTaps clamps to [3, 10] instead of rejecting', () => {
  assert.equal(clampGestureTaps(1), 3);
  assert.equal(clampGestureTaps(2), 3);
  assert.equal(clampGestureTaps(3), 3);
  assert.equal(clampGestureTaps(10), 10);
  assert.equal(clampGestureTaps(11), 10);
  assert.equal(clampGestureTaps(999), 10);
});

test('clampGestureTaps rounds and accepts numeric strings', () => {
  assert.equal(clampGestureTaps('7'), 7);
  assert.equal(clampGestureTaps(6.4), 6);
  assert.equal(clampGestureTaps(6.6), 7);
});

test('clampGestureTaps falls back to the default for non-numeric junk', () => {
  assert.equal(clampGestureTaps('abc'), 5);
  assert.equal(clampGestureTaps({}), 5);
  assert.equal(clampGestureTaps([]), 5);
  assert.equal(clampGestureTaps(NaN), 5);
});

test('validateGestureCorner defaults null/undefined/empty to "tl"', () => {
  assert.deepEqual(validateGestureCorner(null), { ok: true, value: 'tl' });
  assert.deepEqual(validateGestureCorner(undefined), { ok: true, value: 'tl' });
  assert.deepEqual(validateGestureCorner(''), { ok: true, value: 'tl' });
});

test('validateGestureCorner accepts each of the four corners', () => {
  for (const c of GESTURE_CORNERS) {
    assert.deepEqual(validateGestureCorner(c), { ok: true, value: c });
  }
});

test('validateGestureCorner is case-insensitive and trims whitespace', () => {
  assert.deepEqual(validateGestureCorner('  TR  '), { ok: true, value: 'tr' });
  assert.deepEqual(validateGestureCorner('Br'), { ok: true, value: 'br' });
});

test('validateGestureCorner rejects anything outside the four known corners', () => {
  assert.match(validateGestureCorner('center').error, /לא נתמכת/);
  assert.match(validateGestureCorner('top').error, /לא נתמכת/);
  assert.match(validateGestureCorner(42).error, /לא נתמכת/);
});

test('GESTURE_CORNER_LABELS has a label for every corner', () => {
  for (const c of GESTURE_CORNERS) {
    assert.ok(GESTURE_CORNER_LABELS[c], `missing label for ${c}`);
  }
});

test('clampGestureHoldMs defaults null/undefined/empty to 0', () => {
  assert.equal(clampGestureHoldMs(null), 0);
  assert.equal(clampGestureHoldMs(undefined), 0);
  assert.equal(clampGestureHoldMs(''), 0);
});

test('clampGestureHoldMs clamps to [0, 5000] instead of rejecting', () => {
  assert.equal(clampGestureHoldMs(-100), 0);
  assert.equal(clampGestureHoldMs(0), 0);
  assert.equal(clampGestureHoldMs(5000), 5000);
  assert.equal(clampGestureHoldMs(5001), 5000);
  assert.equal(clampGestureHoldMs(999999), 5000);
});

test('clampGestureHoldMs rounds and accepts numeric strings', () => {
  assert.equal(clampGestureHoldMs('1500'), 1500);
  assert.equal(clampGestureHoldMs(1500.4), 1500);
  assert.equal(clampGestureHoldMs(1500.6), 1501);
});

test('clampGestureHoldMs falls back to the default for non-numeric junk', () => {
  assert.equal(clampGestureHoldMs('abc'), 0);
  assert.equal(clampGestureHoldMs({}), 0);
  assert.equal(clampGestureHoldMs(NaN), 0);
});
