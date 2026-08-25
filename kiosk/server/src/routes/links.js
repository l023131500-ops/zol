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
  const nameCheck = validateName(name, 'שם הקישור');
  if (!nameCheck.ok) return res.status(400).json({ error: nameCheck.error });
  const cleanName = nameCheck.value || '';
  if (!cleanName || !url) return res.status(400).json({ error: 'נדרשים שם וכתובת קישור' });
  const checked = normalizeHomeUrl(url);
  if (!checked.ok || !checked.value) {
    return res.status(400).json({
      error: checked.reason === 'scheme' ? 'הקישור חייב להתחיל ב-http:// או ב-https://' : 'כתובת קישור לא תקינה',
    });
  }
  const cleanUrl = checked.value;
  const hosts = hostsForUrl(cleanUrl, allowedHost);
  const info = db.prepare('INSERT INTO links (owner_id, name, url, allowed_host) VALUES (?, ?, ?, ?)')
    .run(req.user.id, cleanName, cleanUrl, hosts);
  logEvent(null, req.user.id, 'link_created', name);
  res.json({ link: db.prepare('SELECT id, name, url, allowed_host, created_at FROM links WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/links/:id', requireAuth, (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE id = ?').get(req.params.id);
  if (!link || link.owner_id !== req.user.id) return res.sendStatus(404);
  const { name, url, allowedHost } = req.body || {};
  const nameCheck = validateName(name, 'שם הקישור');
  if (!nameCheck.ok) return res.status(400).json({ error: nameCheck.error });
  const newName = nameCheck.value;
  // PATCH used to store `url` completely unvalidated — the one door onto the
  // library that checked nothing at all, not even the accidental host-only
  // guard POST /links had.
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
    .run(newName ?? null, newUrl, hosts, link.id);
  res.json({ link: db.prepare('SELECT id, name, url, allowed_host, created_at FROM links WHERE id = ?').get(link.id) });
});

router.delete('/links/:id', requireAuth, (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE id = ?').get(req.params.id);
  if (!link || link.owner_id !== req.user.id) return res.sendStatus(404);
  db.prepare('DELETE FROM links WHERE id = ?').run(link.id);
  res.json({ ok: true });
});

export default router;
