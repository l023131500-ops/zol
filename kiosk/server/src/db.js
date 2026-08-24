import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// Whether the database survived the last restart is the single most important
// fact about this deployment, and it is invisible from the outside until a
// customer notices their devices are gone. Without a persistent volume mounted
// at the directory below, every deploy silently starts from an empty file and
// re-seeds the admin — which looks exactly like a healthy first boot in the
// logs. Say it out loud at startup instead.
const dbDir = path.dirname(config.dbPath);
const existedAtBoot = fs.existsSync(config.dbPath);
fs.mkdirSync(dbDir, { recursive: true });
console.log(
  `  db: ${config.dbPath} — ${existedAtBoot ? 'existing file (data persisted)' : 'NEW FILE (no data carried over — is a volume mounted at ' + dbDir + '?)'}`,
);

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
  display_zoom_percent INTEGER NOT NULL DEFAULT 100, -- CSS zoom applied in the WebView; 100 = no scaling
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

-- KIOSK_BUILD.md §2★ד: an owner's own registered customers ("מזהה לקוח"),
-- each with a direct link + branded site. Distinct from 'links' (the owner's
-- own event/venue library): a client is the two-tier "business owner → their
-- customers" registry, entered on-device by code rather than picked in the
-- console.
CREATE TABLE IF NOT EXISTS clients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,                   -- short id typed on the device
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,                   -- that customer's branded site
  allowed_host  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner_id, code)
);

-- Which clients a given device may switch to (§2★ה: "רק מתוך אלה שאישרנו
-- בניהול לאותו מכשיר") — an owner registering a customer does not by itself
-- expose that customer on every device.
CREATE TABLE IF NOT EXISTS device_clients (
  device_id  INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (device_id, client_id)
);

-- KIOSK_BUILD.md §8 "קבוצות/תבניות: להחיל מדיניות על קבוצת מכשירים בבת אחת".
-- A saved policy (subset of the same fields devices.allowed_host/home_url/
-- idle_return_seconds/exit_code/display_zoom_percent/schedule_*/signage_*
-- already hold) an owner can apply to many devices in one action. Every
-- policy column is nullable and independent of the others — NULL means "not
-- part of this template", the same "never configured" convention exit_code
-- established on devices itself, not "set to empty/off". See
-- src/templatepolicy.js for the field-by-field validation this table's rows
-- are built from.
CREATE TABLE IF NOT EXISTS templates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  home_url      TEXT,
  allowed_host  TEXT,
  idle_return_seconds INTEGER,
  exit_code     TEXT,
  display_zoom_percent INTEGER,
  schedule_enabled INTEGER,
  schedule_open_time TEXT,
  schedule_close_time TEXT,
  signage_enabled INTEGER,
  signage_urls TEXT,
  signage_interval_seconds INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(owner_id, name)
);

-- KIOSK_BUILD.md §9 "גיבוי/שחזור מדיניות" — a restorable capture of one
-- device's own policy fields, taken automatically before every write
-- policy.js's applyDevicePolicy makes (and optionally on demand, "שמור מצב
-- נוכחי"). Column-for-column the same policy subset as 'templates' above
-- (minus its 'name', which names a reusable preset — a snapshot instead
-- carries 'reason', a free-text note of why it was taken), so a snapshot
-- row restores via templatepolicy.js's policyPatchFromTemplate unchanged.
CREATE TABLE IF NOT EXISTS policy_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id     INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  reason        TEXT,
  home_url      TEXT,
  allowed_host  TEXT,
  idle_return_seconds INTEGER,
  exit_code     TEXT,
  display_zoom_percent INTEGER,
  schedule_enabled INTEGER,
  schedule_open_time TEXT,
  schedule_close_time TEXT,
  signage_enabled INTEGER,
  signage_urls TEXT,
  signage_interval_seconds INTEGER,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_devices_owner ON devices(owner_id);
