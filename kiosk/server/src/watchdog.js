// KIOSK_BUILD.md §0 "התאוששות אוטומטית מכל תקלה (watchdog)" / §8 "Watchdog:
// אם האפליקציה קורסת/נסגרת → מופעלת מחדש אוטומטית; אם המסך תקוע → אתחול" —
// was entirely unbuilt: nothing about a crash or a frozen-main-thread reboot
// ever reached the server, so an owner had no way to notice a kiosk was
// crash-looping short of opening its per-device activity log and reading
// through raw rows. Kept dependency-free like
// alerts.js/hosts.js/schedule.js/templatepolicy.js/clients.js so it
// unit-tests in a sandbox with no better-sqlite3 installed.

export const WATCHDOG_REASONS = new Set(['crash', 'anr_reboot']);
const MAX_DETAIL_LENGTH = 500;

/**
 * Validate the body of POST /api/agent/watchdog-report: { reason, detail? }.
 * `reason` must be one of the two the device's own Watchdog.kt can actually
 * report — anything else would let a malformed/forged report inject an
 * arbitrary event label into the per-device activity log and console, the
 * same reasoning validateExitAttemptBody already applies to `ok`.
 */
export function validateWatchdogReportBody(body) {
  const reason = body?.reason;
  if (!WATCHDOG_REASONS.has(reason)) {
    return { valid: false, error: `reason חייב להיות אחד מ: ${[...WATCHDOG_REASONS].join(', ')}` };
  }
  const detail = body?.detail;
  if (detail !== undefined && detail !== null && typeof detail !== 'string') {
    return { valid: false, error: 'detail חייב להיות מחרוזת' };
  }
  return { valid: true, reason, detail: detail ? detail.slice(0, MAX_DETAIL_LENGTH) : null };
}

/**
 * Groups already-fetched `watchdog` events by device and flags any device at
 * or over `threshold` occurrences within the window the caller already
 * scoped the query to — a kiosk that crashed/rebooted repeatedly in a short
 * window is unstable in a way a single, isolated recovery is not (the
 * recovery itself already did its job; this is the "an owner should go
 * look at this device" signal on top of it).
 *
 * Independent of the input's order (unlike a naive "first row wins"): each
 * event's own `created_at` is compared, not the order it arrived in, so a
 * caller passing rows in any order still gets the true most-recent event.
 */
export function summarizeCrashLoop(watchdogEvents, threshold) {
  const byDevice = new Map();
  for (const e of watchdogEvents) {
    const entry = byDevice.get(e.device_id) || {
      device_id: e.device_id,
      device_name: e.device_name,
      device_serial: e.device_serial,
      count: 0,
      lastAt: null,
      lastReason: null,
    };
    entry.count += 1;
    if (entry.lastAt === null || e.created_at > entry.lastAt) {
      entry.lastAt = e.created_at;
      entry.lastReason = e.detail;
    }
    byDevice.set(e.device_id, entry);
  }
  return [...byDevice.values()]
    .filter((d) => d.count >= threshold)
    .sort((a, b) => b.count - a.count);
}
