/**
 * maintenance.js validates the optional customer-facing message shown on a
 * device's remote-maintenance screen (KIOSK_BUILD.md §9 "מצב תחזוקה מרחוק").
 * No database dependency, so it is exercised for real, the same shape
 * schedule.js/signage.js/display.js/exitcode.js already use.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMaintenanceMessage } from '../src/maintenance.js';

test('validateMaintenanceMessage accepts null/undefined/empty as "no custom message"', () => {
  assert.deepEqual(validateMaintenanceMessage(null), { ok: true, value: null });
  assert.deepEqual(validateMaintenanceMessage(undefined), { ok: true, value: null });
  assert.deepEqual(validateMaintenanceMessage(''), { ok: true, value: null });
});

test('validateMaintenanceMessage trims and treats whitespace-only as empty', () => {
  assert.deepEqual(validateMaintenanceMessage('   '), { ok: true, value: null });
  assert.deepEqual(validateMaintenanceMessage('  נחזור בקרוב  '), { ok: true, value: 'נחזור בקרוב' });
});

test('validateMaintenanceMessage rejects a non-string', () => {
  assert.match(validateMaintenanceMessage(42).error, /טקסט/);
  assert.match(validateMaintenanceMessage({}).error, /טקסט/);
});

test('validateMaintenanceMessage caps length at 200 characters', () => {
  const ok = 'א'.repeat(200);
  assert.deepEqual(validateMaintenanceMessage(ok), { ok: true, value: ok });
  const tooLong = 'א'.repeat(201);
  assert.match(validateMaintenanceMessage(tooLong).error, /ארוכה מדי/);
});
