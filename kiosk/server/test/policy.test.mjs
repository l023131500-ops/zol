/**
 * applyDevicePolicy (policy.js) — the shared write path behind both
 * PATCH /devices/:id (a customer editing one device) and POST
 * /templates/:id/apply (KIOSK_BUILD.md §8 bulk apply). Had no direct test
 * file before this one; only templatepolicy.js's dependency-free half of the
 * same feature set was exercised for real.
 *
 * Driven against the real `better-sqlite3` driver via `src/db.js`, the same
 * shape `test/seedadmin.test.mjs` already uses, pointed at a fresh on-disk
 * scratch file per run (DB_PATH set before the first import, module-level
 * singleton) so `db.js`'s own migrations build the exact schema
 * applyDevicePolicy runs against.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kioskfleet-policy-test-'));
process.env.DB_PATH = path.join(scratchDir, 'kiosk.db');
process.env.JWT_SECRET = 'test-secret';

const { db } = await import('../src/db.js');
const { applyDevicePolicy } = await import('../src/policy.js');

function makeDevice() {
  const owner = db.prepare(`INSERT INTO users (username, password_hash, role) VALUES (?, 'x', 'user')`)
    .run(`owner_${Math.random().toString(36).slice(2)}`);
  const serial = `SER_${Math.random().toString(36).slice(2)}`;
  const dev = db.prepare(`INSERT INTO devices (owner_id, serial, device_token, name) VALUES (?, ?, ?, 'Kiosk')`)
    .run(owner.lastInsertRowid, serial, `TOK_${serial}`);
  return { uid: owner.lastInsertRowid, device: db.prepare('SELECT * FROM devices WHERE id = ?').get(dev.lastInsertRowid) };
}

test('signage: editing only the playlist keeps signage enabled', () => {
  const { uid, device } = makeDevice();
  const r1 = applyDevicePolicy(device, { signageEnabled: true, signageUrls: 'https://a.example.com', signageIntervalSeconds: 10 }, uid, null);
  assert.equal(r1.ok, true);
  assert.equal(r1.device.signage_enabled, 1);

  const r2 = applyDevicePolicy(r1.device, { signageUrls: 'https://a.example.com\nhttps://b.example.com' }, uid, null);
  assert.equal(r2.ok, true);
  assert.equal(r2.device.signage_enabled, 1, 'playlist-only edit must not silently disable signage');
  assert.match(r2.device.signage_urls, /b\.example\.com/);
});

test('signage: editing only the interval keeps signage enabled', () => {
  const { uid, device } = makeDevice();
  const r1 = applyDevicePolicy(device, { signageEnabled: true, signageUrls: 'https://a.example.com', signageIntervalSeconds: 10 }, uid, null);
  const r2 = applyDevicePolicy(r1.device, { signageIntervalSeconds: 20 }, uid, null);
  assert.equal(r2.ok, true);
  assert.equal(r2.device.signage_enabled, 1, 'interval-only edit must not silently disable signage');
  assert.equal(r2.device.signage_interval_seconds, 20);
});

test('signage: an explicit signageEnabled=false still disables it', () => {
  const { uid, device } = makeDevice();
  const r1 = applyDevicePolicy(device, { signageEnabled: true, signageUrls: 'https://a.example.com' }, uid, null);
  const r2 = applyDevicePolicy(r1.device, { signageEnabled: false }, uid, null);
  assert.equal(r2.ok, true);
  assert.equal(r2.device.signage_enabled, 0);
});

test('signage: re-enabling with an invalid playlist is still rejected', () => {
  const { uid, device } = makeDevice();
  const r1 = applyDevicePolicy(device, { signageEnabled: true, signageUrls: 'https://a.example.com' }, uid, null);
  const r2 = applyDevicePolicy(r1.device, { signageEnabled: false }, uid, null);
  const r3 = applyDevicePolicy(r2.device, { signageEnabled: true, signageUrls: 'not-a-url' }, uid, null);
  assert.equal(r3.ok, false);
});

test('schedule: editing only the open time keeps the schedule enabled', () => {
  const { uid, device } = makeDevice();
  const r1 = applyDevicePolicy(device, { scheduleEnabled: true, scheduleOpenTime: '08:00', scheduleCloseTime: '20:00' }, uid, null);
  assert.equal(r1.ok, true);
  assert.equal(r1.device.schedule_enabled, 1);

  const r2 = applyDevicePolicy(r1.device, { scheduleOpenTime: '09:00' }, uid, null);
  assert.equal(r2.ok, true);
  assert.equal(r2.device.schedule_enabled, 1, 'open-time-only edit must not silently disable the schedule');
  assert.equal(r2.device.schedule_open_time, '09:00');
});

test('schedule: an explicit scheduleEnabled=false still disables it', () => {
  const { uid, device } = makeDevice();
  const r1 = applyDevicePolicy(device, { scheduleEnabled: true, scheduleOpenTime: '08:00', scheduleCloseTime: '20:00' }, uid, null);
  const r2 = applyDevicePolicy(r1.device, { scheduleEnabled: false }, uid, null);
  assert.equal(r2.ok, true);
  assert.equal(r2.device.schedule_enabled, 0);
});

test('maintenance: editing only the message keeps maintenance mode enabled', () => {
  const { uid, device } = makeDevice();
  const r1 = applyDevicePolicy(device, { maintenanceEnabled: true, maintenanceMessage: 'בתחזוקה' }, uid, null);
  assert.equal(r1.ok, true);
  assert.equal(r1.device.maintenance_enabled, 1);

  const r2 = applyDevicePolicy(r1.device, { maintenanceMessage: 'עוד מעט חוזרים' }, uid, null);
  assert.equal(r2.ok, true);
  assert.equal(r2.device.maintenance_enabled, 1, 'message-only edit must not silently disable maintenance mode');
  assert.equal(r2.device.maintenance_message, 'עוד מעט חוזרים');
});

test('maintenance: an explicit maintenanceEnabled=false still disables it', () => {
  const { uid, device } = makeDevice();
  const r1 = applyDevicePolicy(device, { maintenanceEnabled: true, maintenanceMessage: 'בתחזוקה' }, uid, null);
  const r2 = applyDevicePolicy(r1.device, { maintenanceEnabled: false }, uid, null);
  assert.equal(r2.ok, true);
  assert.equal(r2.device.maintenance_enabled, 0);
});
