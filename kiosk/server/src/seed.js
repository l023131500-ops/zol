import { db } from './db.js';
import { config } from './config.js';
import { hashPassword } from './auth.js';

/** Create the first super-admin the first time the server starts. */
export function ensureSeed() {
  const admins = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin'").get().c;
  if (admins > 0) return;
  db.prepare('INSERT INTO users (username, password_hash, full_name, role, device_limit) VALUES (?, ?, ?, ?, ?)')
    .run(config.seedAdminUser, hashPassword(config.seedAdminPassword), 'מנהל מערכת', 'admin', 9999);
  console.log(`\n  ✔ נוצר מנהל-על ראשוני:  ${config.seedAdminUser}`);
  console.log(`    סיסמה: ${config.seedAdminPassword}  ← החלף אותה מיד לאחר ההתחברות!\n`);
}

// Allow "npm run seed" as a standalone entry point.
if (import.meta.url === `file://${process.argv[1]}`) ensureSeed();
