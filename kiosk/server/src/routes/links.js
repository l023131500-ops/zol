import express from 'express';
import { db, logEvent } from '../db.js';
import { requireAuth } from '../auth.js';
import { hostsForUrl, normalizeHostCsv, normalizeHomeUrl } from '../hosts.js';
import { validateName } from '../names.js';

// The per-customer link library: named event/venue links to lock devices onto.
const router = express.Router();

router.get('/links', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, name, url, allowed_host, created_at FROM links WHERE owner_id = ? ORDER BY id DESC').all(req.user.id);
  res.json({ links: rows });
});

// This library is the *source* both device routes (routes/devices.js's
// enrollment/PATCH `linkId` path) copy `url` from into a device's `home_url`
// — the address the kiosk WebView actually loads. A host-only check here
// used to let `javascript://x` through (`new URL('javascript://x').host` is
// non-empty, so a bare "is there a host" test passes it by accident), which
// made this the one door that could put a script URL into the library for a
// device to pick up later. normalizeHomeUrl (hosts.js) requires http(s).
router.post('/links', requireAuth, (req, res) => {
  const { name, url, allowedHost } = req.body || {};
  // `name` used to go straight into `String(name).trim()` — never throws, but
  // silently stores "[object Object]" for a non-string value instead of
  // rejecting it, the same gap PATCH below had as a hard crash (names.js).
  const nameCheck = validateName(name, 'שם הקישור');
  if (!nameCheck.ok) return res.status(400).json({ error: nameCheck.error });
  if (!nameCheck.value || !url) return res.status(400).json({ error: 'נדרשים שם וכתובת קישור' });
  const checked = normalizeHomeUrl(url);
  if (!checked.ok || !checked.value) {
    return res.status(400).json({
      error: checked.reason === 'scheme' ? 'הקישור חייב להתחיל ב-http:// או ב-https://' : 'כתובת קישור לא תקינה',
    });
  }
  const cleanUrl = checked.value;
  const hosts = hostsForUrl(cleanUrl, allowedHost);
  const info = db.prepare('INSERT INTO links (owner_id, name, url, allowed_host) VALUES (?, ?, ?, ?)')
    .run(req.user.id, nameCheck.value, cleanUrl, hosts);
  logEvent(null, req.user.id, 'link_created', name);
  res.json({ link: db.prepare('SELECT id, name, url, allowed_host, created_at FROM links WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/links/:id', requireAuth, (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE id = ?').get(req.params.id);
  if (!link || link.owner_id !== req.user.id) return res.sendStatus(404);
  const { name, url, allowedHost } = req.body || {};
  // PATCH used to store `url` completely unvalidated — the one door onto the
  // library that checked nothing at all, not even the accidental host-only
  // guard POST /links had.
  //
  // `name` had its own, separate gap: it went straight from req.body into
  // `name ?? null` at the bottom of this route with no type check — an
  // object/array/boolean value reaches better-sqlite3's bind and crashes
  // with a raw 500 instead of a clean 400 (names.js; reproduced live).
  const nameCheck = validateName(name, 'שם הקישור');
  if (!nameCheck.ok) return res.status(400).json({ error: nameCheck.error });
  let newUrl = link.url;
  if (url) {
    const checked = normalizeHomeUrl(url);
    if (!checked.ok || !checked.value) {
      return res.status(400).json({
        error: checked.reason === 'scheme' ? 'הקישור חייב להתחיל ב-http:// או ב-https://' : 'כתובת קישור לא תקינה',
      });
    }
    newUrl = checked.value;
  }
  const hosts = allowedHost != null || url ? hostsForUrl(newUrl, allowedHost ?? link.allowed_host) : link.allowed_host;
  db.prepare('UPDATE links SET name = COALESCE(?, name), url = ?, allowed_host = ? WHERE id = ?')
    .run(nameCheck.value ?? null, newUrl, hosts, link.id);
  res.json({ link: db.prepare('SELECT id, name, url, allowed_host, created_at FROM links WHERE id = ?').get(link.id) });
});

router.delete('/links/:id', requireAuth, (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE id = ?').get(req.params.id);
  if (!link || link.owner_id !== req.user.id) return res.sendStatus(404);
  db.prepare('DELETE FROM links WHERE id = ?').run(link.id);
  res.json({ ok: true });
});

export default router;
