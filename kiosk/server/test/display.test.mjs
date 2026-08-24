/**
 * clampZoomPercent() is the one gate between whatever an API caller sends and
 * `document.documentElement.style.zoom` on a locked kiosk WebView.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { clampZoomPercent, MIN_PERCENT, MAX_PERCENT, DEFAULT_PERCENT } from '../src/display.js';

test('a value inside the range passes through, rounded', () => {
  assert.equal(clampZoomPercent(150), 150);
  assert.equal(clampZoomPercent(150.4), 150);
  assert.equal(clampZoomPercent(150.6), 151);
});

test('below the floor is clamped up to it, not rejected', () => {
  assert.equal(clampZoomPercent(1), MIN_PERCENT);
  assert.equal(clampZoomPercent(-50), MIN_PERCENT);
  assert.equal(clampZoomPercent(0), MIN_PERCENT);
});

test('above the ceiling is clamped down to it', () => {
  assert.equal(clampZoomPercent(10000), MAX_PERCENT);
  assert.equal(clampZoomPercent(301), MAX_PERCENT);
});

test('missing, non-numeric, or NaN input falls back to the default, not the floor', () => {
  for (const bad of [undefined, null, '', 'abc', NaN, {}, []]) {
    assert.equal(clampZoomPercent(bad), DEFAULT_PERCENT, `expected ${JSON.stringify(bad)} to default`);
  }
});

test('a numeric string is accepted the same as a number', () => {
  assert.equal(clampZoomPercent('175'), 175);
});