CREATE INDEX IF NOT EXISTS idx_commands_device ON commands(device_id, status);
CREATE INDEX IF NOT EXISTS idx_events_device ON events(device_id);
CREATE INDEX IF NOT EXISTS idx_links_owner ON links(owner_id);
CREATE INDEX IF NOT EXISTS idx_clients_owner ON clients(owner_id);
CREATE INDEX IF NOT EXISTS idx_device_clients_device ON device_clients(device_id);
CREATE INDEX IF NOT EXISTS idx_templates_owner ON templates(owner_id);
CREATE INDEX IF NOT EXISTS idx_policy_snapshots_device ON policy_snapshots(device_id, id);
`);

// ── Lightweight migrations for databases created by earlier versions ──
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn('devices', 'idle_return_seconds', 'idle_return_seconds INTEGER NOT NULL DEFAULT 0');
ensureColumn('enrollments', 'idle_return_seconds', 'idle_return_seconds INTEGER NOT NULL DEFAULT 0');
// Local maintenance/exit code for KioskActivity's corner-tap dialog. NULL on
// every existing row, which is the honest value: no code was ever set,
// exactly the state that has left that dialog unusable since it was written.
ensureColumn('devices', 'exit_code', 'exit_code TEXT');
// Latest remote screenshot (data URL, base64). Kept off the CONSOLE_DEVICE_FIELDS
// allow-list in devicepayload.js on purpose — only the timestamp is broadcast
// live; the image itself is fetched on demand via GET /devices/:id/screenshot,
// the same "don't push it unless asked" shape as devicepayload.js already
// documents for device_token.
ensureColumn('devices', 'last_screenshot', 'last_screenshot TEXT');
ensureColumn('devices', 'last_screenshot_at', 'last_screenshot_at TEXT');
// KIOSK_BUILD.md §5 "הגדלת מסך (זום)": many locked sites are built mobile-first
// and render small on a 21"+ kiosk screen. 100 = no scaling, matching every
// device enrolled before this column existed.
ensureColumn('devices', 'display_zoom_percent', 'display_zoom_percent INTEGER NOT NULL DEFAULT 100');
// KIOSK_BUILD.md §9 "תזמון": business-hours screen scheduling. 0/NULL on every
// existing row, which is the honest value — no schedule was ever configured
// before this column existed, matching exit_code's "NULL means never set"
// convention above. schedule_last_state ('on'/'off') is enforcement
// bookkeeping only (see index.js's interval) — it dedupes the automatic
// screen_on/screen_off so a device already in the right state is not re-sent
// the same command every tick; it is deliberately not surfaced to the console.
ensureColumn('devices', 'schedule_enabled', 'schedule_enabled INTEGER NOT NULL DEFAULT 0');
ensureColumn('devices', 'schedule_open_time', 'schedule_open_time TEXT');
ensureColumn('devices', 'schedule_close_time', 'schedule_close_time TEXT');
ensureColumn('devices', 'schedule_last_state', 'schedule_last_state TEXT');
// KIOSK_BUILD.md §9 "מצב תצוגה (Digital Signage)": idle content rotation.
// 0/NULL on every existing row, same "never configured" convention as
// schedule_*/exit_code above. signage_urls is newline-separated (not CSV —
// URLs can contain commas in their own query strings), matching exactly what
// the console's playlist textarea holds.
ensureColumn('devices', 'signage_enabled', 'signage_enabled INTEGER NOT NULL DEFAULT 0');
ensureColumn('devices', 'signage_urls', 'signage_urls TEXT');
ensureColumn('devices', 'signage_interval_seconds', 'signage_interval_seconds INTEGER NOT NULL DEFAULT 15');
// KIOSK_BUILD.md §9 "מיתוג לקוח: מסך פתיחה, לוגו, צבעים לכל לקוח". NULL on
// every existing client, the honest value — no branding was ever configured
// before this column existed, matching exit_code's "NULL means never set"
// convention above. Both are optional per-client, unlike a device's own
// display_zoom_percent, which always has a value.
ensureColumn('clients', 'logo_url', 'logo_url TEXT');
ensureColumn('clients', 'brand_color', 'brand_color TEXT');

export function logEvent(deviceId, userId, type, detail) {
  db.prepare(
    'INSERT INTO events (device_id, user_id, type, detail) VALUES (?, ?, ?, ?)'
  ).run(deviceId ?? null, userId ?? null, type, detail ?? null);
}

/**
 * The clients approved for a device, in the same shape a device caches and
 * shows on its own selection screen (KIOSK_BUILD.md §2★ה: this must work
 * fully offline, so everything the device needs — code, name, url — travels
 * in one payload, not just a pointer it would have to look up again later).
 *
 * `allowed_host` (aliased `allowedHost`) is included for the same reason:
 * a client's own site is very often on a different domain than the device's
 * `home_url`, so the device's own `allowed_host` does not cover it — without
 * this, switching to a client would load its first page fine (the on-device
 * navigator does not gate a direct load) but block every in-page link/redirect
 * on that same site the instant one fires, since `hostAllowed()` would be
 * checking the wrong scope. `clients` always has this populated (routes/
 * clients.js's INSERT runs every URL through `hostsForUrl`, which folds in
 * the URL's own host at minimum), so there is no empty-scope case here to
 * additionally guard against.
 *
 * `logoUrl`/`brandColor` ride along the same offline-first payload for the
 * same reason as the rest: KIOSK_BUILD.md §9's per-client splash has to
 * render on a device that may be showing this list with no network at all,
 * so the branding travels with the client rather than being fetched again
 * when one is picked.
 */
export function approvedClientsForDevice(deviceId) {
  return db.prepare(
    `SELECT c.code, c.name, c.url, c.allowed_host AS allowedHost,
            c.logo_url AS logoUrl, c.brand_color AS brandColor FROM device_clients dc
     JOIN clients c ON c.id = dc.client_id
     WHERE dc.device_id = ? ORDER BY c.name`
  ).all(deviceId);
}
