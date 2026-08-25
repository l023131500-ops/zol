/**
 * validateCommandId() is the one gate between whatever a device-token-holding
 * caller sends as `commandId` on POST /ack and POST /screenshot (routes/agent.js)
 * and a raw SQL bind (`UPDATE commands SET ... WHERE id = ? AND device_id = ?`)
 * that must never receive a non-bindable type.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCommandId } from '../src/commandid.js';

test('a positive integer passes through unchanged', () => {
  assert.deepEqual(validateCommandId(1), { ok: true, value: 1 });
  assert.deepEqual(validateCommandId(42), { ok: true, value: 42 });
});

test('a numeric string is accepted and coerced to a number', () => {
  assert.deepEqual(validateCommandId('7'), { ok: true, value: 7 });
});

test('falsy input (not provided) is treated as "no commandId", not rejected', () => {
  // NaN is falsy too (`!NaN === true`), so it takes the same "not provided"
  // path as 0/''/null/undefined — matching the truthy gate both call sites
  // already used before this fix (`if (commandId) { ... }`).
  for (const missing of [undefined, null, '', 0, NaN]) {
    assert.deepEqual(validateCommandId(missing), { ok: true, value: undefined }, `expected ${JSON.stringify(missing)} to be treated as not-provided`);
  }
});

test('objects/arrays/booleans are rejected with a clean error, never reach the SQL bind', () => {
  for (const bad of [{}, { a: 1 }, [], [1, 2], true]) {
    const result = validateCommandId(bad);
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
    assert.equal(typeof result.error, 'string');
  }
});

test('non-numeric strings, negative numbers, and non-integers are rejected', () => {
  for (const bad of ['abc', -1, -5, 1.5, Infinity]) {
    const result = validateCommandId(bad);
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});
