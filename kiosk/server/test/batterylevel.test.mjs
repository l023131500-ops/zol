/**
 * sanitizeBatteryLevel() is the one gate between whatever an unauthenticated-
 * but-tokened device sends as `battery` on a heartbeat and (a) a raw SQL bind
 * that must never receive a non-bindable type, and (b) the fleet console's
 * unescaped `${d.battery}%` interpolation (public/js/app.js's deviceCard()).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeBatteryLevel } from '../src/batterylevel.js';

test('an in-range integer passes through unchanged', () => {
  assert.equal(sanitizeBatteryLevel(0), 0);
  assert.equal(sanitizeBatteryLevel(57), 57);
  assert.equal(sanitizeBatteryLevel(100), 100);
});

test('a non-integer number rounds to the nearest integer', () => {
  assert.equal(sanitizeBatteryLevel(57.4), 57);
  assert.equal(sanitizeBatteryLevel(57.6), 58);
});

test('a numeric string is accepted the same as a number', () => {
  assert.equal(sanitizeBatteryLevel('42'), 42);
});

test('out-of-range numbers are dropped to null, not clamped', () => {
  assert.equal(sanitizeBatteryLevel(101), null);
  assert.equal(sanitizeBatteryLevel(-1), null);
  assert.equal(sanitizeBatteryLevel(999999999), null);
});

test('missing/non-numeric input is dropped to null', () => {
  for (const bad of [undefined, null, '', 'abc', NaN, Infinity, -Infinity]) {
    assert.equal(sanitizeBatteryLevel(bad), null, `expected ${JSON.stringify(bad)} to drop to null`);
  }
});

test('objects/arrays/booleans are dropped to null, never reach the SQL bind', () => {
  for (const bad of [{}, [], [1, 2], true, false]) {
    assert.equal(sanitizeBatteryLevel(bad), null, `expected ${JSON.stringify(bad)} to drop to null`);
  }
});

test('an XSS-shaped string is dropped to null, never stored verbatim', () => {
  assert.equal(sanitizeBatteryLevel('<img src=x onerror=alert(1)>'), null);
});
