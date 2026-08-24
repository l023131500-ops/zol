import express from 'express';
import { customAlphabet } from 'nanoid';
import { db, logEvent, approvedClientsForDevice } from '../db.js';
import { requireAuth } from '../auth.js';
import { issueCommand, COMMAND_TYPES } from '../commands.js';
import { notifyConsolesOfDevice } from '../hub.js';
import { hostsForUrl, hostAllowed, normalizeHostCsv, parseHosts } from '../hosts.js';
import { validateExitCode } from '../exitcode.js';
import { clampZoomPercent } from '../display.js';
import { validateScheduleWindow } from '../schedule.js';
import { validateSignagePlaylist, validateSignageInterval } from '../signage.js';

// Rebuilt and pushed on every write that can change what a device's own
// selection screen should offer (KIOSK_BUILD.md §2★ה) — approving/revoking a
// client, same as editing homeUrl/allowedHost/zoom already does via
// update_config below. Kept in one place so the command payload's shape
// cannot drift between the two call sites.
function pushConfigUpdate(device, userId) {
  issueCommand(device, 'update_config', {
    homeUrl: device.home_url, allowedHost: device.allowed_host, idleReturnSeconds: device.idle_return_seconds,
    adminCode: device.exit_code || '', displayZoomPercent: device.display_zoom_percent,
    approvedClients: approvedClientsForDevice(device.id),
    signageEnabled: !!device.signage_enabled, signageUrls: device.signage_urls || '',
    signageIntervalSeconds: device.signage_interval_seconds,
  }, userId ?? null);
}

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
  let { name, homeUrl, allowedHost, idleReturnSeconds, linkId, exitCode, displayZoomPercent,
        scheduleEnabled, scheduleOpenTime, scheduleCloseTime,
        signageEnabled, signageUrls, signageIntervalSeconds } = req.body || {};

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

  // KIOSK_BUILD.md §9 "תזמון": only validated when the caller actually touches
  // one of the three schedule fields — an edit to, say, just the name must not
  // start requiring open/close times on a device that never had a schedule.
  // Enabling always re-validates against whichever open/close ends up in
  // effect (the new value if sent, else the device's existing one), so a
  // request that flips scheduleEnabled=true without resending times an owner
  // already saved earlier cannot skip the check.
  let scheduleValues = null;
  if (scheduleEnabled !== undefined || scheduleOpenTime !== undefined || scheduleCloseTime !== undefined) {
    const enabled = !!scheduleEnabled;
    const openTime = scheduleOpenTime !== undefined ? scheduleOpenTime : device.schedule_open_time;
    const closeTime = scheduleCloseTime !== undefined ? scheduleCloseTime : device.schedule_close_time;
    if (enabled) {
      const v = validateScheduleWindow(openTime, closeTime);
      if (!v.ok) return res.status(400).json({ error: v.error });
    }
    scheduleValues = { enabled: enabled ? 1 : 0, openTime: openTime || null, closeTime: closeTime || null };
  }

  // KIOSK_BUILD.md §9 "מצב תצוגה": same conditional-validation shape as
  // scheduleValues above — only checked when the caller actually touches one
  // of the three signage fields, re-validated against whichever playlist/
  // interval ends up in effect (new value if sent, else the device's
  // existing one) so `signageEnabled=true` alone, reusing a playlist saved
  // earlier, still gets checked.
  let signageValues = null;
  if (signageEnabled !== undefined || signageUrls !== undefined || signageIntervalSeconds !== undefined) {
    const enabled = !!signageEnabled;
    const urls = signageUrls !== undefined ? signageUrls : device.signage_urls;
    const intervalSeconds = signageIntervalSeconds !== undefined ? signageIntervalSeconds : device.signage_interval_seconds;
    let urlsValue = urls || null;
    let intervalValue = intervalSeconds;
    if (enabled) {
      const v = validateSignagePlaylist(urls);
      if (!v.ok) return res.status(400).json({ error: v.error });
      const vi = validateSignageInterval(intervalSeconds);
      if (!vi.ok) return res.status(400).json({ error: vi.error });
      urlsValue = v.urls.join('\n');
      intervalValue = vi.seconds;
    }
    signageValues = { enabled: enabled ? 1 : 0, urls: urlsValue, intervalSeconds: intervalValue };
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
     exit_code = COALESCE(?, exit_code), display_zoom_percent = COALESCE(?, display_zoom_percent),
     schedule_enabled = COALESCE(?, schedule_enabled), schedule_open_time = COALESCE(?, schedule_open_time),
     schedule_close_time = COALESCE(?, schedule_close_time),
     schedule_last_state = CASE WHEN ? = 1 THEN NULL ELSE schedule_last_state END,
     signage_enabled = COALESCE(?, signage_enabled), signage_urls = COALESCE(?, signage_urls),
     signage_interval_seconds = COALESCE(?, signage_interval_seconds) WHERE id = ?`)
    .run(name ?? null, homeUrl ?? null, allowedHost ?? null,
         idleReturnSeconds != null ? Math.max(0, Number(idleReturnSeconds)) : null,
         exitCodeValue,
         displayZoomPercent != null ? clampZoomPercent(displayZoomPercent) : null,
         scheduleValues ? scheduleValues.enabled : null,
         scheduleValues ? scheduleValues.openTime : null,
         scheduleValues ? scheduleValues.closeTime : null,
         scheduleValues ? 1 : 0,
         signageValues ? signageValues.enabled : null,
         signageValues ? signageValues.urls : null,
         signageValues ? signageValues.intervalSeconds : null,
         device.id);
  const fresh = db.prepare('SELECT * FROM devices WHERE id = ?').get(device.id);
  logEvent(device.id, req.user.id, 'config_update', null);
  notifyConsolesOfDevice(fresh, {});
  // Tell the device to re-pull its config (URL, hosts, idle-return, admin
  // code, zoom, approved clients) live. Every field is sent on every
  // update_config, not only when it changed here — the same command already
  // carries the other fields unconditionally, and the agent only ever writes
  // what it is sent.
  pushConfigUpdate(fresh, req.user.id);
  res.json({ device: publicDevice(fresh) });
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
  };
}

export default router;
