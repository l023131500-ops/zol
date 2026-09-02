import express from 'express';
import { db, logEvent } from '../db.js';
import { requireAuth } from '../auth.js';
import { applyDevicePolicy } from '../policy.js';
import { buildTemplateFields, policyPatchFromTemplate, templateColumns } from '../templatepolicy.js';
import { isValidRowId } from '../inputguard.js';

// KIOSK_BUILD.md §8 "קבוצות/תבניות: להחיל מדיניות על קבוצת מכשירים בבת אחת" —
// a saved policy an owner applies to many of their own devices at once,
// instead of repeating the same allow-list/schedule/signage/zoom edit across
// each device's own PATCH /devices/:id. Owner-scoped, same as links.js/
// clients.js: a template belonging to another owner answers 404, not 403
// (routes/devices.js's getOwnedDevice comment explains why that distinction
// matters for a resource id an authenticated caller could otherwise probe).
const router = express.Router();

function publicTemplate(t) {
  return {
    id: t.id, name: t.name, createdAt: t.created_at,
    homeUrl: t.home_url, allowedHost: t.allowed_host,
    idleReturnSeconds: t.idle_return_seconds, exitCode: t.exit_code,
    displayZoomPercent: t.display_zoom_percent,
    scheduleEnabled: t.schedule_enabled == null ? null : !!t.schedule_enabled,
    scheduleOpenTime: t.schedule_open_time, scheduleCloseTime: t.schedule_close_time,
    signageEnabled: t.signage_enabled == null ? null : !!t.signage_enabled,
    signageUrls: t.signage_urls, signageIntervalSeconds: t.signage_interval_seconds,
    maintenanceEnabled: t.maintenance_enabled == null ? null : !!t.maintenance_enabled,
    maintenanceMessage: t.maintenance_message,
  };
}

function getOwnedTemplate(req) {
  const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
  if (!t || t.owner_id !== req.user.id) return { error: 404 };
  return { template: t };
}

router.get('/templates', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM templates WHERE owner_id = ? ORDER BY name').all(req.user.id);
  res.json({ templates: rows.map(publicTemplate) });
});

router.post('/templates', requireAuth, (req, res) => {
  const body = req.body || {};
  if (!String(body.name ?? '').trim()) return res.status(400).json({ error: 'נדרש שם לתבנית' });
  const { fields, error } = buildTemplateFields(body);
  if (error) return res.status(400).json({ error });
  const dup = db.prepare('SELECT id FROM templates WHERE owner_id = ? AND name = ?').get(req.user.id, fields.name);
  if (dup) return res.status(409).json({ error: 'תבנית בשם זה כבר קיימת' });
  const cols = templateColumns().filter((c) => c in fields);
  const info = db.prepare(
    `INSERT INTO templates (owner_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`
  ).run(req.user.id, ...cols.map((c) => fields[c]));
  logEvent(null, req.user.id, 'template_created', fields.name);
  res.json({ template: publicTemplate(db.prepare('SELECT * FROM templates WHERE id = ?').get(info.lastInsertRowid)) });
});

router.patch('/templates/:id', requireAuth, (req, res) => {
  const { template, error } = getOwnedTemplate(req);
  if (error) return res.sendStatus(error);
  const result = buildTemplateFields(req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  const cols = templateColumns().filter((c) => c in result.fields);
  if (!cols.length) return res.json({ template: publicTemplate(template) });
  if (result.fields.name && result.fields.name !== template.name) {
    const dup = db.prepare('SELECT id FROM templates WHERE owner_id = ? AND name = ? AND id != ?')
      .get(req.user.id, result.fields.name, template.id);
    if (dup) return res.status(409).json({ error: 'תבנית בשם זה כבר קיימת' });
  }
  db.prepare(`UPDATE templates SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
    .run(...cols.map((c) => result.fields[c]), template.id);
  res.json({ template: publicTemplate(db.prepare('SELECT * FROM templates WHERE id = ?').get(template.id)) });
});

router.delete('/templates/:id', requireAuth, (req, res) => {
  const { template, error } = getOwnedTemplate(req);
  if (error) return res.sendStatus(error);
  db.prepare('DELETE FROM templates WHERE id = ?').run(template.id);
  logEvent(null, req.user.id, 'template_deleted', template.name);
  res.json({ ok: true });
});

// Apply a template to a batch of the caller's own devices. Never all-or-
// nothing: a device id that does not exist, or belongs to someone else, is
// reported back in `skipped` rather than failing the whole request — an
// owner selecting "all devices" from a stale list should not lose every
// device's update because one was deleted a moment earlier.
router.post('/templates/:id/apply', requireAuth, (req, res) => {
  const { template, error } = getOwnedTemplate(req);
  if (error) return res.sendStatus(error);
  const { deviceIds } = req.body || {};
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
    return res.status(400).json({ error: 'בחרו לפחות מכשיר אחד' });
  }
  const patch = policyPatchFromTemplate(template);
  const applied = [];
  const skipped = [];
  for (const id of deviceIds) {
    // guardWriteBody (inputguard.js) exempts the `deviceIds` array itself
    // from its top-level scalar check purely because it is an array, not
    // because its own elements are exempt from validation — a malformed
    // element (an object, a boolean, `{"toString":...}`) would otherwise
    // reach the raw better-sqlite3 bind below and crash the whole request
    // with a 500, the same class of bug that check closes everywhere else.
    // Skipped like any other bad id, not fatal — this route's whole point is
    // "an owner selecting a stale/partly-wrong list should not lose every
    // device's update because one entry was bad."
    if (!isValidRowId(id)) { skipped.push(id); continue; }
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    if (!device || device.owner_id !== req.user.id) { skipped.push(id); continue; }
    const result = applyDevicePolicy(device, patch, req.user.id, `החלת תבנית "${template.name}"`);
    if (result.ok) {
      applied.push(id);
      logEvent(device.id, req.user.id, 'template_applied', template.name);
    } else {
      skipped.push(id);
    }
  }
  res.json({ applied, skipped });
});

export default router;
