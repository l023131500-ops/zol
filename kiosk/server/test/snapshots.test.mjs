/**
 * snapshots.js decides which policy fields get backed up, when, and how a
 * saved row restores back onto a device — the source of truth for
 * KIOSK_BUILD.md §9 "גיבוי/שחזור מדיניות". No database dependency, so it is
 * exercised for real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAPSHOT_COLUMNS, MAX_SNAPSHOTS_PER_DEVICE,
  snapshotFieldsFromDevice, policyFieldsPresent, patchFromSnapshot,
} from '../src/snapshots.js';

test('SNAPSHOT_COLUMNS excludes name (a snapshot is not a named preset)', () => {
  assert.equal(SNAPSHOT_COLUMNS.includes('name'), false);
  assert.ok(SNAPSHOT_COLUMNS.includes('home_url'));
  assert.ok(SNAPSHOT_COLUMNS.includes('signage_interval_seconds'));
});

test('MAX_SNAPSHOTS_PER_DEVICE is a small positive cap', () => {
  assert.ok(MAX_SNAPSHOTS_PER_DEVICE > 0 && MAX_SNAPSHOTS_PER_DEVICE <= 100);
});

test('snapshotFieldsFromDevice extracts exactly the policy subset, nothing else', () => {
  const device = {
    id: 1, name: 'should not leak', owner_id: 9, device_token: 'secret',
    home_url: 'https://a.example/', allowed_host: 'a.example',
    idle_return_seconds: 30, exit_code: '4321', display_zoom_percent: 150,
    schedule_enabled: 1, schedule_open_time: '09:00', schedule_close_time: '21:00',
    signage_enabled: 0, signage_urls: null, signage_interval_seconds: 15,
    maintenance_enabled: 1, maintenance_message: 'בתחזוקה עד 14:00',
    payment_mode: 'reader_prefill',
  };
  const fields = snapshotFieldsFromDevice(device);
  assert.deepEqual(Object.keys(fields).sort(), [...SNAPSHOT_COLUMNS].sort());
  assert.equal(fields.home_url, 'https://a.example/');
  assert.equal(fields.exit_code, '4321');
  assert.equal(fields.display_zoom_percent, 150);
  assert.equal(fields.maintenance_enabled, 1);
  assert.equal(fields.maintenance_message, 'בתחזוקה עד 14:00');
  assert.equal(fields.payment_mode, 'reader_prefill');
  assert.equal('name' in fields, false);
  assert.equal('device_token' in fields, false);
});

test('policyFieldsPresent is true when any policy-affecting key is present', () => {
  assert.equal(policyFieldsPresent({ homeUrl: 'https://x.example/' }), true);
  assert.equal(policyFieldsPresent({ exitCode: '' }), true); // '' is a real "clear" value, still present
  assert.equal(policyFieldsPresent({ scheduleEnabled: false }), true);
  assert.equal(policyFieldsPresent({ maintenanceEnabled: true }), true);
});

test('policyFieldsPresent is false for a name-only or empty body', () => {
  assert.equal(policyFieldsPresent({ name: 'new nickname' }), false);
  assert.equal(policyFieldsPresent({}), false);
  assert.equal(policyFieldsPresent(null), false);
  assert.equal(policyFieldsPresent(undefined), false);
});

test('patchFromSnapshot restores every captured field, mirroring a template row for the shared columns', () => {
  const snapshotRow = {
    id: 7, device_id: 3, reason: 'לפני עריכה ידנית',
    home_url: 'https://b.example/', allowed_host: 'b.example',
    idle_return_seconds: 0, exit_code: '9876', display_zoom_percent: 100,
    schedule_enabled: 0, schedule_open_time: null, schedule_close_time: null,
    signage_enabled: 1, signage_urls: 'https://b.example/promo', signage_interval_seconds: 20,
    maintenance_enabled: 1, maintenance_message: 'בתחזוקה',
    payment_mode: 'manual',
  };
  const patch = patchFromSnapshot(snapshotRow);
  assert.equal(patch.homeUrl, 'https://b.example/');
  assert.equal(patch.allowedHost, 'b.example');
  assert.equal(patch.idleReturnSeconds, 0);
  assert.equal(patch.exitCode, '9876');
  assert.equal(patch.displayZoomPercent, 100);
  assert.equal(patch.scheduleEnabled, false);
  assert.equal(patch.signageEnabled, true);
  assert.equal(patch.signageUrls, 'https://b.example/promo');
  assert.equal(patch.signageIntervalSeconds, 20);
  assert.equal(patch.maintenanceEnabled, true);
  assert.equal(patch.maintenanceMessage, 'בתחזוקה');
  assert.equal(patch.paymentMode, 'manual');
});

test('patchFromSnapshot clears exit_code on restore when the snapshot captured "unset" (NULL) — the gap templatepolicy.js\'s row mapper would miss', () => {
  const snapshotRow = {
    id: 8, device_id: 3, reason: 'לפני עריכה ידנית',
    home_url: 'https://b.example/', allowed_host: 'b.example',
    idle_return_seconds: 0, exit_code: null, display_zoom_percent: 100,
    schedule_enabled: 0, schedule_open_time: null, schedule_close_time: null,
    signage_enabled: 0, signage_urls: null, signage_interval_seconds: 15,
  };
  const patch = patchFromSnapshot(snapshotRow);
  // '' is exitcode.js's own "clear the code" value, not "leave it alone" —
  // if this were `undefined` (templatepolicy.js's plain behaviour for a
  // NULL column), a code the device gained after the snapshot was taken
  // would survive a restore that is supposed to erase it.
  assert.equal(patch.exitCode, '');
  assert.equal('exitCode' in patch, true);
});
