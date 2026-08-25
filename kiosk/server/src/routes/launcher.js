import express from 'express';
import rateLimit from 'express-rate-limit';
import { db, logEvent, approvedClientsForDevice } from '../db.js';
import { normalizeAccessCode } from '../accesscode.js';

// KIOSK_BUILD.md §2★ז: "the concrete implementation of the 'selection
// screen' from §2★ד/ה" — a technician (or the owner themselves) opens
// GET /k/:code in any ordinary browser, no login and no device_token, and
// sees exactly the same approved client/link list §2★ה's on-device switch
// already shows a locked device — useful before a device is ever locked
// (previewing what a code will show), from a phone while standing at a
// venue, or as the URL a Route C (Windows) browser-kiosk locks straight to
// instead of one specific client's site. Public by design (that is the
// entire point of the feature), so every response here is deliberately as
// small as approvedClientsForDevice() already is for the on-device payload:
// no serial, no owner id, no device_token, nothing beyond what the picker
// needs to render.
const router = express.Router();

// Same reasoning as routes/agent.js's enrollLimiter: a 6-char code from a
// 33-symbol alphabet is only actually hard to guess if nothing lets a caller
// sweep the space for free. Keyed by IP, same shape — a real technician
// tries their one real code once.
const launcherLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי ניסיונות. נסו שוב בעוד מספר דקות.' },
});

router.get('/launcher/:code', launcherLimiter, (req, res) => {
  const code = normalizeAccessCode(req.params.code);
  if (!code) return res.status(400).json({ error: 'קוד לא תקין' });
  const device = db.prepare('SELECT id, name FROM devices WHERE access_code = ?').get(code);
  if (!device) return res.status(404).json({ error: 'קוד לא נמצא' });
  const items = approvedClientsForDevice(device.id).map((c) => ({
    code: c.code, name: c.name, url: c.url, logoUrl: c.logoUrl || '', brandColor: c.brandColor || '',
  }));
  logEvent(device.id, null, 'launcher_opened', null);
  res.json({ deviceName: device.name, items });
});

export default router;
