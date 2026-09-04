// KIOSK_BUILD.md §9 "אנליטיקה: כמה שימושים, זמן ממוצע, קישורים פופולריים" —
// was entirely unbuilt. The only on-device navigation this system logs today
// is a client switch (`client_identified`, KIOSK_BUILD.md §2★ז's
// IdentifyDevice) — the initial home_url load at boot/enrollment has no event
// of its own, so "usage" here specifically means "how many times a kiosk
// switched to a registered client's site", not total screen-on time. Kept
// dependency-free like alerts.js/hosts.js/schedule.js/etc so it unit-tests
// with no better-sqlite3 installed.

/**
 * Turn a flat list of client-switch events into per-device sessions with a
 * duration: how long that client stayed on screen before the device moved to
 * the next one. The *last* event for a device has no "next" to measure
 * against — it is still on screen — so its session is left `durationMs: null`
 * (ongoing/unknown) rather than guessed at, the same never-guess-a-missing-
 * fact convention `exit_code`/`schedule_*` used elsewhere (NULL means "not
 * known", not "zero").
 *
 * `events` must already be sorted ascending by `atMs` *within* each device —
 * callers sort by (device_id, created_at) in SQL, which this trusts rather
 * than re-sorting (avoiding a second, possibly divergent, sort order here).
 */
export function buildSessions(events) {
  const openByDevice = new Map();
  const sessions = [];
  for (const ev of events) {
    const open = openByDevice.get(ev.deviceId);
    if (open) open.durationMs = ev.atMs - open.atMs;
    const session = { deviceId: ev.deviceId, code: ev.code, name: ev.name, atMs: ev.atMs, durationMs: null };
    sessions.push(session);
    openByDevice.set(ev.deviceId, session);
  }
  return sessions;
}

/**
 * Aggregate sessions into the console's three numbers: total switches
 * ("כמה שימושים"), per-client average dwell time in seconds from *completed*
 * sessions only ("זמן ממוצע" — an ongoing session's duration is unknown, not
 * zero, so it must not drag the average down), and a popularity ranking
 * ("קישורים פופולריים") by switch count, most-used first.
 */
export function summarizeAnalytics(sessions) {
  const byCode = new Map();
  for (const s of sessions) {
    let agg = byCode.get(s.code);
    if (!agg) {
      agg = { code: s.code, name: s.name, count: 0, completedCount: 0, totalDurationMs: 0 };
      byCode.set(s.code, agg);
    }
    agg.count += 1;
    agg.name = s.name; // a client may have been renamed since; the latest name wins
    if (s.durationMs != null) {
      agg.completedCount += 1;
      agg.totalDurationMs += s.durationMs;
    }
  }
  const byClient = [...byCode.values()]
    .map((agg) => ({
      code: agg.code,
      name: agg.name,
      count: agg.count,
      avgSeconds: agg.completedCount ? Math.round(agg.totalDurationMs / agg.completedCount / 1000) : null,
    }))
    .sort((a, b) => b.count - a.count);

  const completed = sessions.filter((s) => s.durationMs != null);
  const overallAvgSeconds = completed.length
    ? Math.round(completed.reduce((sum, s) => sum + s.durationMs, 0) / completed.length / 1000)
    : null;

  return { totalSwitches: sessions.length, overallAvgSeconds, byClient };
}
