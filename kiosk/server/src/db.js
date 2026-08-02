import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  role          TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin' (super-admin)
  device_limit  INTEGER NOT NULL DEFAULT 1,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devices (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  serial        TEXT UNIQUE NOT NULL,            -- hardware serial / android id
  name          TEXT,
  device_token  TEXT UNIQUE NOT NULL,            -- long-lived secret the agent sends
  allowed_host  TEXT,                            -- comma-separated hosts the kiosk may open (event + payment gateway)
  home_url      TEXT,                            -- the specific event/venue link the kiosk locks to
  idle_return_seconds INTEGER NOT NULL DEFAULT 0,-- 0 = off; else return to home_url after N idle seconds
  status        TEXT DEFAULT 'unknown',          -- last reported app status
  online        INTEGER NOT NULL DEFAULT 0,
  last_seen     TEXT,
  app_version   TEXT,
  battery       INTEGER,
  model         TEXT,
  android_ver   TEXT,
  ip            TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A per-customer library of event/venue links to lock devices onto.
CREATE TABLE IF NOT EXISTS links (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,                   -- e.g. "אולם הדר — חתונה 12/8"
  url           TEXT NOT NULL,                   -- the specific event sub-link
  allowed_host  TEXT,                            -- comma-separated extra hosts (payment gateway, etc.)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One-time enrollment codes bind a fresh device to an owner.
CREATE TABLE IF NOT EXISTS enrollments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT,
  home_url    TEXT,
  allowed_host TEXT,
  idle_return_seconds INTEGER NOT NULL DEFAULT 0,
  used        INTEGER NOT NULL DEFAULT 0,
  device_id   INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  expires_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Command queue. The agent pulls pending commands (and gets them pushed over WS).
CREATE TABLE IF NOT EXISTS commands (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,                     -- reboot | reload | set_url | screen_on | screen_off | clear_cache | lock | unlock | screenshot | message
  payload     TEXT,                              -- JSON string
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending | delivered | done | failed
  result      TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at TEXT,
  done_at     TEXT
);

-- Lightweight audit / event log per device.
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type        TEXT NOT NULL,
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_devices_owner ON devices(owner_id);
CREATE INDEX IF NOT EXISTS idx_commands_device ON commands(device_id, status);
CREATE INDEX IF NOT EXISTS idx_events_device ON events(device_id);
CREATE INDEX IF NOT EXISTS idx_links_owner ON links(owner_id);
`);

// ── Lightweight migrations for databases created by earlier versions ──
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn('devices', 'idle_return_seconds', 'idle_return_seconds INTEGER NOT NULL DEFAULT 0');
ensureColumn('enrollments', 'idle_return_seconds', 'idle_return_seconds INTEGER NOT NULL DEFAULT 0');

export function logEvent(deviceId, userId, type, detail) {
  db.prepare(
    'INSERT INTO events (device_id, user_id, type, detail) VALUES (?, ?, ?, ?)'
  ).run(deviceId ?? null, userId ?? null, type, detail ?? null);
}
