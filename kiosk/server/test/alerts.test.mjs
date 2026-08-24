import test from 'node:test';
import assert from 'node:assert/strict';
import { isSuspiciousExitAttempt, validateExitAttemptBody, summarizeAlerts } from '../src/alerts.js';

test('isSuspiciousExitAttempt: only a wrong-code attempt is suspicious', () => {
  assert.equal(isSuspiciousExitAttempt('wrong_code'), true);
  assert.equal(isSuspiciousExitAttempt('correct_code'), false);
  assert.equal(isSuspiciousExitAttempt(''), false);
  assert.equal(isSuspiciousExitAttempt(null), false);
  assert.equal(isSuspiciousExitAttempt(undefined), false);
});

test('validateExitAttemptBody: accepts a literal boolean ok', () => {
  assert.deepEqual(validateExitAttemptBody({ ok: true }), { valid: true, ok: true });
  assert.deepEqual(validateExitAttemptBody({ ok: false }), { valid: true, ok: false });
});

test('validateExitAttemptBody: rejects anything that is not a literal boolean', () => {
  for (const bad of [{}, { ok: 'true' }, { ok: 1 }, { ok: 0 }, { ok: null }, { ok: undefined }, null, undefined]) {
    const result = validateExitAttemptBody(bad);
    assert.equal(result.valid, false);
    assert.equal(typeof result.error, 'string');
    assert.equal(result.error.length > 0, true);
  }
});

test('summarizeAlerts: counts each list and the suspicious-only exit-attempt subset', () => {
  const summary = summarizeAlerts({
    offlineDevices: [{ id: 1 }, { id: 2 }],
    lowBatteryDevices: [{ id: 3 }],
    exitAttempts: [
      { detail: 'wrong_code' },
      { detail: 'wrong_code' },
      { detail: 'correct_code' },
    ],
  });
  assert.equal(summary.offlineCount, 2);
  assert.equal(summary.lowBatteryCount, 1);
  assert.equal(summary.exitAttemptCount, 3);
  assert.equal(summary.suspiciousExitAttemptCount, 2);
  // total = offline + lowBattery + suspicious exit attempts only — a pile of
  // successful, authorized unlocks must not inflate the badge.
  assert.equal(summary.total, 5);
});

test('summarizeAlerts: an empty alert set summarizes to all zeros, not undefined/NaN', () => {
  const summary = summarizeAlerts({ offlineDevices: [], lowBatteryDevices: [], exitAttempts: [] });
  assert.deepEqual(summary, {
    offlineCount: 0, lowBatteryCount: 0, exitAttemptCount: 0,
    suspiciousExitAttemptCount: 0, crashLoopCount: 0, total: 0,
  });
});

test('summarizeAlerts: crashLoopDevices (KIOSK_BUILD.md §0/§8 watchdog) adds to the count and total', () => {
  const summary = summarizeAlerts({
    offlineDevices: [], lowBatteryDevices: [], exitAttempts: [],
    crashLoopDevices: [{ device_id: 1 }, { device_id: 2 }],
  });
  assert.equal(summary.crashLoopCount, 2);
  assert.equal(summary.total, 2);
});
