import express from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { summarizeAlerts } from '../alerts.js';
import { summarizeCrashLoop } from '../watchdog.js';

// KIOSK_BUILD.md §9 "התראות: מכשיר אופליין מעל X, סוללה נמוכה, ניסיון יציאה
// מהקיוסק" — was entirely unbuilt. Owner-scoped the same way GET /devices
// already is (admins may pass ?all=1 for the whole fleet); every query below
// mirrors that route's own ownership branch exactly.
const router = express.Router();

router.get('/alerts', requireAuth, (req, res) => {
  const all = req.user.role === 'admin' && req.query.all === '1';
  const ownerClause = all ? '' : 'WHERE owner_id = ?';
  const ownerArgs = all ? [] : [req.user.id];

  // Same WHERE-clause shape as index.js's own offline-marking sweep
  // (`online = 1 AND (last_seen IS NULL OR last_seen < datetime('now', ?))`)
  // — but against already-offline devices and a longer, "go check on it"
  // threshold rather than the heartbeat-miss one that flips `online` itself.
  const offlineDevices = db.prepare(
    `SELECT id, name, serial, owner_id, last_seen FROM devices
     ${ownerClause ? ownerClause + ' AND' : 'WHERE'} online = 0
     AND (last_seen IS NULL OR last_seen < datetime('now', ?))
     ORDER BY last_seen ASC`
  ).all(...ownerArgs, `-${config.alertOfflineMinutes} minutes`);

  const lowBatteryDevices = db.prepare(
    `SELECT id, name, serial, owner_id, battery FROM devices
     ${ownerClause ? ownerClause + ' AND' : 'WHERE'} battery IS NOT NULL AND battery >= 0 AND battery <= ?
     ORDER BY battery ASC`
  ).all(...ownerArgs, config.lowBatteryPercent);

  const exitAttempts = db.prepare(
    `SELECT e.id, e.device_id, e.detail, e.created_at,
            d.name device_name, d.serial device_serial
     FROM events e JOIN devices d ON d.id = e.device_id
     WHERE e.type = 'exit_attempt' ${all ? '' : 'AND d.owner_id = ?'}
     AND e.created_at >= datetime('now', ?)
     ORDER BY e.id DESC LIMIT 50`
  ).all(...(all ? [] : [req.user.id]), `-${config.exitAttemptWindowHours} hours`);

  // KIOSK_BUILD.md §0/§8 "watchdog": Watchdog.kt reports a crash or a
  // frozen-main-thread reboot as a `watchdog` event (routes/agent.js's new
  // POST /watchdog-report) — grouped here into a per-device crash-loop flag
  // the same way exitAttempts feeds isSuspiciousExitAttempt above.
  const watchdogEvents = db.prepare(
    `SELECT e.id, e.device_id, e.detail, e.created_at,
            d.name device_name, d.serial device_serial
     FROM events e JOIN devices d ON d.id = e.device_id
     WHERE e.type = 'watchdog' ${all ? '' : 'AND d.owner_id = ?'}
     AND e.created_at >= datetime('now', ?)
     ORDER BY e.id DESC LIMIT 200`
  ).all(...(all ? [] : [req.user.id]), `-${config.crashLoopWindowHours} hours`);
  const crashLoopDevices = summarizeCrashLoop(watchdogEvents, config.crashLoopThreshold);

  res.json({
    offlineDevices, lowBatteryDevices, exitAttempts, crashLoopDevices,
    summary: summarizeAlerts({ offlineDevices, lowBatteryDevices, exitAttempts, crashLoopDevices }),
    thresholds: {
      offlineMinutes: config.alertOfflineMinutes,
      lowBatteryPercent: config.lowBatteryPercent,
      exitAttemptWindowHours: config.exitAttemptWindowHours,
      crashLoopWindowHours: config.crashLoopWindowHours,
      crashLoopThreshold: config.crashLoopThreshold,
    },
  });
});

export default router;
