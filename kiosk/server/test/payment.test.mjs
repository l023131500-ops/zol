/**
 * validatePaymentMode() is the one gate between whatever an API caller sends
 * and the payment_mode a device is told to configure (KIOSK_BUILD.md §7).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePaymentMode, PAYMENT_MODES, DEFAULT_PAYMENT_MODE } from '../src/payment.js';

test('undefined means "no change", not "reset to default"', () => {
  const r = validatePaymentMode(undefined);
  assert.equal(r.ok, true);
  assert.equal(r.changed, false);
  assert.equal('value' in r, false);
});

test('each of the 3 approved modes plus "none" is accepted', () => {
  for (const mode of PAYMENT_MODES) {
    const r = validatePaymentMode(mode);
    assert.equal(r.ok, true);
    assert.equal(r.changed, true);
    assert.equal(r.value, mode);
  }
});

test('exactly 4 modes are recognized — the locked spec, not an open enum', () => {
  assert.deepEqual([...PAYMENT_MODES].sort(), ['emv_terminal', 'manual', 'none', 'reader_prefill']);
});

test('the banned 4th shape (a raw-PAN-typing HID reader) is rejected like any other unknown string', () => {
  const r = validatePaymentMode('hid_magstripe');
  assert.equal(r.ok, false);
  assert.match(r.error, /לא נתמך/);
});

test('non-string and empty values are rejected, not silently defaulted', () => {
  for (const bad of [123, true, {}, [], null, '']) {
    const r = validatePaymentMode(bad);
    assert.equal(r.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test('DEFAULT_PAYMENT_MODE is itself a valid mode', () => {
  assert.equal(PAYMENT_MODES.has(DEFAULT_PAYMENT_MODE), true);
});
