import express from 'express';
import { db, logEvent } from '../db.js';
import { requireAuth } from '../auth.js';
import { hostsForUrl, normalizeHomeUrl } from '../hosts.js';
import { normalizeClientCode, normalizeBrandColor, normalizeLogoUrl } from '../clients.js';
import { validateName } from '../names.js';

// The owner's own customer directory (KIOSK_BUILD.md §2★ד): "מזהה לקוח" +
// a direct link + branded site per customer. Mirrors links.js's ownership
// pattern (a row belonging to another owner answers 404, not 403 — see
// routes/devices.js's getOwnedDevice() for why that distinction matters).
const router = express.Router();

function publicClient(c) {
  return {
    id: c.id, code: c.code, name: c.name, url: c.url, allowedHost: c.allowed_host,
    logoUrl: c.logo_url || '', brandColor: c.brand_color || '', createdAt: c.created_at,
  };
}

router.get('/clients', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM clients WHERE owner_id = ? ORDER BY name').all(req.user.id);
  res.json({ clients: rows.map(publicClient) });
});

router.post('/clients', requireAuth, (req, res) => {
  const { code, name, url, allowedHost, logoUrl, brandColor } = req.body || {};
  const cleanCode = normalizeClientCode(code);
  if (!cleanCode) return res.status(400).json({ error: 'מזהה לקוח לא תקין — 2 עד 24 אותיות/ספרות' });
  // `name` used to go straight into `String(name).trim()` — never throws, but
  // silently stores "[object Object]" for a non-string value instead of
  // rejecting it, the same gap PATCH below had as a hard crash (names.js).
  const nameCheck = validateName(name, 'שם הלקוח');
  if (!nameCheck.ok) return res.status(400).json({ error: nameCheck.error });
  if (!nameCheck.value || !url) return res.status(400).json({ error: 'נדרשים שם וכתובת אתר' });
  // This is the "אתר תדמית" a device's WebView navigates to the moment
  // someone types this client's code in (routes/devices.js's GET
  // /devices/:id/clients hands `url` straight through) — the same
  // door-into-the-locked-WebView class as home_url (hosts.js), so it holds
  // the same http(s)-only bar, not the looser "does new URL() throw" check
  // that used to sit here (a `javascript:`/`data:` URL passes that silently).
  const checkedUrl = normalizeHomeUrl(url);
  if (!checkedUrl.ok || !checkedUrl.value) {
    return res.status(400).json({
      error: checkedUrl.reason === 'scheme' ? 'כתובת האתר חייבת להתחיל ב-http:// או ב-https://' : 'כתובת אתר לא תקינה',
    });
  }
  // KIOSK_BUILD.md §9 branding — both optional, so only a non-empty value
  // that fails validation is rejected; leaving the field blank is not an error.
  const cleanLogoUrl = normalizeLogoUrl(logoUrl);
  if (logoUrl && !cleanLogoUrl) return res.status(400).json({ error: 'כתובת לוגו לא תקינה' });
  const cleanBrandColor = normalizeBrandColor(brandColor);
  if (brandColor && !cleanBrandColor) return res.status(400).json({ error: 'צבע מותג לא תקין (למשל #2563eb)' });
  const dup = db.prepare('SELECT id FROM clients WHERE owner_id = ? AND code = ?').get(req.user.id, cleanCode);
  if (dup) return res.status(409).json({ error: 'מזהה לקוח זה כבר קיים' });
  const hosts = hostsForUrl(checkedUrl.value, allowedHost);
  const info = db.prepare(
    'INSERT INTO clients (owner_id, code, name, url, allowed_host, logo_url, brand_color) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, cleanCode, nameCheck.value, checkedUrl.value, hosts, cleanLogoUrl || null, cleanBrandColor || null);
  logEvent(null, req.user.id, 'client_created', cleanCode);
  res.json({ client: publicClient(db.prepare('SELECT * FROM clients WHERE id = ?').get(info.lastInsertRowid)) });
});

router.patch('/clients/:id', requireAuth, (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client || client.owner_id !== req.user.id) return res.sendStatus(404);
  const { code, name, url, allowedHost, logoUrl, brandColor } = req.body || {};
  // `name` used to go straight from req.body into `name ?? null` at the
  // bottom of this route with no type check — an object/array/boolean value
  // reaches better-sqlite3's bind and crashes with a raw 500 instead of a
  // clean 400 (names.js; reproduced live).
  const nameCheck = validateName(name, 'שם הלקוח');
  if (!nameCheck.ok) return res.status(400).json({ error: nameCheck.error });
  let newCode = client.code;
  if (code !== undefined) {
    newCode = normalizeClientCode(code);
    if (!newCode) return res.status(400).json({ error: 'מזהה לקוח לא תקין — 2 עד 24 אותיות/ספרות' });
    const dup = db.prepare('SELECT id FROM clients WHERE owner_id = ? AND code = ? AND id != ?').get(req.user.id, newCode, client.id);
    if (dup) return res.status(409).json({ error: 'מזהה לקוח זה כבר קיים' });
  }
  let newUrl = client.url;
  if (url) {
    const checkedUrl = normalizeHomeUrl(url);
    if (!checkedUrl.ok || !checkedUrl.value) {
      return res.status(400).json({
        error: checkedUrl.reason === 'scheme' ? 'כתובת האתר חייבת להתחיל ב-http:// או ב-https://' : 'כתובת אתר לא תקינה',
      });
    }
    newUrl = checkedUrl.value;
  }
  const hosts = allowedHost != null || url ? hostsForUrl(newUrl, allowedHost ?? client.allowed_host) : client.allowed_host;
  // Explicit '' clears the field (removes the logo/colour); undefined leaves it as-is.
  let newLogoUrl = client.logo_url;
  if (logoUrl !== undefined) {
    const cleanLogoUrl = normalizeLogoUrl(logoUrl);
    if (logoUrl && !cleanLogoUrl) return res.status(400).json({ error: 'כתובת לוגו לא תקינה' });
    newLogoUrl = cleanLogoUrl || null;
  }
  let newBrandColor = client.brand_color;
  if (brandColor !== undefined) {
    const cleanBrandColor = normalizeBrandColor(brandColor);
    if (brandColor && !cleanBrandColor) return res.status(400).json({ error: 'צבע מותג לא תקין (למשל #2563eb)' });
    newBrandColor = cleanBrandColor || null;
  }
  db.prepare('UPDATE clients SET code = ?, name = COALESCE(?, name), url = ?, allowed_host = ?, logo_url = ?, brand_color = ? WHERE id = ?')
    .run(newCode, nameCheck.value ?? null, newUrl, hosts, newLogoUrl, newBrandColor, client.id);
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
