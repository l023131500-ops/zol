/**
 * clampIdleReturnSeconds() is the shared gate policy.js (PATCH
 * /devices/:id) and templatepolicy.js (bulk template apply) both write
 * idle_return_seconds through — see idletimeout.js's header for the two
 * pre-existing bugs (an unguarded NaN in policy.js, no upper bound in
 * either) this closes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { clampIdleReturnSeconds, MIN_NONZERO_SECONDS, MAX_SECONDS, DEFAULT_SECONDS } from '../src/idletimeout.js';

test('0 and negative values are "off", not the floor', () => {
  assert.equal(clampIdleReturnSeconds(0), 0);
  assert.equal(clampIdleReturnSeconds(-5), 0);
  assert.equal(clampIdleReturnSeconds(-1), 0);
});

test('a value inside the range passes through, rounded', () => {
  assert.equal(clampIdleReturnSeconds(30), 30);
  assert.equal(clampIdleReturnSeconds(30.4), 30);
  assert.equal(clampIdleReturnSeconds(30.6), 31);
});

test('a small positive value below the nonzero floor is clamped up to it, not to 0', () => {
  assert.equal(clampIdleReturnSeconds(1), MIN_NONZERO_SECONDS);
  assert.equal(clampIdleReturnSeconds(4), MIN_NONZERO_SECONDS);
});

test('above the ceiling is clamped down to it', () => {
  assert.equal(clampIdleReturnSeconds(999999999), MAX_SECONDS);
  assert.equal(clampIdleReturnSeconds(MAX_SECONDS + 1), MAX_SECONDS);
});

test('missing, non-numeric, or NaN input falls back to the default, not a throw', () => {
  for (const bad of [undefined, null, '', 'abc', NaN, {}, []]) {
    assert.equal(clampIdleReturnSeconds(bad), DEFAULT_SECONDS, `expected ${JSON.stringify(bad)} to default`);
  }
});

test('a numeric string is accepted the same as a number', () => {
  assert.equal(clampIdleReturnSeconds('45'), 45);
});
