import express from 'express';
import { customAlphabet } from 'nanoid';
import { db, logEvent, approvedClientsForDevice, nextAccessCode } from '../db.js';
import { requireAuth } from '../auth.js';
import { issueCommand, COMMAND_TYPES } from '../commands.js';
import { hostAllowed, hostsForUrl } from '../hosts.js';
import { applyDevicePolicy, pushConfigUpdate } from '../policy.js';
import { buildWindowsKioskScript } from '../windowspackage.js';
import { sanitizeSerial, buildUsbOfflineScript } from '../usbpackage.js';
import { notifyConsolesOfDevice } from '../hub.js';

const router = express.Router();
const codeGen = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
// Same alphabet/length as routes/agent.js's own `tokenGen` — not imported
// from there because this endpoint provisions a device from fields the
// network /enroll route never has (no model/androidVersion/appVersion; the
// device hasn't run yet), and touching that already-live, already-tested
// handler for an unrelated feature is a bigger risk than the few duplicated
// lines below (kept deliberately close to it so the two stay easy to compare).
const deviceTokenGen = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz', 40);

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
  const result = applyDevicePolicy(device, req.body || {}, req.user.id, 'עריכה ידנית');
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ device: publicDevice(result.device) });
});

// Fetched on demand, not folded into GET /devices or /devices/:id: the image
// can run to hundreds of KB, and every device-list load paying for it would
// slow the common case for the sake of the rare "view the screenshot" click.
router.get('/devices/:id/screenshot', requireAuth, (req, res) => {
  const { device, error } = getOwnedDevice(req, req.params.id);
  if (error) return res.sendStatus(error);
  if (!device.last_screenshot) return res.sendStatus(404);
  res.json({ image: device.last_screenshot, takenAt: device.last_screenshot_at });
});

// KIOSK_BUILD.md §3 Route C / §10: a device row already holds everything the
// Windows package needs (homeUrl, allowedHost, name) — the same fields Route
// B's enrollment/update_config already build a device identity from — so
// there is nothing new to configure here beyond picking this device.
// text/plain rather than JSON: the console downloads this as a .ps1 file
// (see downloadFile() in app.js), not something it parses.
router.get('/devices/:id/windows-package', requireAuth, (req, res) => {
  const { device, error } = getOwnedDevice(req, req.params.id);
  if (error) return res.sendStatus(error);
  let script;
  try {
    script = buildWindowsKioskScript({
      deviceName: device.name, homeUrl: device.home_url, allowedHost: device.allowed_host,
      idleTimeoutMinutes: device.idle_return_seconds ? Math.ceil(device.idle_return_seconds / 60) : undefined,
    });
  } catch (e) {
    // Only reachable for a device enrolled before home_url was required, or
    // one an owner cleared without setting a replacement — every other path
    // to a device row already enforces a valid home_url (see enrollments'
    // own `new URL(homeUrl)` check above).
    return res.status(400).json({ error: e.message });
  }
  res.setHeader('Content-Disposition', `attachment; filename="kioskfleet-${device.serial}.ps1"`);
  res.type('text/plain; charset=utf-8').send(script);
});

// ── Client approvals (KIOSK_BUILD.md §2★ד/ה) ──────────────────────
// Which of the owner's registered customers this device may switch to
// on-device. Listing merges the owner's whole client directory with this
// device's approvals so the console can render one checklist rather than the
// caller diffing two separate lists.
router.get('/devices/:id/clients', requireAuth, (req, res) => {
  const { device, error } = getOwnedDevice(req, req.params.id);
  if (error) return res.sendStatus(error);
  const rows = db.prepare(
    `SELECT c.id, c.code, c.name, c.url, (dc.device_id IS NOT NULL) approved
     FROM clients c LEFT JOIN device_clients dc ON dc.client_id = c.id AND dc.device_id = ?
     WHERE c.owner_id = ? ORDER BY c.name`
  ).all(device.id, device.owner_id);
  res.json({ clients: rows.map((r) => ({ id: r.id, code: r.code, name: r.name, url: r.url, approved: !!r.approved })) });
});

router.post('/devices/:id/clients/:clientId', requireAuth, (req, res) => {
  const { device, error } = getOwnedDevice(req, req.params.id);
  if (error) return res.sendStatus(error);
  // A client id belongs to the same owner as the device, never borrowed
  // across accounts — same ownership boundary getOwnedDevice already
  // enforces for the device itself.
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND owner_id = ?').get(req.params.clientId, device.owner_id);
  if (!client) return res.sendStatus(404);
  db.prepare('INSERT OR IGNORE INTO device_clients (device_id, client_id) VALUES (?, ?)').run(device.id, client.id);
  logEvent(device.id, req.user.id, 'client_approved', client.code);
  pushConfigUpdate(device, req.user.id);
  res.json({ ok: true });
});

