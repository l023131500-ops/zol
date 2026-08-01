import { db, logEvent } from './db.js';
import { pushCommandToAgent } from './hub.js';

export const COMMAND_TYPES = new Set([
  'reboot',      // restart device (requires Device Owner)
  'reload',      // reload current page
  'set_url',     // navigate to a URL (payload.url)
  'screen_on',   // wake screen
  'screen_off',  // blank screen (power save)
  'clear_cache', // clear WebView cache
  'lock',        // re-lock kiosk / hide admin
  'unlock',      // temporarily allow admin exit (payload.minutes)
  'screenshot',  // capture and upload a screenshot
  'message',     // show a full-screen message (payload.text)
  'update_config', // re-pull config (home_url / allowed_host)
]);

/** Create a command, persist it, and push to the agent if it is connected. */
export function issueCommand(device, type, payload, createdBy) {
  if (!COMMAND_TYPES.has(type)) throw new Error(`unknown command type: ${type}`);
  const info = db.prepare('INSERT INTO commands (device_id, type, payload, created_by) VALUES (?, ?, ?, ?)')
    .run(device.id, type, payload ? JSON.stringify(payload) : null, createdBy ?? null);
  const command = { id: info.lastInsertRowid, type, payload: payload ?? null };
  const delivered = pushCommandToAgent(device.id, command);
  if (delivered) {
    db.prepare("UPDATE commands SET status = 'delivered', delivered_at = datetime('now') WHERE id = ?").run(command.id);
  }
  logEvent(device.id, createdBy, 'command', `${type} (${delivered ? 'pushed' : 'queued'})`);
  return { ...command, delivered };
}
