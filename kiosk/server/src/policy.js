// The device-policy write path shared by two callers: a customer editing one
// device by hand (routes/devices.js's PATCH /devices/:id) and applying a
// saved template to many devices at once (routes/templates.js's POST
// /templates/:id/apply, KIOSK_BUILD.md §8 "קבוצות/תבניות"). Both need the
// exact same validation, DB write, event log, and live-push shape — splitting
// it out here means a bulk apply can never drift from what a single-device
// edit already does, the same reasoning routes/devices.js's own
// pushConfigUpdate comment gives for keeping *that* in one place.

import { db, logEvent, approvedClientsForDevice } from './db.js';
import { notifyConsolesOfDevice } from './hub.js';
import { issueCommand } from './commands.js';
import { hostsForUrl, normalizeHostCsv, parseHosts } from './hosts.js';
import { validateExitCode } from './exitcode.js';
import { clampZoomPercent } from './display.js';
import { validateScheduleWindow } from './schedule.js';
import { validateSignagePlaylist, validateSignageInterval } from './signage.js';

// Rebuilt and pushed on every write that can change what a device's own
// selection screen should offer (KIOSK_BUILD.md §2★ה) — approving/revoking a
// client, same as editing homeUrl/allowedHost/zoom already does via
// applyDevicePolicy below. Kept in one place so the command payload's shape
// cannot drift between call sites.
export function pushConfigUpdate(device, userId) {
  issueCommand(device, 'update_config', {
    homeUrl: device.home_url, allowedHost: device.allowed_host, idleReturnSeconds: device.idle_return_seconds,
    adminCode: device.exit_code || '', displayZoomPercent: device.display_zoom_percent,
    approvedClients: approvedClientsForDevice(device.id),
    signageEnabled: !!device.signage_enabled, signageUrls: device.signage_urls || '',
    signageIntervalSeconds: device.signage_interval_seconds,
  }, userId ?? null);
}

/**
 * Validate and apply a policy patch (the same field shape PATCH
 * /devices/:id's body has always accepted) to one device row. Returns
 * `{ ok: true, device }` with the freshly-read row, or `{ ok: false, status,
 * error }` on a validation failure — the caller decides how to surface that
 * (routes/devices.js returns it directly; routes/templates.js's bulk apply
 * collects it per device instead of failing the whole batch).
 */
