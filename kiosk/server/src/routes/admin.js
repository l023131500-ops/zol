import express from 'express';
import { db, logEvent } from '../db.js';
import { requireAdmin, hashPassword } from '../auth.js';

// Super-admin only. Manage customer accounts and see the whole fleet.
const router = express.Router();

router.get('/stats', requireAdmin, (req, res) => {
  const users = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'user'").get().c;
  const devices = db.prepare('SELECT COUNT(*) c FROM devices').get().c;
  const online = db.prepare('SELECT COUNT(*) c FROM devices WHERE online = 1').get().c;
  res.json({ stats: { users, devices, online, offline: devices - online } });
});

router.get('/users', requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT u.id, u.username, u.full_name, u.role, u.device_limit, u.active, u.created_at,
      (SELECT COUNT(*) FROM devices d WHERE d.owner_id = u.id) AS devices_used
    FROM users u ORDER BY u.id`).all();
  res.json({ users: rows });
});

router.post('/users', requireAdmin, (req, res) => {
  const { username, password, fullName, deviceLimit, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'נדרשים שם משתמש וסיסמה' });
  if (password.length < 8) return res.status(400).json({ error: 'סיסמה חייבת להיות באורך 8 תווים לפחות' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username))
    return res.status(409).json({ error: 'שם המשתמש כבר קיים' });
  const info = db.prepare('INSERT INTO users (username, password_hash, full_name, role, device_limit) VALUES (?, ?, ?, ?, ?)')
    .run(String(username).trim(), hashPassword(password), fullName || null,
         role === 'admin' ? 'admin' : 'user', Math.max(1, Number(deviceLimit) || 1));
  logEvent(null, req.user.id, 'user_created', username);
  res.json({ user: db.prepare('SELECT id, username, full_name, role, device_limit, active FROM users WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/users/:id', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.sendStatus(404);
  const { fullName, deviceLimit, active, role } = req.body || {};
  db.prepare('UPDATE users SET full_name = COALESCE(?, full_name), device_limit = COALESCE(?, device_limit), active = COALESCE(?, active), role = COALESCE(?, role) WHERE id = ?')
    .run(fullName ?? null, deviceLimit != null ? Math.max(1, Number(deviceLimit)) : null,
         active != null ? (active ? 1 : 0) : null,
         role ? (role === 'admin' ? 'admin' : 'user') : null, user.id);
  logEvent(null, req.user.id, 'user_updated', user.username);
  res.json({ user: db.prepare('SELECT id, username, full_name, role, device_limit, active FROM users WHERE id = ?').get(user.id) });
});

router.post('/users/:id/reset-password', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.sendStatus(404);
  const { password } = req.body || {};
  if (!password || password.length < 8) return res.status(400).json({ error: 'סיסמה חייבת להיות 8 תווים לפחות' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
  logEvent(null, req.user.id, 'password_reset', user.username);
  res.json({ ok: true });
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.sendStatus(404);
  if (user.id === req.user.id) return res.status(400).json({ error: 'לא ניתן למחוק את החשבון שלך' });
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  logEvent(null, req.user.id, 'user_deleted', user.username);
  res.json({ ok: true });
});

export default router;
