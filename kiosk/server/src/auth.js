import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { db } from './db.js';

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 12);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

export function signToken(user) {
  return jwt.sign(
    { uid: user.id, role: user.role, username: user.username },
    config.jwtSecret,
    { expiresIn: '12h' }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

function readToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies && req.cookies.kf_token) return req.cookies.kf_token;
  return null;
}

// Middleware: require a valid dashboard session (any active user).
export function requireAuth(req, res, next) {
  const decoded = verifyToken(readToken(req));
  if (!decoded) return res.status(401).json({ error: 'לא מחובר' });
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(decoded.uid);
  if (!user) return res.status(401).json({ error: 'חשבון לא פעיל' });
  req.user = user;
  next();
}

// Middleware: require super-admin role.
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'נדרשת הרשאת מנהל-על' });
    next();
  });
}
