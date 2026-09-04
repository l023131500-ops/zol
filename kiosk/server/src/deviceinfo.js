/**
 * Validation for the device-identity/diagnostic fields `/api/agent/enroll`
 * and `/api/agent/heartbeat` accept: `serial`, `model`, `androidVersion`,
 * `appVersion`, `status`, `ip`. Unlike `name` (owner-typed in the console,
 * rejected outright when too long — see names.js) these are device-authored:
 * `/enroll` is the one route in this app with no auth at all (a fresh device
 * proves nothing but a 6-character code — see agent.js's enrollLimiter
 * comment), and `/heartbeat` only requires a device_token, not human review.
 * Neither caller can be trusted to send a reasonable type or length.
 *
 * `serial` is the device's identity key (unique-indexed, looked up on every
 * enroll/re-enroll and embedded in `מכשיר ${serial.slice(-4)}`'s fallback
 * name) — a non-string value reaches that `.slice()` call and throws, and an
 * unbounded string bloats the unique index for no reason. So it is validated
 * and rejected with a clean 400, the same shape `code` already gets a few
 * lines above it in agent.js.
 *
 * `model`/`androidVersion`/`appVersion`/`status`/`ip` are purely diagnostic —
 * the console only ever displays them — so, like watchdog.js's `detail`
 * field (the same "device-authored, not human-typed" shape of input), an
 * overlong value is truncated rather than failing the whole request.
 */

const MAX_SERIAL_LENGTH = 128;
const MAX_INFO_LENGTH = 100;

/** @returns {{ok: true, value: string} | {ok: false, error: string}} */
export function validateSerial(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return { ok: false, error: 'מספר סידורי לא תקין' };
  }
  const trimmed = String(raw).trim();
  if (!trimmed) return { ok: false, error: 'מספר סידורי לא תקין' };
  if (trimmed.length > MAX_SERIAL_LENGTH) {
    return { ok: false, error: `מספר סידורי ארוך מדי (עד ${MAX_SERIAL_LENGTH} תווים)` };
  }
  return { ok: true, value: trimmed };
}

/** Truncates an optional diagnostic string; non-strings/empty become null. */
export function sanitizeDeviceInfo(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') return null;
  const trimmed = String(raw).trim();
  return trimmed ? trimmed.slice(0, MAX_INFO_LENGTH) : null;
}
