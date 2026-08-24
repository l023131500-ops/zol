// What a console dashboard is allowed to receive over the realtime socket.
//
// `devices.device_token` is the agent's long-lived secret — sufficient on its
// own at /ws/agent?token=… and every /api/agent/* route. routes/devices.js's
// publicDevice() already strips it from REST responses; hub.js's
// notifyConsolesOfDevice() fanned out the raw `SELECT * FROM devices` row
// instead, so every owner's (and every admin's) open console tab received
// every device's device_token in the device_update frame — unused by the
// client (mapDevice() in public/js/app.js never reads it), but sitting in the
// WS traffic, in any HAR/proxy log, and reachable by an XSS given script-src
// already carries 'unsafe-inline'.
//
// An allow-list, applied *after* the merge with the live-status payload, not a
// `delete device_token` on the row: a deny-list is right exactly once — the
// next secret column added to `devices` would ship to every open console
// until someone remembered to extend it, and nothing fails when they don't.
// Kept free of every other module's imports so it can be exercised here
// without better-sqlite3/ws/express, which this checkout does not have
// installed.
export const CONSOLE_DEVICE_FIELDS = [
  'id', 'owner_id', 'owner_name', 'serial', 'name', 'allowed_host', 'home_url',
  'idle_return_seconds', 'status', 'online', 'last_seen', 'app_version',
  'battery', 'model', 'android_ver', 'ip', 'created_at',
];

/** Merge a live-status payload onto a device row, then drop everything not allow-listed. */
export function consoleDevice(device, payload) {
  const merged = { ...device, ...payload };
  const out = {};
  for (const f of CONSOLE_DEVICE_FIELDS) if (f in merged) out[f] = merged[f];
  return out;
}
