import express from 'express';
import rateLimit from 'express-rate-limit';
import { db, logEvent } from '../db.js';
import { signToken, verifyPassword, hashPassword, requireAuth } from '../auth.js';
import { config } from '../config.js';
import { validateUsername, validatePassword, requireNonEmptyString } from '../credentials.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי ניסיונות התחברות. נסה שוב בעוד מספר דקות.' },
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const nameCheck = validateUsername(username);
  const passCheck = requireNonEmptyString(password, 'סיסמה');
  if (!nameCheck.ok || !passCheck.ok) return res.status(400).json({ error: 'נדרשים שם משתמש וסיסמה' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(nameCheck.value);
  if (!user || !user.active || !verifyPassword(passCheck.value, user.password_hash)) {
    return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
  }

  const token = signToken(user);
  logEvent(null, user.id, 'login', nameCheck.value);
  res.cookie('kf_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: 12 * 60 * 60 * 1000,
  });
  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, fullName: user.full_name, deviceLimit: user.device_limit },
  });
});

router.post('/logout', (req, res) => {
  res.clearCookie('kf_token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const u = req.user;
  const used = db.prepare('SELECT COUNT(*) c FROM devices WHERE owner_id = ?').get(u.id).c;
  res.json({
    user: {
      id: u.id, username: u.username, role: u.role, fullName: u.full_name,
      deviceLimit: u.device_limit, devicesUsed: used,
    },
  });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const newCheck = validatePassword(newPassword, { label: 'סיסמה חדשה' });
  if (!newCheck.ok) return res.status(400).json({ error: newCheck.error });
  const curCheck = requireNonEmptyString(currentPassword, 'סיסמה נוכחית');
  if (!curCheck.ok || !verifyPassword(curCheck.value, req.user.password_hash))
    return res.status(403).json({ error: 'הסיסמה הנוכחית שגויה' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newCheck.value), req.user.id);
  logEvent(null, req.user.id, 'password_change', null);
  res.json({ ok: true });
});

export default router;
