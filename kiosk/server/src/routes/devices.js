import express from 'express';
import { customAlphabet } from 'nanoid';
import { db, logEvent } from '../db.js';
import { requireAuth } from '../auth.js';
import { issueCommand, COMMAND_TYPES } from '../commands.js';
import { notifyConsolesOfDevice } from '../hub.js';
import { hostsForUrl, hostAllowed, normalizeHostCsv, parseHosts } from '../hosts.js';
import { validateExitCode } from '../exitcode.js';

const router = express.Router();
const codeGen = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

// Fetch a device, enforcing ownership (admins may access any device).
//
// A device owned by another customer answers the same 404 as one that does
// not exist at all — not 403. links.js/enrollments.js's ownership checks in
// this same file already collapse "not yours" into "not found"
// (`if (!link || link.owner_id !== req.user.id) return res.sendStatus(404)`);
// this one used to split the two into 403 vs 404, which lets any authenticated
// customer enumerate device ids across the *entire* fleet — not just their
// own — by probing GET/PATCH/DELETE /devices/:id and telling "exists,
// someone else's" from "does not exist" purely from the status code. The
// client never reads the distinction (api() in app.js throws on any !res.ok
// with the same generic message either way), so nothing depends on 403 here.
function getOwnedDevice(req, id) {
  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  if (!device || (req.user.role !== 'admin' && device.owner_id !== req.user.id)) return { error: 404 };
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
  let { name, homeUrl, allowedHost, idleReturnSeconds, linkId, exitCode } = req.body || {};

  // exitCode is validated up front, before any other write on this device:
  // COALESCE(?, exit_code) below treats '' as "clear" and undefined as "no
  // change" the same way name/homeUrl already do, so an invalid value must be
  // rejected here rather than silently stored.
  let exitCodeValue = null;
  if (exitCode !== undefined) {
    const v = validateExitCode(exitCode);
    if (!v.ok) return res.status(400).json({ error: v.error });
    exitCodeValue = v.value;
  }

  // Selecting a link from the library overrides the URL + host set.
  if (linkId) {
    const link = db.prepare('SELECT * FROM links WHERE id = ? AND owner_id = ?').get(linkId, device.owner_id);
    if (!link) return res.status(400).json({ error: 'הקישור לא נמצא בספרייה' });
    homeUrl = link.url;
    allowedHost = link.allowed_host;
  } else if (homeUrl) {
    // hostsForUrl always folds the *new* home URL's own host into the result
    // — even when the caller also supplied an explicit allowedHost. Skipping
    // that merge (the previous behaviour whenever allowedHost was truthy) let
    // one request set homeUrl and allowedHost to a mismatched pair: nothing
    // here checked the new home URL's host against the new list, so the
    // server stored the mismatch as-is and pushed it to the device via
    // update_config. The agent's onConfigUpdated loads that homeUrl
    // unconditionally (see hosts.test.mjs: "the device home URL is always
    // part of its own allow-list" — the invariant this line restores for the
    // one write path that could break it).
    allowedHost = hostsForUrl(homeUrl, allowedHost || device.allowed_host);
  }

  // Whatever route the list arrived by, store it clean. The allow-list is what
  // stands between a locked device and the open internet; an entry like
  // "https://pay.example.com/checkout" matches no host at all, so a list that
  // looks configured would in fact be protecting nothing.
  if (allowedHost != null) {
    const cleaned = normalizeHostCsv(allowedHost);
    // Refusing an all-junk list is safer than saving an empty one: an empty
    // allow-list means "no lock configured" to hostAllowed(), which fails open.
    if (!cleaned && parseHosts(allowedHost).length > 0) {
      return res.status(400).json({ error: 'רשימת הדומיינים אינה תקינה — נדרש לפחות דומיין אחד תקף (למשל example.com)' });
    }
    allowedHost = cleaned || null;
  }

  db.prepare(`UPDATE devices SET name = COALESCE(?, name), home_url = COALESCE(?, home_url),
     allowed_host = COALESCE(?, allowed_host), idle_return_seconds = COALESCE(?, idle_return_seconds),
     exit_code = COALESCE(?, exit_code) WHERE id = ?`)
    .run(name ?? null, homeUrl ?? null, allowedHost ?? null,
         idleReturnSeconds != null ? Math.max(0, Number(idleReturnSeconds)) : null,
         exitCodeValue, device.id);
  const fresh = db.prepare('SELECT * FROM devices WHERE id = ?').get(device.id);
  logEvent(device.id, req.user.id, 'config_update', null);
  notifyConsolesOfDevice(fresh, {});
  // Tell the device to re-pull its config (URL, hosts, idle-return, admin
  // code) live. adminCode is sent on every update_config, not only when it
  // changed here — the same command already carries the other three
  // unconditionally, and the agent only ever writes what it is sent.
  issueCommand(fresh, 'update_config', {
    homeUrl: fresh.home_url, allowedHost: fresh.allowed_host, idleReturnSeconds: fresh.idle_return_seconds,
    adminCode: fresh.exit_code || '',
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
    androidVer: d.android_ver, ip: d.ip, createdAt: d.created_at, exitCode: d.exit_code || '',
  };
}

export default router;
