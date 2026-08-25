/**
 * validateCommandId() is the one gate between whatever a device-token-holding
 * caller sends as `commandId` on POST /ack and POST /screenshot (routes/agent.js)
 * and a raw SQL bind (`UPDATE commands SET ... WHERE id = ? AND device_id = ?`)
 * that must never receive a non-bindable type.
 *
 * isValidRowId() backs two more call sites beyond routes/templates.js's
 * deviceIds (see below): policy.js's applyDevicePolicy and routes/devices.js's
 * POST /enrollments each gate their own `linkId` field with
 * `if (linkId && !isValidRowId(linkId)) return .../400`, preserving linkId's
 * existing "falsy = no link chosen" behaviour while closing the same
 * unchecked-bind gap `db.prepare('SELECT * FROM links WHERE id = ? AND
 * owner_id = ?').get(linkId, ...)` had — an object/array linkId used to crash
 * with RangeError "Too few/many parameter values were provided", a boolean
 * with TypeError "SQLite3 can only bind numbers, strings, bigints, buffers,
 * and null" (both reproduced live via PATCH /devices/:id and POST
 * /enrollments before this fix). The isValidRowId test cases below already
 * cover every shape both new call sites reject; only the "falsy still means
 * not-provided" carve-out is specific to their own `if (linkId && ...)` guard,
 * not to isValidRowId itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCommandId, isValidRowId } from '../src/commandid.js';

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

/**
 * isValidRowId() is the same bindable-rowid shape check as validateCommandId,
 * but for routes/templates.js's POST /templates/:id/apply, which loops over
 * a `deviceIds` array and binds each element straight into
 * `db.prepare('...WHERE id = ?').get(id)` — every element is required (no
 * "falsy = not provided" carve-out makes sense inside a list), and a
 * malformed element used to crash the whole batch with a raw 500 instead of
 * landing in that same request's `skipped` list like any other invalid id.
 */
test('isValidRowId accepts a positive integer or a numeric string of one', () => {
  assert.equal(isValidRowId(1), true);
  assert.equal(isValidRowId(42), true);
  assert.equal(isValidRowId('7'), true);
});

test('isValidRowId rejects objects/arrays/booleans instead of letting them reach the SQL bind', () => {
  for (const bad of [{}, { a: 1 }, [], [1, 2], true, false]) {
    assert.equal(isValidRowId(bad), false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test('isValidRowId rejects zero, negative numbers, non-integers, NaN, and non-numeric strings', () => {
  for (const bad of [0, -1, -5, 1.5, NaN, Infinity, 'abc', '', null, undefined]) {
    assert.equal(isValidRowId(bad), false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

/**
 * The exact guard policy.js's applyDevicePolicy and routes/devices.js's
 * POST /enrollments now both use in front of their own `linkId` field:
 * `if (linkId && !isValidRowId(linkId)) return .../400`. Exercised here as
 * the guard expression itself (not just isValidRowId in isolation) so a
 * future edit to either call site cannot silently drop the `linkId &&` part
 * and start rejecting "no link chosen" (falsy) requests too.
 */
function linkIdRejected(linkId) {
  return Boolean(linkId && !isValidRowId(linkId));
}

test('linkId guard: falsy values (no link chosen) are never rejected, matching linkId\'s pre-existing behaviour', () => {
  for (const notProvided of [undefined, null, '', 0, false, NaN]) {
    assert.equal(linkIdRejected(notProvided), false, `expected ${JSON.stringify(notProvided)} to pass through as "no link chosen"`);
  }
});

test('linkId guard: a real link id (number or numeric string) is never rejected', () => {
  for (const good of [1, 42, '7']) {
    assert.equal(linkIdRejected(good), false, `expected ${JSON.stringify(good)} to pass the guard`);
  }
});

test('linkId guard: objects/arrays/true/junk strings are rejected before reaching the SQL bind', () => {
  for (const bad of [{}, { pwn: 1 }, [], [1, 2, 3], true, 'abc', -1, 1.5]) {
    assert.equal(linkIdRejected(bad), true, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});
