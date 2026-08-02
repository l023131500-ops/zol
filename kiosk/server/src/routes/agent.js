import express from 'express';
import { customAlphabet } from 'nanoid';
import { db, logEvent } from '../db.js';
import { notifyConsolesOfDevice } from '../hub.js';

// Device-facing API. Auth is by device_token (issued at enrollment), NOT by JWT.
const router = express.Router();
const tokenGen = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz', 40);

function deviceFromToken(req) {
  const t = req.headers['x-device-token'] || req.body?.deviceToken;
  if (!t) return null;
  return db.prepare('SELECT * FROM devices WHERE device_token = ?').get(t);
}

/**
 * POST /api/agent/enroll
 * Body: { code, serial, name?, model?, androidVersion?, appVersion? }
 * A fresh device redeems a one-time enrollment code and receives a device_token
 * plus its assigned home_url / allowed_host.
 */
router.post('/enroll', (req, res) => {
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
    },
    commands,
  });
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
