/**
 * The seed admin (more30-priority §1ב).
 *
 * These are behaviour tests about one question the owner asks: "does
 * admin / More30Admin2026 open this console today?" Every case below is a
 * database state that used to answer "no" while the boot log said the server
 * had started cleanly.
 *
 * Driven against node's own `node:sqlite` with the same users DDL as
 * `src/db.js` — `server/node_modules` is not installed in this checkout, so
 * better-sqlite3 and bcryptjs cannot be loaded (same reason as
 * approvals.test.mjs). The password functions are the injected pair, standing
 * in for bcrypt; `applySeedAdmin` never calls them itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { applySeedAdmin } from '../src/seedadmin.js';

const DDL = `
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  role          TEXT NOT NULL DEFAULT 'user',
  device_limit  INTEGER NOT NULL DEFAULT 1,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// A stand-in for bcrypt: distinct hashes for distinct passwords, and a verify
// that only accepts its own. Salting is not modelled because nothing here
// depends on it — see the note on the "no write when it already matches" test.
const hashPassword = (plain) => `h:${plain}`;
const verifyPassword = (plain, hash) => hash === `h:${plain}`;

const SEED = { username: 'admin', password: 'More30Admin2026', hashPassword, verifyPassword };

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(DDL);
  return db;
}

function addUser(db, { username, password, role = 'user', active = 1 }) {
  db.prepare(
    'INSERT INTO users (username, password_hash, full_name, role, device_limit, active) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(username, hashPassword(password), username, role, 1, active);
}

const readUser = (db, username) =>
  db.prepare('SELECT * FROM users WHERE username = ?').get(username);

/** What the login route does: username, active flag and password, in that order. */
const canLogIn = (db, username, password) => {
  const u = readUser(db, username);
  return Boolean(u && Number(u.active) === 1 && verifyPassword(password, u.password_hash));
};

test('an empty database gets the seed admin', () => {
  const db = freshDb();
  const result = applySeedAdmin(db, SEED);

  assert.equal(result.action, 'created');
  assert.ok(canLogIn(db, 'admin', 'More30Admin2026'));
  const u = readUser(db, 'admin');
  assert.equal(u.role, 'admin');
  assert.equal(u.device_limit, 9999);
});

test('an admin that already exists under a different password is put back to SEED_ADMIN_PASSWORD', () => {
  // The regression this whole change exists for. Under create-if-empty the row
  // below made the seed a no-op, and the documented credential simply did not
  // work — with nothing in the log to say so.
  const db = freshDb();
  addUser(db, { username: 'admin', password: 'admin1234', role: 'admin' });

  const result = applySeedAdmin(db, SEED);

  assert.equal(result.action, 'updated');
  assert.deepEqual(result.changed, ['password']);
  assert.ok(canLogIn(db, 'admin', 'More30Admin2026'));
  assert.equal(canLogIn(db, 'admin', 'admin1234'), false);
});

test('a seed account demoted or deactivated is restored, not only its password', () => {
  // Both of these pass the password check and still refuse the console:
  // requireAdmin() answers 403 for the role, requireAuth() 401 for the flag.
  const db = freshDb();
  addUser(db, { username: 'admin', password: 'More30Admin2026', role: 'user', active: 0 });

  const result = applySeedAdmin(db, SEED);

  assert.equal(result.action, 'updated');
  assert.deepEqual(result.changed.sort(), ['active', 'role']);
  const u = readUser(db, 'admin');
  assert.equal(u.role, 'admin');
  assert.equal(Number(u.active), 1);
  assert.ok(canLogIn(db, 'admin', 'More30Admin2026'));
});

test('a matching row is left alone — no write, and one id, on every boot after the first', () => {
  // Not cosmetic: bcrypt salts, so an unconditional UPDATE would store a new
  // hash every restart and report the password as restored each time, hiding
  // the boot where something really had changed it.
  const db = freshDb();
  assert.equal(applySeedAdmin(db, SEED).action, 'created');
  const first = readUser(db, 'admin');

  for (let boot = 0; boot < 3; boot++) {
    const result = applySeedAdmin(db, SEED);
    assert.equal(result.action, 'unchanged');
    assert.deepEqual(result.changed, []);
  }

  assert.deepEqual(readUser(db, 'admin'), first);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM users').get().c, 1);
});

test('another admin already in the database does not stand in for the seed one', () => {
  // The old check counted admins of any name, so a fleet whose first admin was
  // created under a different username never got the documented login at all.
  const db = freshDb();
  addUser(db, { username: 'moshe', password: 'somethingelse', role: 'admin' });

  assert.equal(applySeedAdmin(db, SEED).action, 'created');

  assert.ok(canLogIn(db, 'admin', 'More30Admin2026'));
  // and the existing admin is untouched
  assert.ok(canLogIn(db, 'moshe', 'somethingelse'));
  assert.equal(readUser(db, 'moshe').role, 'admin');
});

test('SEED_ADMIN_USER is matched after trimming, so a stray space does not create a second admin', () => {
  // Railway variables are typed into a web form; ' admin' there would otherwise
  // insert a row no one can log in as, because the login route trims what the
  // browser sends.
  const db = freshDb();
  applySeedAdmin(db, SEED);

  const result = applySeedAdmin(db, { ...SEED, username: '  admin  ' });

  assert.equal(result.action, 'unchanged');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM users').get().c, 1);
});

test('no credentials configured means no row is written, and no crash', () => {
  // config.js defaults both, so this is reachable only if someone sets them
  // empty — in which case doing nothing beats seeding a blank-password admin.
  for (const missing of [{ username: '' }, { username: '   ' }, { password: '' }, { username: undefined }]) {
    const db = freshDb();
    const result = applySeedAdmin(db, { ...SEED, ...missing });
    assert.equal(result.action, 'skipped');
    assert.equal(db.prepare('SELECT COUNT(*) c FROM users').get().c, 0);
  }
});
