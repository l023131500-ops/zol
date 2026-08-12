import { db } from './db.js';
import { config } from './config.js';
import { hashPassword, verifyPassword } from './auth.js';
import { applySeedAdmin } from './seedadmin.js';

/**
 * Reconcile the super-admin to SEED_ADMIN_USER / SEED_ADMIN_PASSWORD on every
 * start — not only the first one. The reasoning, and what it costs, is in
 * seedadmin.js; this half is the wiring and the log line.
 */
export function ensureSeed() {
  const result = applySeedAdmin(db, {
    username: config.seedAdminUser,
    password: config.seedAdminPassword,
    hashPassword,
    verifyPassword,
  });

  switch (result.action) {
    case 'created':
      console.log(`\n  ✔ נוצר מנהל-על ראשוני:  ${config.seedAdminUser}`);
      console.log(`    סיסמה: מ-SEED_ADMIN_PASSWORD\n`);
      break;
    case 'updated':
      // Worth a line of its own: this is the boot that changed a credential
      // someone may have set by hand, and the only place it is visible.
      console.log(
        `  seed: מנהל-העל ${config.seedAdminUser} סונכרן מ-SEED_ADMIN_* (${result.changed.join(', ')})`
      );
      break;
    case 'skipped':
      console.log(`  seed: לא הוגדרו SEED_ADMIN_* — דילוג (${result.reason})`);
      break;
    default:
      break; // unchanged — the common case, and silence is the right report
  }

  return result;
}

// Allow "npm run seed" as a standalone entry point.
if (import.meta.url === `file://${process.argv[1]}`) ensureSeed();
