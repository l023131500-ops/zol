// KIOSK_BUILD.md §9 "התראות: מכשיר אופליין מעל X, סוללה נמוכה, ניסיון יציאה
// מהקיוסק" — was entirely unbuilt. The three conditions themselves are plain
// SQL (routes/alerts.js mirrors the exact WHERE-clause shape index.js's own
// offline sweep already uses, rather than re-parsing SQLite's
// datetime('now') strings in JS), so this module holds only the logic that
// has no natural home in a query: classifying an exit-attempt event and
// summarizing a fetched alert set. Kept dependency-free like
// hosts.js/schedule.js/signage.js/display.js/exitcode.js/clients.js/
// templatepolicy.js so it unit-tests in a sandbox with no better-sqlite3
// installed.

/**
 * A "wrong_code" exit attempt means someone at the device guessed and
 * failed — the suspicious case §9 means by "ניסיון יציאה". A "correct_code"
 * entry is a successful, authorized admin unlock (already visible in the
 * per-device activity log) and is not itself alert-worthy, but is still
 * reported by the device and returned alongside so the console can show the
 * full picture rather than only the failures.
 */
export function isSuspiciousExitAttempt(detail) {
  return detail === 'wrong_code';
}

/**
 * Validate the body of POST /api/agent/exit-attempt: { ok: boolean }.
 * `ok` has to be a literal boolean — a device reporting a malformed body
 * must not silently log a wrong-code attempt as a correct one (or vice
 * versa) from some other truthy/falsy value coerced into meaning something
 * it didn't.
 */
export function validateExitAttemptBody(body) {
  const ok = body?.ok;
  if (typeof ok !== 'boolean') return { valid: false, error: 'ok (boolean) נדרש' };
  return { valid: true, ok };
}

/**
 * Counts for the console's alerts badge/summary. `crashLoopDevices` is
 * optional (defaults to none) so callers built before KIOSK_BUILD.md §0/§8's
 * watchdog feature keep working unchanged — it is a `summarizeCrashLoop()`
 * (watchdog.js) result, already deduped to one entry per unstable device, so
 * its length is added to the total the same way the other three conditions
 * are: once per device that triggers it.
 */
export function summarizeAlerts({ offlineDevices, lowBatteryDevices, exitAttempts, crashLoopDevices = [] }) {
  const suspiciousExitAttemptCount = exitAttempts.filter((e) => isSuspiciousExitAttempt(e.detail)).length;
  return {
    offlineCount: offlineDevices.length,
    lowBatteryCount: lowBatteryDevices.length,
    exitAttemptCount: exitAttempts.length,
    suspiciousExitAttemptCount,
    crashLoopCount: crashLoopDevices.length,
    // The badge total counts each device once per condition it triggers (an
    // offline low-battery device is two real facts an owner should see), and
    // only the suspicious exit attempts — a pile of successful, authorized
    // unlocks should not itself look like a problem.
    total: offlineDevices.length + lowBatteryDevices.length + suspiciousExitAttemptCount + crashLoopDevices.length,
  };
}
