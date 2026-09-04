import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessions, summarizeAnalytics } from '../src/analytics.js';

test('buildSessions: an empty list produces no sessions', () => {
  assert.deepEqual(buildSessions([]), []);
});

test('buildSessions: a single event for a device is ongoing (durationMs null)', () => {
  const sessions = buildSessions([{ deviceId: 1, code: 'A', name: 'Client A', atMs: 1000 }]);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].durationMs, null);
});

test('buildSessions: consecutive events on the same device measure the gap between them, leaving the last one ongoing', () => {
  const sessions = buildSessions([
    { deviceId: 1, code: 'A', name: 'Client A', atMs: 1000 },
    { deviceId: 1, code: 'B', name: 'Client B', atMs: 5000 },
    { deviceId: 1, code: 'A', name: 'Client A', atMs: 8000 },
  ]);
  assert.equal(sessions[0].durationMs, 4000);
  assert.equal(sessions[1].durationMs, 3000);
  assert.equal(sessions[2].durationMs, null);
});

test('buildSessions: two devices interleaved in time are paired independently, not against each other', () => {
  const sessions = buildSessions([
    { deviceId: 1, code: 'A', name: 'Client A', atMs: 1000 },
    { deviceId: 2, code: 'C', name: 'Client C', atMs: 1500 },
    { deviceId: 1, code: 'B', name: 'Client B', atMs: 6000 },
    { deviceId: 2, code: 'D', name: 'Client D', atMs: 9500 },
  ]);
  // device 1: A -> B is 5000ms; device 2: C -> D is 8000ms, not 8500/4500.
  assert.equal(sessions[0].durationMs, 5000);
  assert.equal(sessions[1].durationMs, 8000);
  assert.equal(sessions[2].durationMs, null);
  assert.equal(sessions[3].durationMs, null);
});

test('summarizeAnalytics: an empty session list summarizes to zero/null, not undefined/NaN', () => {
  const summary = summarizeAnalytics([]);
  assert.deepEqual(summary, { totalSwitches: 0, overallAvgSeconds: null, byClient: [] });
});

test('summarizeAnalytics: a single ongoing session counts as a usage but has no average yet', () => {
  const summary = summarizeAnalytics(buildSessions([{ deviceId: 1, code: 'A', name: 'Client A', atMs: 1000 }]));
  assert.equal(summary.totalSwitches, 1);
  assert.equal(summary.overallAvgSeconds, null);
  assert.deepEqual(summary.byClient, [{ code: 'A', name: 'Client A', count: 1, avgSeconds: null }]);
});

test('summarizeAnalytics: counts usages per client, ranks by popularity, and averages only completed sessions', () => {
  const sessions = buildSessions([
    { deviceId: 1, code: 'A', name: 'Client A', atMs: 0 },
    { deviceId: 1, code: 'B', name: 'Client B', atMs: 10_000 }, // A's session: 10s
    { deviceId: 1, code: 'A', name: 'Client A', atMs: 40_000 }, // B's session: 30s
    { deviceId: 2, code: 'A', name: 'Client A', atMs: 100_000 },
    { deviceId: 2, code: 'A', name: 'Client A', atMs: 130_000 }, // A's session: 30s
    // only the *last* event on each device (A on device 1 at 40s, A on
    // device 2 at 130s) is ongoing/unmeasured.
  ]);
  const summary = summarizeAnalytics(sessions);
  assert.equal(summary.totalSwitches, 5);
  // A: 4 switches (device 1 twice, device 2 twice), completed sessions 10s
  // and 30s -> avg 20s. B: 1 switch, its one session completed at 30s.
  assert.deepEqual(summary.byClient, [
    { code: 'A', name: 'Client A', count: 4, avgSeconds: 20 },
    { code: 'B', name: 'Client B', count: 1, avgSeconds: 30 },
  ]);
  // overall average is over all three completed sessions (10s, 30s, 30s) =
  // 23.33s rounded to 23s, not diluted by the two still-ongoing ones.
  assert.equal(summary.overallAvgSeconds, 23);
});

test('summarizeAnalytics: a renamed client is reported under its most recent name', () => {
  const sessions = buildSessions([
    { deviceId: 1, code: 'A', name: 'Old Name', atMs: 0 },
    { deviceId: 1, code: 'A', name: 'New Name', atMs: 5000 },
  ]);
  const summary = summarizeAnalytics(sessions);
  assert.equal(summary.byClient[0].name, 'New Name');
  assert.equal(summary.byClient[0].count, 2);
});
