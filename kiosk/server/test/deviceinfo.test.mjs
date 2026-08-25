import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSerial, sanitizeDeviceInfo } from '../src/deviceinfo.js';

test('validateSerial: accepts a normal string serial, trimmed', () => {
  assert.deepEqual(validateSerial('  ABC123  '), { ok: true, value: 'ABC123' });
});

test('validateSerial: accepts a number by coercing to string (JSON body can carry either)', () => {
  assert.deepEqual(validateSerial(12345), { ok: true, value: '12345' });
});

test('validateSerial: rejects empty/whitespace-only serial', () => {
  for (const bad of ['', '   ']) {
    const result = validateSerial(bad);
    assert.equal(result.ok, false);
  }
});

test('validateSerial: rejects non-string/non-number types instead of letting them reach .slice()', () => {
  for (const bad of [{}, [], true, null, undefined]) {
    const result = validateSerial(bad);
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
  }
});

test('validateSerial: rejects a serial over the length cap', () => {
  const result = validateSerial('x'.repeat(200));
  assert.equal(result.ok, false);
});

test('validateSerial: accepts a serial exactly at the length cap', () => {
  const result = validateSerial('x'.repeat(128));
  assert.equal(result.ok, true);
  assert.equal(result.value.length, 128);
});

test('sanitizeDeviceInfo: null/undefined/empty become null', () => {
  for (const v of [null, undefined, '', '   ']) {
    assert.equal(sanitizeDeviceInfo(v), null);
  }
});

test('sanitizeDeviceInfo: a normal string passes through trimmed', () => {
  assert.equal(sanitizeDeviceInfo('  Pixel 7  '), 'Pixel 7');
});

test('sanitizeDeviceInfo: truncates an overlong value rather than rejecting it', () => {
  const long = 'x'.repeat(5000);
  const result = sanitizeDeviceInfo(long);
  assert.equal(result.length, 100);
});

test('sanitizeDeviceInfo: coerces numbers/booleans instead of dropping them', () => {
  assert.equal(sanitizeDeviceInfo(14), '14');
  assert.equal(sanitizeDeviceInfo(true), 'true');
});

test('sanitizeDeviceInfo: objects/arrays are dropped to null, not stringified', () => {
  assert.equal(sanitizeDeviceInfo({}), null);
  assert.equal(sanitizeDeviceInfo([1, 2]), null);
});
