import express from 'express';
import { customAlphabet } from 'nanoid';
import { db, logEvent } from '../db.js';
import { requireAuth } from '../auth.js';
import { issueCommand, COMMAND_TYPES } from '../commands.js';
import { notifyConsolesOfDevice } from '../hub.js';
import { hostsForUrl, hostAllowed } from '../hosts.js';

const router = express.Router();
const codeGen = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

// Fetch a device, enforcing ownership (admins may access any device).
function getOwnedDevice(req, id) {
  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  if (!device) return { error: 404 };
  if (req.user.role !== 'admin' && device.owner_id !== req.user.id) return { error: 403 };
  return { device };
}

router.get('/devices', requireAuth, (req, res) => {
  const all = req.user.role === 'admin' && req.query.all === '1';
  const rows = all
    ? db.prepare(`SELECT d.*, u.username owner_name FROM devices d JOIN users u ON u.id = d.owner_id ORDER BY d.online DESC, d.last_seen DESC`).all()
    : db.prepare('SELECT * FROM devices WHERE owner_id = ? ORDER BY online DESC, last_seen DESC').all(req.user.id);
  res.json({ devices: rows.map(publicDevice) });
});

router.get('/devices/:id', requireAuth, (req, res) => {
  const { device, error } = getOwnedDevice(req, req.params.id);
  if (error) return res.sendStatus(error);
  const events = db.prepare('SELECT type, detail, created_at FROM events WHERE device_id = ? ORDER BY id DESC LIMIT 30').all(device.id);
  const commands = db.prepare('SELECT id, type, payload, status, result, created_at FROM commands WHERE device_id = ? ORDER BY id DESC LIMIT 20').all(device.id);
  res.json({ device: publicDevice(device), events, commands });
});

router.patch('/devices/:id', requireAuth, (req, res) => {
  const { device, error } = getOwnedDevice(req, req.params.id);
  if (error) return res.sendStatus(error);
  let { name, homeUrl, allowedHost, idleReturnSeconds, linkId } = req.body || {};

  // Selecting a link from the library overrides the URL + host set.
  if (linkId) {
    const link = db.prepare('SELECT * FROM links WHERE id = ? AND owner_id = ?').get(linkId, device.owner_id);
    if (!link) return res.status(400).json({ error: 'הקישור לא נמצא בספרייה' });
    homeUrl = link.url;
    allowedHost = link.allowed_host;
  } else if (homeUrl && !allowedHost) {
    allowedHost = hostsForUrl(homeUrl, device.allowed_host);
  }

  db.prepare(`UPDATE devices SET name = COALESCE(?, name), home_url = COALESCE(?, home_url),
     allowed_host = COALESCE(?, allowed_host), idle_return_seconds = COALESCE(?, idle_return_seconds) WHERE id = ?`)
    .run(name ?? null, homeUrl ?? null, allowedHost ?? null,
         idleReturnSeconds != null ? Math.max(0, Number(idleReturnSeconds)) : null, device.id);
  const fresh = db.prepare('SELECT * FROM devices WHERE id = ?').get(device.id);
  logEvent(device.id, req.user.id, 'config_update', null);
  notifyConsolesOfDevice(fresh, {});
  // Tell the device to re-pull its config (URL, hosts, idle-return) live.
  issueCommand(fresh, 'update_config', {
    homeUrl: fresh.home_url, allowedHost: fresh.allowed_host, idleReturnSeconds: fresh.idle_return_seconds,
  }, req.user.id);
  res.json({ device: publicDevice(fresh) });
});

router.delete('/devices/:id', requireAuth, (req, res) => {
  const { device, error } = getOwnedDevice(req, req.params.id);
  if (error) return res.sendStatus(error);
  db.prepare('DELETE FROM devices WHERE id = ?').run(device.id);
  logEvent(null, req.user.id, 'device_deleted', device.serial);
  res.json({ ok: true });
});