router.delete('/devices/:id/clients/:clientId', requireAuth, (req, res) => {
  const { device, error } = getOwnedDevice(req, req.params.id);
  if (error) return res.sendStatus(error);
  const info = db.prepare('DELETE FROM device_clients WHERE device_id = ? AND client_id = ?').run(device.id, req.params.clientId);
  if (info.changes) {
    logEvent(device.id, req.user.id, 'client_revoked', String(req.params.clientId));
    pushConfigUpdate(device, req.user.id);
  }
  res.json({ ok: true });
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

// KIOSK_BUILD.md §3 Route D + §6 + §10-D: a fully offline install. Every
// other route lets the *device* redeem the code over the network, at the
// venue; §10-D's own steps require zero internet at the venue, so this
// endpoint provisions the device row right now, while the owner is still at
// their desk and online, from a serial they already read off the physical
// unit (`adb devices`). text/plain, like the Windows package: the console
// downloads this as a .sh file, not something it parses.
router.post('/enrollments/:id/usb-package', requireAuth, (req, res) => {
  const enr = db.prepare('SELECT * FROM enrollments WHERE id = ?').get(req.params.id);
  if (!enr || enr.owner_id !== req.user.id) return res.sendStatus(404);
  if (enr.used) return res.status(409).json({ error: 'קוד רישום כבר נוצל' });
  if (enr.expires_at && new Date(enr.expires_at) < new Date())
    return res.status(410).json({ error: 'קוד רישום פג תוקף' });

  const serial = sanitizeSerial(req.body?.serial);
  if (!serial) return res.status(400).json({ error: 'נא להזין מספר סידורי (מהפקודה adb devices)' });

  // Same re-enroll-vs-new-device split /api/agent/enroll makes, but here the
  // "already exists" case matters more: an owner may re-generate this
  // package to rotate a lost/leaked token for hardware they already own.
  const existing = db.prepare('SELECT * FROM devices WHERE serial = ?').get(serial);
  if (existing && existing.owner_id !== req.user.id) {
    return res.status(409).json({ error: 'מכשיר זה כבר רשום לחשבון אחר' });
  }
  if (!existing) {
    const count = db.prepare('SELECT COUNT(*) c FROM devices WHERE owner_id = ?').get(req.user.id).c;
    if (count >= req.user.device_limit) {
      return res.status(403).json({ error: 'הגעת למכסת המכשירים המותרת בחשבון' });
    }
  }

  const token = deviceTokenGen();
  const now = new Date().toISOString();
  let device;
  if (existing) {
    db.prepare('UPDATE devices SET device_token = ?, name = COALESCE(?, name), home_url = ?, allowed_host = ?, idle_return_seconds = ?, last_seen = ? WHERE id = ?')
      .run(token, enr.name, enr.home_url, enr.allowed_host, enr.idle_return_seconds ?? 0, now, existing.id);
    device = db.prepare('SELECT * FROM devices WHERE id = ?').get(existing.id);
  } else {
    const info = db.prepare(`INSERT INTO devices (owner_id, serial, name, device_token, allowed_host, home_url, idle_return_seconds, last_seen, access_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(req.user.id, serial, enr.name || `מכשיר ${serial.slice(-4)}`, token, enr.allowed_host, enr.home_url, enr.idle_return_seconds ?? 0, now, nextAccessCode());
    device = db.prepare('SELECT * FROM devices WHERE id = ?').get(info.lastInsertRowid);
  }

  db.prepare('UPDATE enrollments SET used = 1, device_id = ? WHERE id = ?').run(device.id, enr.id);
  logEvent(device.id, req.user.id, 'enrolled_offline_usb', `serial=${serial}`);
  notifyConsolesOfDevice(device, {});

  let script;
  try {
    script = buildUsbOfflineScript({
      serial, deviceToken: token, deviceName: device.name, homeUrl: device.home_url, allowedHost: device.allowed_host,
      idleReturnSeconds: device.idle_return_seconds, adminCode: device.exit_code || '',
      displayZoomPercent: device.display_zoom_percent, approvedClients: approvedClientsForDevice(device.id),
    });
  } catch (e) {
    // Device row is already provisioned at this point (matching how a
    // network re-enroll would have also already rotated the token before
    // any response is sent) — only reachable if home_url is somehow still
    // missing, which the enrollment-creation route already prevents.
    return res.status(400).json({ error: e.message });
  }
  res.setHeader('Content-Disposition', `attachment; filename="kioskfleet-offline-${serial}.sh"`);
  res.type('text/plain; charset=utf-8').send(script);
});

function publicDevice(d) {
  return {
    id: d.id, name: d.name, serial: d.serial, ownerId: d.owner_id, ownerName: d.owner_name,
    allowedHost: d.allowed_host, homeUrl: d.home_url, idleReturnSeconds: d.idle_return_seconds,
    status: d.status, online: !!d.online,
    lastSeen: d.last_seen, appVersion: d.app_version, battery: d.battery, model: d.model,
    androidVer: d.android_ver, ip: d.ip, createdAt: d.created_at, exitCode: d.exit_code || '',
    lastScreenshotAt: d.last_screenshot_at || null,
    displayZoomPercent: d.display_zoom_percent ?? 100,
    scheduleEnabled: !!d.schedule_enabled, scheduleOpenTime: d.schedule_open_time || '',
    scheduleCloseTime: d.schedule_close_time || '',
    signageEnabled: !!d.signage_enabled, signageUrls: d.signage_urls || '',
    signageIntervalSeconds: d.signage_interval_seconds ?? 15,
    maintenanceEnabled: !!d.maintenance_enabled, maintenanceMessage: d.maintenance_message || '',
    accessCode: d.access_code || '',
  };
}

// KIOSK_BUILD.md §2★ז: an owner who suspects their launcher code leaked
// (e.g. shared over an unencrypted channel to a technician) can rotate it
// without touching device_token or any other field — same "rotate this one
// secret, leave everything else alone" shape re-enrolling already gives
// device_token. The old code stops resolving at GET /api/public/launcher/:code
// the instant this commits, since that route looks the row up by access_code.
router.post('/devices/:id/access-code/regenerate', requireAuth, (req, res) => {
  const { device, error } = getOwnedDevice(req, req.params.id);
  if (error) return res.sendStatus(error);
  const code = nextAccessCode();
  db.prepare('UPDATE devices SET access_code = ? WHERE id = ?').run(code, device.id);
  logEvent(device.id, req.user.id, 'access_code_regenerated', null);
  res.json({ accessCode: code });
});

export default router;
