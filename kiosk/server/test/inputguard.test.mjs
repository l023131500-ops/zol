/**
 * The one guard every write route now passes through before its handler
 * runs. Tested here as a plain function (fake req/res, no express, no db —
 * same reasoning as hosts.test.mjs) against the exact shapes that crash live
 * today (see inputguard.js's own header comment for the reproduction): an
 * object, an array, or (for id-like fields) a boolean landing where a scalar
 * was expected.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { guardWriteBody, isScalar, isValidRowId, checkFlatFields } from '../src/inputguard.js';

function run(body) {
  const req = { body };
  let statusCode = null;
  let jsonBody = null;
  let calledNext = false;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { jsonBody = payload; return this; },
  };
  guardWriteBody(req, res, () => { calledNext = true; });
  return { calledNext, statusCode, jsonBody };
}

test('isScalar accepts string/number/boolean/null/undefined only', () => {
  assert.equal(isScalar('x'), true);
  assert.equal(isScalar(1), true);
  assert.equal(isScalar(true), true);
  assert.equal(isScalar(null), true);
  assert.equal(isScalar(undefined), true);
  assert.equal(isScalar({}), false);
  assert.equal(isScalar([]), false);
});

test('isValidRowId accepts a positive integer or numeric string, nothing else', () => {
  assert.equal(isValidRowId(1), true);
  assert.equal(isValidRowId('7'), true);
  assert.equal(isValidRowId(' 7 '), true);
  assert.equal(isValidRowId(0), false);
  assert.equal(isValidRowId(-1), false);
  assert.equal(isValidRowId(1.5), false);
  assert.equal(isValidRowId('abc'), false);
  assert.equal(isValidRowId(true), false);
  assert.equal(isValidRowId({}), false);
  assert.equal(isValidRowId([1]), false);
});

test('a normal scalar body (name/idleReturnSeconds/scheduleEnabled-shaped) passes through', () => {
  const { calledNext, statusCode } = run({ name: 'Kiosk 1', idleReturnSeconds: 30, scheduleEnabled: true, exitCode: null });
  assert.equal(calledNext, true);
  assert.equal(statusCode, null);
});

test('a missing/empty body passes through (GET-style requests, required-field checks stay the route\'s job)', () => {
  assert.equal(run(undefined).calledNext, true);
  assert.equal(run({}).calledNext, true);
});

test('an object where a scalar field was expected — the live PATCH /devices/:id {"name":{"evil":true}} 500 — is rejected with 400', () => {
  const { calledNext, statusCode, jsonBody } = run({ name: { evil: true } });
  assert.equal(calledNext, false);
  assert.equal(statusCode, 400);
  assert.match(jsonBody.error, /name/);
});

test('linkId as a boolean — the live PATCH /devices/:id {"linkId":true} 500 — is rejected', () => {
  assert.equal(run({ linkId: true }).statusCode, 400);
});

test('an object/array where a scalar id was expected (linkId/commandId) is rejected', () => {
  assert.equal(run({ linkId: { foo: 1 } }).statusCode, 400);
  assert.equal(run({ commandId: [1, 2, 3] }).statusCode, 400);
});

test('a falsy linkId/commandId (0, "", false) passes through — the route\'s own truthy gate already treats it as "not provided"', () => {
  assert.equal(run({ linkId: '' }).calledNext, true);
  assert.equal(run({ linkId: 0 }).calledNext, true);
  assert.equal(run({ commandId: false }).calledNext, true);
});

test('a numeric-string or number linkId/commandId passes through', () => {
  assert.equal(run({ linkId: '42' }).calledNext, true);
  assert.equal(run({ commandId: 7 }).calledNext, true);
});

test('POST /devices/:id/command payload is exempted at the top level — it is JSON.stringified, never bound raw', () => {
  assert.equal(run({ type: 'set_url', payload: { url: 'https://example.com' } }).calledNext, true);
});

test('POST /templates/:id/apply deviceIds is exempted at the top level — routes/templates.js validates each element itself', () => {
  assert.equal(run({ deviceIds: [1, 2, 3] }).calledNext, true);
  // The top-level guard alone would NOT catch a bad element inside the array
  // — that is exactly why routes/templates.js calls isValidRowId per element.
  assert.equal(run({ deviceIds: [1, { evil: true }] }).calledNext, true);
});

test('checkFlatFields (the per-element check routes/templates.js runs on deviceIds) rejects what guardWriteBody would', () => {
  assert.deepEqual(checkFlatFields({ idleReturnSeconds: 30 }), { ok: true });
  assert.equal(checkFlatFields({ name: { evil: true } }).ok, false);
  assert.match(checkFlatFields({ name: { evil: true } }).error, /name/);
  assert.equal(checkFlatFields(null).ok, true);
  assert.equal(checkFlatFields('not an object').ok, true);
});

test('a top-level array body is walked element-by-element, not skipped', () => {
  assert.equal(run(['a', 'b', 1]).calledNext, true);
  assert.equal(run(['a', { bad: 1 }]).statusCode, 400);
});