export function applyDevicePolicy(device, body, userId) {
  let { name, homeUrl, allowedHost, idleReturnSeconds, linkId, exitCode, displayZoomPercent,
        scheduleEnabled, scheduleOpenTime, scheduleCloseTime,
        signageEnabled, signageUrls, signageIntervalSeconds } = body || {};

  // exitCode is validated up front, before any other write on this device:
  // COALESCE(?, exit_code) below treats '' as "clear" and undefined as "no
  // change" the same way name/homeUrl already do, so an invalid value must be
  // rejected here rather than silently stored.
  let exitCodeValue = null;
  if (exitCode !== undefined) {
    const v = validateExitCode(exitCode);
    if (!v.ok) return { ok: false, status: 400, error: v.error };
    exitCodeValue = v.value;
  }

  // KIOSK_BUILD.md §9 "תזמון": only validated when the caller actually touches
  // one of the three schedule fields — an edit to, say, just the name must not
  // start requiring open/close times on a device that never had a schedule.
  // Enabling always re-validates against whichever open/close ends up in
  // effect (the new value if sent, else the device's existing one), so a
  // request that flips scheduleEnabled=true without resending times an owner
  // already saved earlier cannot skip the check.
  let scheduleValues = null;
  if (scheduleEnabled !== undefined || scheduleOpenTime !== undefined || scheduleCloseTime !== undefined) {
    const enabled = !!scheduleEnabled;
    const openTime = scheduleOpenTime !== undefined ? scheduleOpenTime : device.schedule_open_time;
    const closeTime = scheduleCloseTime !== undefined ? scheduleCloseTime : device.schedule_close_time;
    if (enabled) {
      const v = validateScheduleWindow(openTime, closeTime);
      if (!v.ok) return { ok: false, status: 400, error: v.error };
    }
    scheduleValues = { enabled: enabled ? 1 : 0, openTime: openTime || null, closeTime: closeTime || null };
  }

  // KIOSK_BUILD.md §9 "מצב תצוגה": same conditional-validation shape as
  // scheduleValues above — only checked when the caller actually touches one
  // of the three signage fields, re-validated against whichever playlist/
  // interval ends up in effect (new value if sent, else the device's
  // existing one) so `signageEnabled=true` alone, reusing a playlist saved
  // earlier, still gets checked.
  let signageValues = null;
  if (signageEnabled !== undefined || signageUrls !== undefined || signageIntervalSeconds !== undefined) {
    const enabled = !!signageEnabled;
    const urls = signageUrls !== undefined ? signageUrls : device.signage_urls;
    const intervalSeconds = signageIntervalSeconds !== undefined ? signageIntervalSeconds : device.signage_interval_seconds;
    let urlsValue = urls || null;
    let intervalValue = intervalSeconds;
    if (enabled) {
      const v = validateSignagePlaylist(urls);
      if (!v.ok) return { ok: false, status: 400, error: v.error };
      const vi = validateSignageInterval(intervalSeconds);
      if (!vi.ok) return { ok: false, status: 400, error: vi.error };
      urlsValue = v.urls.join('\n');
      intervalValue = vi.seconds;
    }
    signageValues = { enabled: enabled ? 1 : 0, urls: urlsValue, intervalSeconds: intervalValue };
  }

  // Selecting a link from the library overrides the URL + host set.
  if (linkId) {
    const link = db.prepare('SELECT * FROM links WHERE id = ? AND owner_id = ?').get(linkId, device.owner_id);
    if (!link) return { ok: false, status: 400, error: 'הקישור לא נמצא בספרייה' };
    homeUrl = link.url;
    allowedHost = link.allowed_host;
  } else if (homeUrl) {
    // hostsForUrl always folds the *new* home URL's own host into the result
    // — even when the caller also supplied an explicit allowedHost. Skipping
    // that merge (the previous behaviour whenever allowedHost was truthy) let
    // one request set homeUrl and allowedHost to a mismatched pair: nothing
    // here checked the new home URL's host against the new list, so the
    // server stored the mismatch as-is and pushed it to the device via
    // update_config. The agent's onConfigUpdated loads that homeUrl
    // unconditionally (see hosts.test.mjs: "the device home URL is always
    // part of its own allow-list" — the invariant this line restores for the
    // one write path that could break it).
    allowedHost = hostsForUrl(homeUrl, allowedHost || device.allowed_host);
  }

  // Whatever route the list arrived by, store it clean. The allow-list is what
  // stands between a locked device and the open internet; an entry like
  // "https://pay.example.com/checkout" matches no host at all, so a list that
  // looks configured would in fact be protecting nothing.
  if (allowedHost != null) {
    const cleaned = normalizeHostCsv(allowedHost);
    // Refusing an all-junk list is safer than saving an empty one: an empty
    // allow-list means "no lock configured" to hostAllowed(), which fails open.
    if (!cleaned && parseHosts(allowedHost).length > 0) {
      return { ok: false, status: 400, error: 'רשימת הדומיינים אינה תקינה — נדרש לפחות דומיין אחד תקף (למשל example.com)' };
    }
    allowedHost = cleaned || null;
  }

  db.prepare(`UPDATE devices SET name = COALESCE(?, name), home_url = COALESCE(?, home_url),
     allowed_host = COALESCE(?, allowed_host), idle_return_seconds = COALESCE(?, idle_return_seconds),
     exit_code = COALESCE(?, exit_code), display_zoom_percent = COALESCE(?, display_zoom_percent),
     schedule_enabled = COALESCE(?, schedule_enabled), schedule_open_time = COALESCE(?, schedule_open_time),
     schedule_close_time = COALESCE(?, schedule_close_time),
     schedule_last_state = CASE WHEN ? = 1 THEN NULL ELSE schedule_last_state END,
     signage_enabled = COALESCE(?, signage_enabled), signage_urls = COALESCE(?, signage_urls),
     signage_interval_seconds = COALESCE(?, signage_interval_seconds) WHERE id = ?`)
    .run(name ?? null, homeUrl ?? null, allowedHost ?? null,
         idleReturnSeconds != null ? Math.max(0, Number(idleReturnSeconds)) : null,
         exitCodeValue,
         displayZoomPercent != null ? clampZoomPercent(displayZoomPercent) : null,
         scheduleValues ? scheduleValues.enabled : null,
         scheduleValues ? scheduleValues.openTime : null,
         scheduleValues ? scheduleValues.closeTime : null,
         scheduleValues ? 1 : 0,
         signageValues ? signageValues.enabled : null,
         signageValues ? signageValues.urls : null,
         signageValues ? signageValues.intervalSeconds : null,
         device.id);
  const fresh = db.prepare('SELECT * FROM devices WHERE id = ?').get(device.id);
  logEvent(device.id, userId, 'config_update', null);
  notifyConsolesOfDevice(fresh, {});
  // Tell the device to re-pull its config (URL, hosts, idle-return, admin
  // code, zoom, approved clients) live. Every field is sent on every
  // update_config, not only when it changed here — the same command already
  // carries the other fields unconditionally, and the agent only ever writes
  // what it is sent.
  pushConfigUpdate(fresh, userId);
  return { ok: true, device: fresh };
}
