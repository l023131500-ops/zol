/**
 * payment.js validates the §7 per-device payment-input-mode field
 * (KIOSK_BUILD.md §7 "תשלום ואמצעי קלט (3 אופציות)"). No database
 * dependency, so it is exercised for real, the same shape
 * schedule.js/signage.js/display.js/exitcode.js/maintenance.js already use.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PAYMENT_MODES, PAYMENT_MODE_INFO, validatePaymentMode } from '../src/payment.js';

test('validatePaymentMode defaults null/undefined/empty to "none"', () => {
  assert.deepEqual(validatePaymentMode(null), { ok: true, value: 'none' });
  assert.deepEqual(validatePaymentMode(undefined), { ok: true, value: 'none' });
  assert.deepEqual(validatePaymentMode(''), { ok: true, value: 'none' });
});

test('validatePaymentMode accepts each of the spec\'s three options plus none', () => {
  for (const mode of PAYMENT_MODES) {
    assert.deepEqual(validatePaymentMode(mode), { ok: true, value: mode });
  }
});

test('validatePaymentMode is case-insensitive and trims whitespace', () => {
  assert.deepEqual(validatePaymentMode('  MANUAL  '), { ok: true, value: 'manual' });
  assert.deepEqual(validatePaymentMode('Card_Reader'), { ok: true, value: 'card_reader' });
  assert.deepEqual(validatePaymentMode('EMV'), { ok: true, value: 'emv' });
});

test('validatePaymentMode rejects anything outside the four known values', () => {
  assert.match(validatePaymentMode('paypal').error, /לא נתמך/);
  assert.match(validatePaymentMode('cardReader').error, /לא נתמך/);
  assert.match(validatePaymentMode(42).error, /לא נתמך/);
});

test('PAYMENT_MODE_INFO has a label for every mode and a note for every paid mode', () => {
  for (const mode of PAYMENT_MODES) {
    assert.ok(PAYMENT_MODE_INFO[mode], `missing info for ${mode}`);
    assert.ok(PAYMENT_MODE_INFO[mode].label);
  }
  assert.equal(PAYMENT_MODE_INFO.none.note, undefined);
  for (const mode of ['manual', 'card_reader', 'emv']) {
    assert.ok(PAYMENT_MODE_INFO[mode].note, `missing note for ${mode}`);
  }
});
