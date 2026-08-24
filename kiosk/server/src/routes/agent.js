import express from 'express';
import rateLimit from 'express-rate-limit';
import { customAlphabet } from 'nanoid';
import { db, logEvent, approvedClientsForDevice } from '../db.js';
import { notifyConsolesOfDevice } from '../hub.js';
import { normalizeClientCode } from '../clients.js';

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
    const info = db.prepare(`INSERT INTO devices (owner_id, serial, name, device_token, allowed_host, home_url, idle_return_seconds, model, android_ver, app_version, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(owner.id, serial, enr.name || `מכשיר ${serial.slice(-4)}`, token,
           enr.allowed_host, enr.home_url, enr.idle_return_seconds ?? 0, req.body.model || null,
           req.body.androidVersion || null, req.body.appVersion || null, now);
    device = db.prepare('SELECT * FROM devices WHERE id = ?').get(info.lastInsertRowid);
  }

  db.prepare('UPDATE enrollments SET used = 1, device_id = ? WHERE id = ?').run(device.id, enr.id);
  logEvent(device.id, owner.id, 'enrolled', `serial=${serial}`);
  notifyConsolesOfDevice(device, {});

  res.json({
    deviceToken: token,
    device: {
      id: device.id, name: device.name, serial: device.serial,
      homeUrl: device.home_url, allowedHost: device.allowed_host,
      idleReturnSeconds: device.idle_return_seconds,
      // Enrollment is the last moment before the device locks, and the first
      // heartbeat may come after it — so the maintenance code has to land
      // here too, not only on the heartbeat/update_config paths.
      adminCode: device.exit_code || '',
      displayZoomPercent: device.display_zoom_percent,
      // §2★ה requires the on-device selection screen to work fully offline,
      // so the approved-customers list (empty at first enrollment, filled in
      // once the owner approves some in the console) travels here too rather
      // than needing a separate online lookup before it can be shown.
      approvedClients: approvedClientsForDevice(device.id),
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
    .run(b.status ?? null, b.battery ?? null, b.appVersion ?? null,
         b.ip ?? req.ip ?? null, device.id);

  const fresh = db.prepare('SELECT * FROM devices WHERE id = ?').get(device.id);
  notifyConsolesOfDevice(fresh, {});

  const pending = db.prepare("SELECT * FROM commands WHERE device_id = ? AND status IN ('pending','delivered') ORDER BY id").all(device.id);
  const commands = pending.map((c) => {
    db.prepare("UPDATE commands SET status = 'delivered', delivered_at = COALESCE(delivered_at, datetime('now')) WHERE id = ?").run(c.id);
    return { id: c.id, type: c.type, payload: c.payload ? JSON.parse(c.payload) : null };
  });

  res.json({
    config: {
      homeUrl: fresh.home_url, allowedHost: fresh.allowed_host,
      name: fresh.name, idleReturnSeconds: fresh.idle_return_seconds,
      adminCode: fresh.exit_code || '', displayZoomPercent: fresh.display_zoom_percent,
      approvedClients: approvedClientsForDevice(fresh.id),
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
    `SELECT c.code, c.name, c.url FROM clients c
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

export default router;
