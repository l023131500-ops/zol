// KIOSK_BUILD.md §8 "קבוצות/תבניות: להחיל מדיניות על קבוצת מכשירים בבת אחת" —
// a saved policy an owner can apply to many devices in one action, instead of
// opening each device's edit form to repeat the same allow-list/schedule/
// signage/zoom change across a fleet.
//
// A template's fields are each independently optional: NULL/absent means
// "not part of this template, leave that setting alone on whatever device it
// is applied to" — the same "NULL means never configured" convention
// exit_code/schedule_*/signage_* already use on the devices table itself
// (see db.js). This is *not* the same shape as routes/devices.js's PATCH,
// which falls back to the device's own current value for a field left out of
// a conditional group (schedule/signage): a template has no existing device
// row to fall back to, so each field-group here must be self-contained if
// touched at all.
//
// Deliberately free of any `db.js`/express import — like hosts.js/schedule.js/
// signage.js/display.js/exitcode.js/clients.js, this validator is exercised
// directly in a checkout with no better-sqlite3 installed. The db/express
// wiring lives in routes/templates.js; the device-write half shared with
// routes/devices.js's PATCH lives in policy.js.

import { normalizeHostCsv, parseHosts } from './hosts.js';
import { validateExitCode } from './exitcode.js';
import { clampZoomPercent } from './display.js';
import { validateScheduleWindow } from './schedule.js';
import { validateSignagePlaylist, validateSignageInterval } from './signage.js';

/**
 * Validate + normalize whatever subset of template fields is present in
 * `body`, into the DB-column shape templates/routes/templates.js writes.
 * Returns `{ fields }` (only keys for fields actually present in `body`) or
 * `{ error }`. An empty `body` is valid — it changes nothing.
 */
export function buildTemplateFields(body) {
  const b = body || {};
  const fields = {};

  if (b.name !== undefined) {
    const name = String(b.name ?? '').trim();
    if (!name) return { error: 'נדרש שם לתבנית' };
    fields.name = name;
  }

  if (b.homeUrl !== undefined) {
    const homeUrl = String(b.homeUrl ?? '').trim();
    if (homeUrl) { try { new URL(homeUrl); } catch { return { error: 'כתובת אתר לא תקינה' }; } }
    fields.home_url = homeUrl || null;
  }

  if (b.allowedHost !== undefined) {
    const cleaned = normalizeHostCsv(b.allowedHost);
    if (!cleaned && parseHosts(b.allowedHost).length > 0) {
      return { error: 'רשימת הדומיינים אינה תקינה — נדרש לפחות דומיין אחד תקף (למשל example.com)' };
    }
    fields.allowed_host = cleaned || null;
  }

  if (b.idleReturnSeconds !== undefined) {
    fields.idle_return_seconds = b.idleReturnSeconds === null || b.idleReturnSeconds === ''
      ? null : Math.max(0, Number(b.idleReturnSeconds) || 0);
  }

  if (b.exitCode !== undefined) {
    const v = validateExitCode(b.exitCode);
    if (!v.ok) return { error: v.error };
    fields.exit_code = v.value; // '' is a real "clear" value, distinct from "not part of the template"
  }

  if (b.displayZoomPercent !== undefined) {
    fields.display_zoom_percent = b.displayZoomPercent === null || b.displayZoomPercent === ''
      ? null : clampZoomPercent(b.displayZoomPercent);
  }

  if (b.scheduleEnabled !== undefined || b.scheduleOpenTime !== undefined || b.scheduleCloseTime !== undefined) {
    const enabled = !!b.scheduleEnabled;
    if (enabled) {
      const v = validateScheduleWindow(b.scheduleOpenTime, b.scheduleCloseTime);
      if (!v.ok) return { error: v.error };
    }
    fields.schedule_enabled = enabled ? 1 : 0;
    fields.schedule_open_time = b.scheduleOpenTime || null;
    fields.schedule_close_time = b.scheduleCloseTime || null;
  }

  if (b.signageEnabled !== undefined || b.signageUrls !== undefined || b.signageIntervalSeconds !== undefined) {
    const enabled = !!b.signageEnabled;
    let urlsValue = b.signageUrls || null;
    let intervalValue = b.signageIntervalSeconds ?? 15;
    if (enabled) {
      const v = validateSignagePlaylist(b.signageUrls);
      if (!v.ok) return { error: v.error };
      const vi = validateSignageInterval(intervalValue);
      if (!vi.ok) return { error: vi.error };
      urlsValue = v.urls.join('\n');
      intervalValue = vi.seconds;
    }
    fields.signage_enabled = enabled ? 1 : 0;
    fields.signage_urls = urlsValue;
    fields.signage_interval_seconds = intervalValue;
  }

  return { fields };
}

/**
 * Turn a stored template row into the same body shape POST
 * /devices/:id/command's sibling, PATCH /devices/:id (via policy.js's
 * applyDevicePolicy), already accepts — only the fields this template
 * actually sets. A column that is NULL on the row is left out entirely, so
 * applyDevicePolicy's own "field absent = don't touch" rule (identical to a
 * human editing just one field in the device form) does the rest.
 */
export function policyPatchFromTemplate(row) {
  const patch = {};
  if (row.home_url != null) patch.homeUrl = row.home_url;
  if (row.allowed_host != null) patch.allowedHost = row.allowed_host;
  if (row.idle_return_seconds != null) patch.idleReturnSeconds = row.idle_return_seconds;
  if (row.exit_code != null) patch.exitCode = row.exit_code;
  if (row.display_zoom_percent != null) patch.displayZoomPercent = row.display_zoom_percent;
  if (row.schedule_enabled != null) {
    patch.scheduleEnabled = !!row.schedule_enabled;
    patch.scheduleOpenTime = row.schedule_open_time;
    patch.scheduleCloseTime = row.schedule_close_time;
  }
  if (row.signage_enabled != null) {
    patch.signageEnabled = !!row.signage_enabled;
    patch.signageUrls = row.signage_urls;
    patch.signageIntervalSeconds = row.signage_interval_seconds;
  }
  return patch;
}

const TEMPLATE_COLUMNS = [
  'name', 'home_url', 'allowed_host', 'idle_return_seconds', 'exit_code', 'display_zoom_percent',
  'schedule_enabled', 'schedule_open_time', 'schedule_close_time',
  'signage_enabled', 'signage_urls', 'signage_interval_seconds',
];

/** Whitelist used to build a dynamic SQL SET clause — never derived from request input. */
export function templateColumns() {
  return TEMPLATE_COLUMNS;
}