router.post('/devices/:id/command', requireAuth, (req, res) => {
  const { device, error } = getOwnedDevice(req, req.params.id);
  if (error) return res.sendStatus(error);
  const { type, payload } = req.body || {};
  if (!COMMAND_TYPES.has(type)) return res.status(400).json({ error: 'סוג פקודה לא נתמך' });
  if (type === 'set_url') {
    let host = '';
    try { host = new URL(payload?.url).host; } catch { return res.status(400).json({ error: 'כתובת לא תקינה' }); }
    if (!hostAllowed(host, device.allowed_host))
      return res.status(400).json({ error: 'הכתובת מחוץ לדומיינים המורשים של המכשיר' });
  }
  const cmd = issueCommand(device, type, payload, req.user.id);
  res.json({ command: cmd });
});

// ── Enrollment codes ──────────────────────────────────────────────
router.get('/enrollments', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, code, name, home_url, allowed_host, used, expires_at, created_at FROM enrollments WHERE owner_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id);
  res.json({ enrollments: rows });
});

router.post('/enrollments', requireAuth, (req, res) => {
  const used = db.prepare('SELECT COUNT(*) c FROM devices WHERE owner_id = ?').get(req.user.id).c;
  const openCodes = db.prepare('SELECT COUNT(*) c FROM enrollments WHERE owner_id = ? AND used = 0').get(req.user.id).c;
  if (used + openCodes >= req.user.device_limit) {
    return res.status(403).json({ error: 'אין מכסה פנויה. מחק מכשיר קיים או פנה למנהל להגדלת המכסה.' });
  }
  let { name, homeUrl, allowedHost, idleReturnSeconds, linkId } = req.body || {};

  // Pick the locking link from the library, or accept a manual URL.
  if (linkId) {
    const link = db.prepare('SELECT * FROM links WHERE id = ? AND owner_id = ?').get(linkId, req.user.id);
    if (!link) return res.status(400).json({ error: 'הקישור לא נמצא בספרייה' });
    homeUrl = link.url; allowedHost = link.allowed_host; name = name || link.name;
  }
  if (!homeUrl) return res.status(400).json({ error: 'בחרו קישור מהספרייה או הזינו כתובת אתר' });
  let host;
  try { new URL(homeUrl); } catch { return res.status(400).json({ error: 'כתובת אתר לא תקינה' }); }
  host = hostsForUrl(homeUrl, allowedHost);
  const idle = Math.max(0, Number(idleReturnSeconds) || 0);
  const code = codeGen();
  const expires = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
  const info = db.prepare('INSERT INTO enrollments (owner_id, code, name, home_url, allowed_host, idle_return_seconds, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, code, name || null, homeUrl, host, idle, expires);
  logEvent(null, req.user.id, 'enrollment_created', code);
  res.json({ enrollment: db.prepare('SELECT id, code, name, home_url, allowed_host, idle_return_seconds, used, expires_at FROM enrollments WHERE id = ?').get(info.lastInsertRowid) });
});

router.delete('/enrollments/:id', requireAuth, (req, res) => {
  const enr = db.prepare('SELECT * FROM enrollments WHERE id = ?').get(req.params.id);
  if (!enr || enr.owner_id !== req.user.id) return res.sendStatus(404);
  db.prepare('DELETE FROM enrollments WHERE id = ?').run(enr.id);
  res.json({ ok: true });
});

function publicDevice(d) {
  return {
    id: d.id, name: d.name, serial: d.serial, ownerId: d.owner_id, ownerName: d.owner_name,
    allowedHost: d.allowed_host, homeUrl: d.home_url, idleReturnSeconds: d.idle_return_seconds,
    status: d.status, online: !!d.online,
    lastSeen: d.last_seen, appVersion: d.app_version, battery: d.battery, model: d.model,
    androidVer: d.android_ver, ip: d.ip, createdAt: d.created_at,
  };
}

export default router;
