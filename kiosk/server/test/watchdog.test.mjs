import test from 'node:test';
import assert from 'node:assert/strict';
import { WATCHDOG_REASONS, validateWatchdogReportBody, summarizeCrashLoop } from '../src/watchdog.js';

test('WATCHDOG_REASONS: exactly the two reasons Watchdog.kt can report', () => {
  assert.deepEqual([...WATCHDOG_REASONS].sort(), ['anr_reboot', 'crash']);
});

test('validateWatchdogReportBody: accepts a bare valid reason with no detail', () => {
  assert.deepEqual(validateWatchdogReportBody({ reason: 'crash' }), { valid: true, reason: 'crash', detail: null });
  assert.deepEqual(validateWatchdogReportBody({ reason: 'anr_reboot' }), { valid: true, reason: 'anr_reboot', detail: null });
});

test('validateWatchdogReportBody: accepts a string detail alongside a valid reason', () => {
  const result = validateWatchdogReportBody({ reason: 'crash', detail: 'NullPointerException' });
  assert.deepEqual(result, { valid: true, reason: 'crash', detail: 'NullPointerException' });
});

test('validateWatchdogReportBody: truncates an overlong detail rather than rejecting it', () => {
  const long = 'x'.repeat(1000);
  const result = validateWatchdogReportBody({ reason: 'crash', detail: long });
  assert.equal(result.valid, true);
  assert.equal(result.detail.length, 500);
});

test('validateWatchdogReportBody: rejects anything not in WATCHDOG_REASONS', () => {
  for (const bad of [{}, { reason: 'reboot' }, { reason: '' }, { reason: null }, { reason: undefined }, null, undefined]) {
    const result = validateWatchdogReportBody(bad);
    assert.equal(result.valid, false);
    assert.equal(typeof result.error, 'string');
    assert.equal(result.error.length > 0, true);
  }
});

test('validateWatchdogReportBody: rejects a non-string detail', () => {
  for (const bad of [{ reason: 'crash', detail: 123 }, { reason: 'crash', detail: {} }, { reason: 'crash', detail: [] }]) {
    const result = validateWatchdogReportBody(bad);
    assert.equal(result.valid, false);
  }
});

test('validateWatchdogReportBody: an explicit null detail is treated as no detail, not rejected', () => {
  assert.deepEqual(validateWatchdogReportBody({ reason: 'crash', detail: null }), { valid: true, reason: 'crash', detail: null });
});

test('summarizeCrashLoop: empty input summarizes to no unstable devices', () => {
  assert.deepEqual(summarizeCrashLoop([], 3), []);
});

test('summarizeCrashLoop: a device under threshold is not flagged', () => {
  const events = [
    { device_id: 1, device_name: 'A', device_serial: 's1', detail: 'crash', created_at: '2026-08-24 10:00:00' },
    { device_id: 1, device_name: 'A', device_serial: 's1', detail: 'crash', created_at: '2026-08-24 10:01:00' },
  ];
  assert.deepEqual(summarizeCrashLoop(events, 3), []);
});

test('summarizeCrashLoop: a device at or over threshold is flagged with its count and latest event', () => {
  const events = [
    { device_id: 1, device_name: 'A', device_serial: 's1', detail: 'crash', created_at: '2026-08-24 10:00:00' },
    { device_id: 1, device_name: 'A', device_serial: 's1', detail: 'crash', created_at: '2026-08-24 10:05:00' },
    { device_id: 1, device_name: 'A', device_serial: 's1', detail: 'anr_reboot: stuck', created_at: '2026-08-24 10:10:00' },
  ];
  const result = summarizeCrashLoop(events, 3);
  assert.equal(result.length, 1);
  assert.equal(result[0].device_id, 1);
  assert.equal(result[0].count, 3);
  assert.equal(result[0].lastAt, '2026-08-24 10:10:00');
  assert.equal(result[0].lastReason, 'anr_reboot: stuck');
});

test('summarizeCrashLoop: independent of input order — the true latest event wins regardless of row order', () => {
  const events = [
    { device_id: 1, device_name: 'A', device_serial: 's1', detail: 'crash', created_at: '2026-08-24 09:00:00' },
    { device_id: 1, device_name: 'A', device_serial: 's1', detail: 'crash', created_at: '2026-08-24 11:00:00' },
    { device_id: 1, device_name: 'A', device_serial: 's1', detail: 'crash', created_at: '2026-08-24 10:00:00' },
  ];
  const result = summarizeCrashLoop(events, 3);
  assert.equal(result[0].lastAt, '2026-08-24 11:00:00');
});

test('summarizeCrashLoop: two devices tracked independently, sorted by count descending', () => {
  const events = [
    { device_id: 1, device_name: 'A', device_serial: 's1', detail: 'crash', created_at: '2026-08-24 10:00:00' },
    { device_id: 1, device_name: 'A', device_serial: 's1', detail: 'crash', created_at: '2026-08-24 10:05:00' },
    { device_id: 1, device_name: 'A', device_serial: 's1', detail: 'crash', created_at: '2026-08-24 10:10:00' },
    { device_id: 2, device_name: 'B', device_serial: 's2', detail: 'crash', created_at: '2026-08-24 10:00:00' },
    { device_id: 2, device_name: 'B', device_serial: 's2', detail: 'crash', created_at: '2026-08-24 10:05:00' },
    { device_id: 2, device_name: 'B', device_serial: 's2', detail: 'crash', created_at: '2026-08-24 10:10:00' },
    { device_id: 2, device_name: 'B', device_serial: 's2', detail: 'crash', created_at: '2026-08-24 10:15:00' },
  ];
  const result = summarizeCrashLoop(events, 3);
  assert.equal(result.length, 2);
  assert.equal(result[0].device_id, 2);
  assert.equal(result[0].count, 4);
  assert.equal(result[1].device_id, 1);
  assert.equal(result[1].count, 3);
});
