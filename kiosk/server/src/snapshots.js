// KIOSK_BUILD.md §9 "גיבוי/שחזור מדיניות" — the policy-subset column list a
// snapshot row shares with a template row (see db.js's `policy_snapshots`/
// `templates` tables and templatepolicy.js's TEMPLATE_COLUMNS), minus
// `name`: a snapshot is not a named, reusable preset like a template, it is
// a point-in-time capture of one device's own settings, restorable via
// templatepolicy.js's policyPatchFromTemplate (row-shape compatible, reused
// unchanged rather than duplicating the row→patch mapping).
//
// Deliberately free of any db.js/express import, like hosts.js/schedule.js/
// signage.js/display.js/exitcode.js/templatepolicy.js — exercised directly
// in a checkout with no better-sqlite3 installed. The db wiring (insert +
// retention trim) lives in policy.js's saveSnapshot.

import { policyPatchFromTemplate } from './templatepolicy.js';

export const SNAPSHOT_COLUMNS = [
  'home_url', 'allowed_host', 'idle_return_seconds', 'exit_code', 'display_zoom_percent',
  'display_orientation',
  'schedule_enabled', 'schedule_open_time', 'schedule_close_time',
  'signage_enabled', 'signage_urls', 'signage_interval_seconds',
  'maintenance_enabled', 'maintenance_message', 'payment_mode',
  'exit_gesture_taps', 'exit_gesture_corner', 'exit_gesture_hold_ms',
];

// Oldest trimmed first once a device passes this many snapshots — an
// auto-backup on every policy write (plus manual ones) would otherwise grow
// this table without bound on a frequently-edited device.
export const MAX_SNAPSHOTS_PER_DEVICE = 20;

/** Extract the policy subset from a device row, in the shape policy_snapshots stores it. */
export function snapshotFieldsFromDevice(device) {
  const fields = {};
  for (const col of SNAPSHOT_COLUMNS) fields[col] = device ? device[col] : undefined;
  return fields;
}

// The same body keys applyDevicePolicy's own destructure (policy.js) reads —
// kept in one place so "did this request touch anything worth backing up"
// cannot silently drift from "what applyDevicePolicy actually accepts".
const POLICY_BODY_KEYS = [
  'homeUrl', 'allowedHost', 'linkId', 'idleReturnSeconds', 'exitCode', 'displayZoomPercent',
  'displayOrientation',
  'scheduleEnabled', 'scheduleOpenTime', 'scheduleCloseTime',
  'signageEnabled', 'signageUrls', 'signageIntervalSeconds',
  'maintenanceEnabled', 'maintenanceMessage', 'paymentMode',
  'exitGestureTaps', 'exitGestureCorner', 'exitGestureHoldMs',
];

/**
 * Whether a PATCH /devices/:id-shaped body touches any field a snapshot
 * would actually protect — a request that only renames the device (or an
 * accidental empty body) should not spend a slot in the 20-snapshot budget.
 */
export function policyFieldsPresent(body) {
  return POLICY_BODY_KEYS.some((k) => body != null && body[k] !== undefined);
}

/**
 * Turn a stored policy_snapshots row into the applyDevicePolicy patch shape
 * that restores the device to exactly the state it was captured in.
 *
 * This is *not* the same job as templatepolicy.js's policyPatchFromTemplate,
 * even though the row shapes are column-compatible: that function treats a
 * NULL column as "not part of this template, leave the device's existing
 * value alone" — correct for a template, which is a partial, deliberately
 * sparse preset. A snapshot has no such "not part of it" case; every column
 * was captured, including "unset". exit_code is the one field where that
 * distinction is observable: a device with no maintenance code has
 * exit_code = NULL, and policyPatchFromTemplate would *skip* it on restore
 * rather than clear a code the device gained after the snapshot was taken.
 * exitCode is therefore always forced in here, using exitcode.js's own
 * "'' = clear" contract — everything else reuses policyPatchFromTemplate
 * unchanged, since schedule_enabled/signage_enabled are NOT NULL on
 * `devices` and so are never actually skipped by it either way.
 */
export function patchFromSnapshot(row) {
  const patch = policyPatchFromTemplate(row);
  patch.exitCode = row.exit_code || '';
  return patch;
}
