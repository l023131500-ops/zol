import express from 'express';
import { db, logEvent } from '../db.js';
import { requireAuth } from '../auth.js';
import { hostsForUrl } from '../hosts.js';

// The per-customer link library: named event/venue links to lock devices onto.
const router = express.Router();

router.get('/links', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, name, url, allowed_host, created_at FROM links WHERE owner_id = ? ORDER BY id DESC').all(req.user.id);
  res.json({ links: rows });
});

router.post('/links', requireAuth, (req, res) => {
  const { name, url, allowedHost } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: 'נדרשים שם וכתובת קישור' });
  let host;
  try { host = new URL(url).host; } catch { return res.status(400).json({ error: 'כתובת קישור לא תקינה' }); }
  if (!host) return res.status(400).json({ error: 'כתובת קישור לא תקינה' });
  const hosts = hostsForUrl(url, allowedHost);
  const info = db.prepare('INSERT INTO links (owner_id, name, url, allowed_host) VALUES (?, ?, ?, ?)')
    .run(req.user.id, String(name).trim(), String(url).trim(), hosts);
  logEvent(null, req.user.id, 'link_created', name);
  res.json({ link: db.prepare('SELECT id, name, url, allowed_host, created_at FROM links WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/links/:id', requireAuth, (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE id = ?').get(req.params.id);
  if (!link || link.owner_id !== req.user.id) return res.sendStatus(404);
  const { name, url, allowedHost } = req.body || {};
  const newUrl = url || link.url;
  const hosts = allowedHost != null || url ? hostsForUrl(newUrl, allowedHost ?? link.allowed_host) : link.allowed_host;
  db.prepare('UPDATE links SET name = COALESCE(?, name), url = ?, allowed_host = ? WHERE id = ?')
    .run(name ?? null, newUrl, hosts, link.id);
  res.json({ link: db.prepare('SELECT id, name, url, allowed_host, created_at FROM links WHERE id = ?').get(link.id) });
});

router.delete('/links/:id', requireAuth, (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE id = ?').get(req.params.id);
  if (!link || link.owner_id !== req.user.id) return res.sendStatus(404);
  db.prepare('DELETE FROM links WHERE id = ?').run(link.id);
  res.json({ ok: true });
});

export default router;
