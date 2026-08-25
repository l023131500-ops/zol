/**
 * clampIdleReturnSeconds() is the one gate between whatever an API caller
 * sends (PATCH /devices/:id, a template's idleReturnSeconds, POST
 * /enrollments) and the `idle_return_seconds` NOT NULL column, and — via
 * update_config — the device's own auto-return timer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { clampIdleReturnSeconds, MIN_SECONDS, MAX_SECONDS, OFF } from '../src/idletimeout.js';

test('a value inside the range passes through, rounded', () => {
  assert.equal(clampIdleReturnSeconds(30), 30);
  assert.equal(clampIdleReturnSeconds(30.4), 30);
  assert.equal(clampIdleReturnSeconds(30.6), 31);
});

test('0 and negative values mean "off", not the floor', () => {
  assert.equal(clampIdleReturnSeconds(0), OFF);
  assert.equal(clampIdleReturnSeconds(-1), OFF);
  assert.equal(clampIdleReturnSeconds(-999), OFF);
});

test('a low positive value is clamped up to the floor, not rejected', () => {
  assert.equal(clampIdleReturnSeconds(1), MIN_SECONDS);
  assert.equal(clampIdleReturnSeconds(4), MIN_SECONDS);
});

test('an absurd value is clamped down to the ceiling, not stored uncapped', () => {
  assert.equal(clampIdleReturnSeconds(999999999), MAX_SECONDS);
  assert.equal(clampIdleReturnSeconds(86401), MAX_SECONDS);
});

test('missing, non-numeric, or NaN input falls back to off, never NaN', () => {
  for (const bad of [undefined, null, '', 'abc', NaN, {}, []]) {
    assert.equal(clampIdleReturnSeconds(bad), OFF, `expected ${JSON.stringify(bad)} to be off, not NaN`);
  }
});

test('a numeric string is accepted the same as a number', () => {
  assert.equal(clampIdleReturnSeconds('45'), 45);
});
