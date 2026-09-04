import express from 'express';
import { db, logEvent } from '../db.js';
import { requireAuth } from '../auth.js';
import { applyDevicePolicy, saveSnapshot } from '../policy.js';
import { patchFromSnapshot } from '../snapshots.js';

// KIOSK_BUILD.md §9 "גיבוי/שחזור מדיניות" — policy.js's applyDevicePolicy
// already backs up a device's pre-write state automatically on every policy
// change (see its `snapshotReason` param); this router is the read/restore
// half: list what has been saved, restore one, or bookmark the current state
// on demand ("שמור מצב נוכחי"). Restoring uses snapshots.js's
// patchFromSnapshot, not templatepolicy.js's policyPatchFromTemplate
// directly — see that function's own comment for why a snapshot's NULL
// exit_code must clear the device's code on restore, unlike a template's.
const router = express.Router();

// Same ownership shape as routes/devices.js's getOwnedDevice — a device
// belonging to another customer answers 404, not 403, for the same
// enumeration-resistance reason documented there.
function getOwnedDevice(req) {
  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  if (!device || (req.user.role !== 'admin' && device.owner_id !== req.user.id)) return { error: 404 };
  return { device };
}

function publicSnapshot(s) {
  return {
    id: s.id, reason: s.reason || '', createdAt: s.created_at,
    homeUrl: s.home_url, allowedHost: s.allowed_host,
    scheduleEnabled: !!s.schedule_enabled, signageEnabled: !!s.signage_enabled,
  };
}

router.get('/devices/:id/snapshots', requireAuth, (req, res) => {
  const { device, error } = getOwnedDevice(req);
  if (error) return res.sendStatus(error);
  const rows = db.prepare(
    'SELECT * FROM policy_snapshots WHERE device_id = ? ORDER BY id DESC LIMIT 20'
  ).all(device.id);
  res.json({ snapshots: rows.map(publicSnapshot) });
});

// A deliberate bookmark of the device's current state — distinct from the
// automatic pre-write backups saveSnapshot also takes inside
// applyDevicePolicy, but the exact same table/cap/restore path, so "save now,
// experiment, restore" works with no separate code path to keep in sync.
router.post('/devices/:id/snapshots', requireAuth, (req, res) => {
  const { device, error } = getOwnedDevice(req);
  if (error) return res.sendStatus(error);
  const label = String(req.body?.label ?? '').trim().slice(0, 200);
  saveSnapshot(device, label || 'גיבוי ידני', req.user.id);
  logEvent(device.id, req.user.id, 'snapshot_saved', label || null);
  const rows = db.prepare(
    'SELECT * FROM policy_snapshots WHERE device_id = ? ORDER BY id DESC LIMIT 20'
  ).all(device.id);
  res.json({ snapshots: rows.map(publicSnapshot) });
});

router.post('/devices/:id/snapshots/:snapshotId/restore', requireAuth, (req, res) => {
  const { device, error } = getOwnedDevice(req);
  if (error) return res.sendStatus(error);
  // A snapshot belonging to another device (even one the same owner also
  // owns) is out of scope here — the same "id must match the parent it was
  // fetched under" boundary getOwnedDevice already enforces for the device
  // itself, so a snapshot id cannot be replayed onto the wrong device.
  const snap = db.prepare(
    'SELECT * FROM policy_snapshots WHERE id = ? AND device_id = ?'
  ).get(req.params.snapshotId, device.id);
  if (!snap) return res.sendStatus(404);
  const patch = patchFromSnapshot(snap);
  const result = applyDevicePolicy(device, patch, req.user.id, `שחזור מגיבוי #${snap.id}`);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  logEvent(device.id, req.user.id, 'snapshot_restored', String(snap.id));
  res.json({ ok: true });
});

export default router;
