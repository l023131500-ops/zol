import express from 'express';
import { db, logEvent } from '../db.js';
import { requireAuth } from '../auth.js';
import { hostsForUrl } from '../hosts.js';
import { normalizeClientCode } from '../clients.js';

// The owner's own customer directory (KIOSK_BUILD.md §2★ד): "מזהה לקוח" +
// a direct link + branded site per customer. Mirrors links.js's ownership
// pattern (a row belonging to another owner answers 404, not 403 — see
// routes/devices.js's getOwnedDevice() for why that distinction matters).
const router = express.Router();

function publicClient(c) {
  return { id: c.id, code: c.code, name: c.name, url: c.url, allowedHost: c.allowed_host, createdAt: c.created_at };
}

router.get('/clients', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM clients WHERE owner_id = ? ORDER BY name').all(req.user.id);
  res.json({ clients: rows.map(publicClient) });
});

router.post('/clients', requireAuth, (req, res) => {
  const { code, name, url, allowedHost } = req.body || {};
  const cleanCode = normalizeClientCode(code);
  if (!cleanCode) return res.status(400).json({ error: 'מזהה לקוח לא תקין — 2 עד 24 אותיות/ספרות' });
  if (!name || !url) return res.status(400).json({ error: 'נדרשים שם וכתובת אתר' });
  try { new URL(url); } catch { return res.status(400).json({ error: 'כתובת אתר לא תקינה' }); }
  const dup = db.prepare('SELECT id FROM clients WHERE owner_id = ? AND code = ?').get(req.user.id, cleanCode);
  if (dup) return res.status(409).json({ error: 'מזהה לקוח זה כבר קיים' });
  const hosts = hostsForUrl(url, allowedHost);
  const info = db.prepare('INSERT INTO clients (owner_id, code, name, url, allowed_host) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, cleanCode, String(name).trim(), String(url).trim(), hosts);
  logEvent(null, req.user.id, 'client_created', cleanCode);
  res.json({ client: publicClient(db.prepare('SELECT * FROM clients WHERE id = ?').get(info.lastInsertRowid)) });
});

router.patch('/clients/:id', requireAuth, (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client || client.owner_id !== req.user.id) return res.sendStatus(404);
  const { code, name, url, allowedHost } = req.body || {};
  let newCode = client.code;
  if (code !== undefined) {
    newCode = normalizeClientCode(code);
    if (!newCode) return res.status(400).json({ error: 'מזהה לקוח לא תקין — 2 עד 24 אותיות/ספרות' });
    const dup = db.prepare('SELECT id FROM clients WHERE owner_id = ? AND code = ? AND id != ?').get(req.user.id, newCode, client.id);
    if (dup) return res.status(409).json({ error: 'מזהה לקוח זה כבר קיים' });
  }
  const newUrl = url || client.url;
  if (url) { try { new URL(url); } catch { return res.status(400).json({ error: 'כתובת אתר לא תקינה' }); } }
  const hosts = allowedHost != null || url ? hostsForUrl(newUrl, allowedHost ?? client.allowed_host) : client.allowed_host;
  db.prepare('UPDATE clients SET code = ?, name = COALESCE(?, name), url = ?, allowed_host = ? WHERE id = ?')
    .run(newCode, name ?? null, newUrl, hosts, client.id);
  res.json({ client: publicClient(db.prepare('SELECT * FROM clients WHERE id = ?').get(client.id)) });
});

router.delete('/clients/:id', requireAuth, (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client || client.owner_id !== req.user.id) return res.sendStatus(404);
  db.prepare('DELETE FROM clients WHERE id = ?').run(client.id);
  logEvent(null, req.user.id, 'client_deleted', client.code);
  res.json({ ok: true });
});

export default router;
