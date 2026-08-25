import express from 'express';
import rateLimit from 'express-rate-limit';
import { customAlphabet } from 'nanoid';
import { db, logEvent, approvedClientsForDevice, nextAccessCode } from '../db.js';
import { notifyConsolesOfDevice } from '../hub.js';
import { normalizeClientCode } from '../clients.js';
import { validateExitAttemptBody } from '../alerts.js';
import { validateWatchdogReportBody } from '../watchdog.js';
import { sanitizeBatteryLevel } from '../batterylevel.js';

// Device-facing API. Auth is by device_token (issued at enrollment), NOT by JWT.
const router = express.Router();
const tokenGen = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz', 40);

function deviceFromToken(req) {
  const t = req.headers['x-device-token'] || req.body?.deviceToken;
  if (!t) return null;
  return db.prepare('SELECT * FROM devices WHERE device_token = ?').get(t);
}

// /enroll is the one endpoint in this router with no auth at all — a fresh
// device proves nothing but a 6-character code drawn from a 33-symbol
// alphabet (~1.29e9 combinations). /auth/login guards the same shape of
// credential (a secret a caller presents with no prior session) with
// loginLimiter; this route had nothing, so a script could sweep the whole
// code space, and every hit before the real device enrolls both steals that
// owner's device slot (the code flips to `used`, "already redeemed" for the
// device standing at the venue) and leaks their homeUrl/allowedHost in the
// response — no device_token required to read it. Keyed by IP like
// loginLimiter: the real device tries one code once, so the entire budget is
// spent on whoever is scanning.
const enrollLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי ניסיונות רישום. נסו שוב בעוד מספר דקות.' },
});

/**
 * POST /api/agent/enroll
 * Body: { code, serial, name?, model?, androidVersion?, appVersion? }
 * A fresh device redeems a one-time enrollment code and receives a device_token
 * plus its assigned home_url / allowed_host.
 */
