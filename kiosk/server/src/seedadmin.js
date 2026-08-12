/**
 * Bringing SEED_ADMIN_USER / SEED_ADMIN_PASSWORD into force on every boot.
 *
 * The original seed ran only against an empty database ("are there zero admins?
 * then make one"), which is the normal shape for a first-run bootstrap and the
 * wrong shape here. more30-priority §1ב fixes one admin credential across every
 * system — admin / More30Admin2026 — precisely so the owner can open any panel
 * and check it. Under create-if-empty that guarantee holds only for a database
 * nobody has touched: once a row exists under any password, the environment
 * variable stops meaning anything and the documented login fails, with the
 * server reporting a perfectly healthy boot.
 *
 * So the environment is the source of truth and the row is reconciled to it.
 * The cost is real and deliberate: an admin who changes their password through
 * /api/auth/change-password has it put back to SEED_ADMIN_PASSWORD on the next
 * restart. That is the trade §1ב asks for — a credential the owner can rely on
 * beats one a restart might have invalidated — and the way out is to change the
 * environment variable, which is where the answer is now kept.
 *
 * No database or crypto import here on purpose: the handle and the two password
 * functions are passed in, which is what lets this run against node:sqlite in
 * the tests (server/node_modules is not installed in this checkout, so
 * better-sqlite3 and bcryptjs cannot be loaded there) and keeps the reconcile
 * decisions readable on their own.
 */

/** Written only on a fresh insert — an existing row's name belongs to its owner. */
const SEED_FULL_NAME = 'מנהל מערכת';
const SEED_DEVICE_LIMIT = 9999;

/**
 * @returns {{action: 'created'|'updated'|'unchanged'|'skipped', changed: string[], reason?: string}}
 */
export function applySeedAdmin(db, { username, password, hashPassword, verifyPassword }) {
  const name = String(username ?? '').trim();
  if (!name || !password) return { action: 'skipped', changed: [], reason: 'no seed credentials configured' };

  const existing = db
    .prepare('SELECT id, password_hash, role, active FROM users WHERE username = ?')
    .get(name);

  if (!existing) {
    db.prepare(
      'INSERT INTO users (username, password_hash, full_name, role, device_limit) VALUES (?, ?, ?, ?, ?)'
    ).run(name, hashPassword(password), SEED_FULL_NAME, 'admin', SEED_DEVICE_LIMIT);
    return { action: 'created', changed: [] };
  }

  const changed = [];

  // Compared rather than rewritten: bcrypt salts every hash, so an unconditional
  // UPDATE would write a new row value on every boot and make the log say the
  // password was restored each time even when nothing had moved it.
  if (!verifyPassword(password, existing.password_hash)) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), existing.id);
    changed.push('password');
  }

  // A seed account demoted to 'user' can still log in, and then finds none of
  // the management it exists to reach — a failure that reads as a broken console
  // rather than a wrong role.
  if (existing.role !== 'admin') {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
    changed.push('role');
  }

  // requireAuth() rejects an inactive account after the password check passes,
  // so leaving this alone would answer the correct credential with "חשבון לא פעיל".
  if (Number(existing.active) !== 1) {
    db.prepare('UPDATE users SET active = 1 WHERE id = ?').run(existing.id);
    changed.push('active');
  }

  return { action: changed.length ? 'updated' : 'unchanged', changed };
}