router.post('/enroll', enrollLimiter, (req, res) => {
  const { code, serial } = req.body || {};
  if (!code || !serial) return res.status(400).json({ error: 'code and serial are required' });

  const enr = db.prepare('SELECT * FROM enrollments WHERE code = ?').get(String(code).toUpperCase());
  if (!enr) return res.status(404).json({ error: 'קוד רישום לא קיים' });
  if (enr.used) return res.status(409).json({ error: 'קוד רישום כבר נוצל' });
  if (enr.expires_at && new Date(enr.expires_at) < new Date())
    return res.status(410).json({ error: 'קוד רישום פג תוקף' });

  const owner = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(enr.owner_id);
  if (!owner) return res.status(403).json({ error: 'החשבון אינו פעיל' });

  // Enforce the owner's device quota.
  const count = db.prepare('SELECT COUNT(*) c FROM devices WHERE owner_id = ?').get(owner.id).c;
  const existing = db.prepare('SELECT * FROM devices WHERE serial = ?').get(serial);
  if (!existing && count >= owner.device_limit) {
    return res.status(403).json({ error: 'הגעת למכסת המכשירים המותרת בחשבון' });
  }

  const token = tokenGen();
  const now = new Date().toISOString();
  let device;

  if (existing && existing.owner_id === owner.id) {
    // Re-enroll same hardware: rotate its token, keep history.
    db.prepare('UPDATE devices SET device_token = ?, name = COALESCE(?, name), home_url = ?, allowed_host = ?, idle_return_seconds = ?, last_seen = ? WHERE id = ?')
      .run(token, enr.name, enr.home_url, enr.allowed_host, enr.idle_return_seconds ?? 0, now, existing.id);
    device = db.prepare('SELECT * FROM devices WHERE id = ?').get(existing.id);
  } else if (existing) {
    return res.status(409).json({ error: 'מכשיר זה כבר רשום לחשבון אחר' });
  } else {
    // §2★ז's launcher code is minted right away, same "new device gets a
    // working identity from its first row" reasoning as device_token above —
    // not lazily on first console view, so a technician can hand out
    // GET /k/:code immediately after this device's very first enrollment.
    const info = db.prepare(`INSERT INTO devices (owner_id, serial, name, device_token, allowed_host, home_url, idle_return_seconds, model, android_ver, app_version, last_seen, access_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(owner.id, serial, enr.name || `מכשיר ${serial.slice(-4)}`, token,
           enr.allowed_host, enr.home_url, enr.idle_return_seconds ?? 0, req.body.model || null,
           req.body.androidVersion || null, req.body.appVersion || null, now, nextAccessCode());
    device = db.prepare('SELECT * FROM devices WHERE id = ?').get(info.lastInsertRowid);
  }

  db.prepare('UPDATE enrollments SET used = 1, device_id = ? WHERE id = ?').run(device.id, enr.id);
  logEvent(device.id, owner.id, 'enrolled', `serial=${serial}`);
  notifyConsolesOfDevice(device, {});

  res.json({
    deviceToken: token,
    device: {
      id: device.id, name: device.name, serial: device.serial,
      homeUrl: device.home_url,
      // KIOSK_BUILD.md §2★א — empty on a brand-new enrollment (there is no
      // console UI to set a per-device override before the device exists),
      // but read here in case a re-enrollment redeems a device row that
      // already had one set, same "must land on its own" reasoning adminCode
      // below gives.
      displayUrl: device.display_url || '',
      allowedHost: device.allowed_host,
      idleReturnSeconds: device.idle_return_seconds,
      // Enrollment is the last moment before the device locks, and the first
      // heartbeat may come after it — so the maintenance code has to land
      // here too, not only on the heartbeat/update_config paths.
      adminCode: device.exit_code || '',
      displayZoomPercent: device.display_zoom_percent,
      displayOrientation: device.display_orientation || 'landscape',
      // §2★ה requires the on-device selection screen to work fully offline,
      // so the approved-customers list (empty at first enrollment, filled in
      // once the owner approves some in the console) travels here too rather
      // than needing a separate online lookup before it can be shown.
      approvedClients: approvedClientsForDevice(device.id),
      signageEnabled: !!device.signage_enabled, signageUrls: device.signage_urls || '',
      signageIntervalSeconds: device.signage_interval_seconds,
      // Same "must land on its own" reasoning as adminCode above: a device
      // could be put in maintenance mode moments before a fresh install
      // enrolls it (a technician prepping a unit that will not go live
      // yet), and enrollment is the first response this device ever reads.
      maintenanceEnabled: !!device.maintenance_enabled, maintenanceMessage: device.maintenance_message || '',
      paymentMode: device.payment_mode || 'none',
      // KIOSK_BUILD.md §9 "תזמון": a device enrolled with a schedule already
      // configured on its template/enrollment-derived row (or re-enrolling
      // hardware) must know its own business hours from the first screen it
      // ever shows, offline, the same reasoning as maintenanceEnabled above
      // rather than waiting for the next sweep tick in index.js.
      scheduleEnabled: !!device.schedule_enabled, scheduleOpenTime: device.schedule_open_time || '',
      scheduleCloseTime: device.schedule_close_time || '',
      // KIOSK_BUILD.md §4: same "must land on its own" reasoning as
      // adminCode above — a device's very first read of its policy is this
      // enroll response, not a later update_config, so a custom exit-gesture
      // set before this device was ever enrolled must already be here.
      exitGestureTaps: device.exit_gesture_taps ?? 5,
      exitGestureCorner: device.exit_gesture_corner || 'tl',
      exitGestureHoldMs: device.exit_gesture_hold_ms ?? 0,
    },
  });
});

/**
 * POST /api/agent/heartbeat
 * Header: X-Device-Token. Body: { status?, battery?, appVersion?, ip? }
 * Returns current config + any pending commands (fallback path when WS is down).
 */
router.post('/heartbeat', (req, res) => {
  const device = deviceFromToken(req);
  if (!device) return res.status(401).json({ error: 'device token invalid' });

  const b = req.body || {};
  db.prepare(`UPDATE devices SET online = 1, last_seen = datetime('now'),
     status = COALESCE(?, status), battery = COALESCE(?, battery),
     app_version = COALESCE(?, app_version), ip = COALESCE(?, ip) WHERE id = ?`)
    .run(b.status ?? null, sanitizeBatteryLevel(b.battery), b.appVersion ?? null,
         b.ip ?? req.ip ?? null, device.id);

  const fresh = db.prepare('SELECT * FROM devices WHERE id = ?').get(device.id);
  notifyConsolesOfDevice(fresh, {});

  // Includes 'delivered' as a stuck-command safety net (a WS push can be
  // marked delivered without the device ever actually receiving/acking it —
  // AgentClient.ack() treats okhttp's WebSocket.send() returning true as
  // success, but that only means the frame was queued, not that it crossed a
  // silently-dead connection; the HTTP fallback in ack() is only attempted
  // when send() itself returns false, so a dead-but-undetected socket loses
  // the ack with no retry). Gated on staleness (delivered_at older than one
  // full heartbeat cycle) so this only re-fires truly stuck commands instead
  // of racing every 60s heartbeat against the device's own near-instant
  // execute-then-ack for a command that just landed seconds ago — without the
  // gate, AgentClient.heartbeat() has no per-command dedup (it blindly
  // executes every entry in `commands`), so a still-in-flight 'delivered' row
  // would be re-executed on the device (screen toggle, reboot, message,
  // reload...) every single heartbeat until the ack finally lands.
  const pending = db.prepare(
    `SELECT * FROM commands WHERE device_id = ?
     AND (status = 'pending' OR (status = 'delivered' AND delivered_at <= datetime('now', '-2 minutes')))
     ORDER BY id`
  ).all(device.id);
  const commands = pending.map((c) => {
    // Unconditional (not COALESCE-preserving the old timestamp): a retried
    // 'delivered' row must push its staleness clock forward on every
    // redelivery, or it would satisfy the `-2 minutes` gate above on every
    // heartbeat forever after its first retry instead of backing off another
    // full cycle each time.
    db.prepare("UPDATE commands SET status = 'delivered', delivered_at = datetime('now') WHERE id = ?").run(c.id);
    return { id: c.id, type: c.type, payload: c.payload ? JSON.parse(c.payload) : null };
  });

  res.json({
    config: {
      homeUrl: fresh.home_url, displayUrl: fresh.display_url || '', allowedHost: fresh.allowed_host,
      name: fresh.name, idleReturnSeconds: fresh.idle_return_seconds,
      adminCode: fresh.exit_code || '', displayZoomPercent: fresh.display_zoom_percent,
      displayOrientation: fresh.display_orientation || 'landscape',
      approvedClients: approvedClientsForDevice(fresh.id),
      signageEnabled: !!fresh.signage_enabled, signageUrls: fresh.signage_urls || '',
      signageIntervalSeconds: fresh.signage_interval_seconds,
      maintenanceEnabled: !!fresh.maintenance_enabled, maintenanceMessage: fresh.maintenance_message || '',
      paymentMode: fresh.payment_mode || 'none',
      // KIOSK_BUILD.md §9 "תזמון" — see pushConfigUpdate's own comment
      // (policy.js) for why this has to ride along on every heartbeat, not
      // only the live screen_on/screen_off command index.js's sweep issues:
      // a device that reconnects (or reboots) mid-window must be able to
      // work out its own current screen state from this alone.
      scheduleEnabled: !!fresh.schedule_enabled, scheduleOpenTime: fresh.schedule_open_time || '',
      scheduleCloseTime: fresh.schedule_close_time || '',
      exitGestureTaps: fresh.exit_gesture_taps ?? 5,
      exitGestureCorner: fresh.exit_gesture_corner || 'tl',
      exitGestureHoldMs: fresh.exit_gesture_hold_ms ?? 0,
    },
    commands,
  });
});

/**
 * POST /api/agent/identify
 * Header: X-Device-Token. Body: { code }
 * KIOSK_BUILD.md §2★ז's `IdentifyDevice`: given a client id typed on the
 * device, resolve it to that customer's branded site — but only if the
 * owner approved this exact client for this exact device (§2★ה), so a code
 * belonging to a different customer of the same owner (or a stale one an
 * owner has since revoked) does not open on a device it was never granted
 * on. Scoped by device.owner_id, not global: two owners may each register
 * their own "1" without collision, the same per-owner uniqueness `clients`
 * already enforces at the database level.
 */
router.post('/identify', (req, res) => {
  const device = deviceFromToken(req);
  if (!device) return res.status(401).json({ error: 'device token invalid' });
  const code = normalizeClientCode(req.body?.code);
  if (!code) return res.status(400).json({ error: 'קוד לקוח לא תקין' });
  const client = db.prepare(
    `SELECT c.code, c.name, c.url, c.allowed_host AS allowedHost,
            c.logo_url AS logoUrl, c.brand_color AS brandColor FROM clients c
     JOIN device_clients dc ON dc.client_id = c.id AND dc.device_id = ?
     WHERE c.owner_id = ? AND c.code = ?`
  ).get(device.id, device.owner_id, code);
  if (!client) return res.status(404).json({ error: 'קוד לקוח לא מזוהה או לא מאושר למכשיר זה' });
  logEvent(device.id, null, 'client_identified', code);
  res.json({ client });
});

// Accepts only a data URL with an image MIME type: this string is later
// rendered straight into the console as an <img src="…"> (see viewScreenshot()
// in public/js/app.js). A device is a semi-trusted party (it holds a real
// device_token, but "trusted enough to report its own status" is not "trusted
// enough to put an arbitrary string into another tab's DOM") — the same shape
// of caution hosts.js already applies to what a human types into the allow-list.
const SCREENSHOT_RE = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/]+=*$/;

/**
 * POST /api/agent/screenshot
 * Header: X-Device-Token. Body: { commandId?, image }
 * Stores the device's latest remote-screenshot capture (KIOSK_BUILD.md's
 * "צילום מסך מרחוק" remote command). The 1mb express.json() limit already
 * bounds the upload; AgentClient additionally downscales before encoding so a
 * real capture fits well under it.
 */
router.post('/screenshot', (req, res) => {
  const device = deviceFromToken(req);
  if (!device) return res.status(401).json({ error: 'device token invalid' });
  const { commandId, image } = req.body || {};
  if (typeof image !== 'string' || !SCREENSHOT_RE.test(image)) {
    return res.status(400).json({ error: 'invalid image' });
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE devices SET last_screenshot = ?, last_screenshot_at = ? WHERE id = ?').run(image, now, device.id);
  if (commandId) {
    db.prepare("UPDATE commands SET status = 'done', result = ?, done_at = datetime('now') WHERE id = ? AND device_id = ?")
      .run('screenshot saved', commandId, device.id);
  }
  logEvent(device.id, null, 'screenshot', null);
  const fresh = db.prepare('SELECT * FROM devices WHERE id = ?').get(device.id);
  notifyConsolesOfDevice(fresh, {});
  res.json({ ok: true });
});

/** POST /api/agent/ack  Body: { commandId, ok, result? } */
router.post('/ack', (req, res) => {
  const device = deviceFromToken(req);
  if (!device) return res.status(401).json({ error: 'device token invalid' });
  const { commandId, ok, result } = req.body || {};
  if (!commandId) return res.status(400).json({ error: 'commandId required' });
  db.prepare("UPDATE commands SET status = ?, result = ?, done_at = datetime('now') WHERE id = ? AND device_id = ?")
    .run(ok ? 'done' : 'failed', result ? String(result).slice(0, 2000) : null, commandId, device.id);
  logEvent(device.id, null, 'command_ack', `#${commandId} ${ok ? 'done' : 'failed'}`);
  res.json({ ok: true });
});

/**
 * POST /api/agent/exit-attempt
 * Header: X-Device-Token. Body: { ok: boolean }
 * KIOSK_BUILD.md §9 "ניסיון יציאה מהקיוסק": showAdminDialog() on the device
 * compares the typed maintenance code entirely locally (exitcode.js's own
 * header comment) — nothing about that dialog being opened, or a wrong code
 * being typed into it, ever reached the server before this. `ok` is exactly
 * what the device's own comparison decided, not re-derived here: the server
 * never receives the code itself, so a wrong-code attempt is reported, not
 * re-validated.
 */
router.post('/exit-attempt', (req, res) => {
  const device = deviceFromToken(req);
  if (!device) return res.status(401).json({ error: 'device token invalid' });
  const { valid, ok, error } = validateExitAttemptBody(req.body);
  if (!valid) return res.status(400).json({ error });
  logEvent(device.id, null, 'exit_attempt', ok ? 'correct_code' : 'wrong_code');
  res.json({ ok: true });
});

/**
 * POST /api/agent/watchdog-report
 * Header: X-Device-Token. Body: { reason: 'crash'|'anr_reboot', detail?: string }
 * KIOSK_BUILD.md §0/§8 "watchdog": the device's own Watchdog.kt recovers
 * entirely locally — relaunching the launcher activity after an uncaught
 * exception, or rebooting the device (Device Owner only) when the main
 * thread stops responding — before it ever reaches the network. This only
 * records that a recovery happened, the same "device decided, server just
 * logs it" shape exit-attempt already established above.
 */
router.post('/watchdog-report', (req, res) => {
  const device = deviceFromToken(req);
  if (!device) return res.status(401).json({ error: 'device token invalid' });
  const { valid, reason, detail, error } = validateWatchdogReportBody(req.body);
  if (!valid) return res.status(400).json({ error });
  logEvent(device.id, null, 'watchdog', detail ? `${reason}: ${detail}` : reason);
  res.json({ ok: true });
});

export default router;
