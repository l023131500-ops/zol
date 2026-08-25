/**
 * The console socket's one job here is to never carry `device_token` — the
 * agent's long-lived secret, sufficient alone at /ws/agent?token=… and every
 * /api/agent/* route. devicepayload.js has no database dependency, so it is
 * exercised for real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { consoleDevice, CONSOLE_DEVICE_FIELDS } from '../src/devicepayload.js';

const ROW = {
  id: 1, owner_id: 7, serial: 'ABC123', name: 'Kiosk 1', device_token: 'super-secret-40-char-token',
  allowed_host: 'example.com', home_url: 'https://example.com', idle_return_seconds: 30,
  status: 'ok', online: 1, last_seen: '2026-08-24T00:00:00Z', app_version: '1.0.0',
  battery: 88, model: 'Pixel', android_ver: '13', ip: '1.2.3.4', created_at: '2026-01-01T00:00:00Z',
  exit_code: 'sunset7', last_screenshot: 'data:image/jpeg;base64,/9j/notreallyanimage',
  last_screenshot_at: '2026-08-24T12:00:00Z', display_zoom_percent: 150,
  display_orientation: 'portrait',
  schedule_enabled: 1, schedule_open_time: '09:00', schedule_close_time: '21:00',
  schedule_last_state: 'on',
  signage_enabled: 1, signage_urls: 'https://example.com/promo1\nhttps://example.com/promo2',
  signage_interval_seconds: 20, access_code: 'AB23CD', payment_mode: 'manual',
  exit_gesture_taps: 7, exit_gesture_corner: 'br', exit_gesture_hold_ms: 1500,
};

test('device_token never survives the merge into a console frame', () => {
  const out = consoleDevice(ROW, {});
  assert.equal('device_token' in out, false);
  assert.equal(JSON.stringify(out).includes('super-secret'), false);
});

test('an override payload cannot reintroduce a stripped field', () => {
  // notifyConsolesOfDevice() callers pass live-status deltas as the second
  // arg; one that happened to be named device_token must still be dropped by
  // the allow-list, since it is applied *after* the merge.
  const out = consoleDevice(ROW, { device_token: 'leaked-from-payload', online: 0 });
  assert.equal('device_token' in out, false);
  assert.equal(out.online, 0);
});

test('every allow-listed field the row carries comes through unchanged', () => {
  const out = consoleDevice(ROW, {});
  for (const f of CONSOLE_DEVICE_FIELDS) {
    if (f in ROW) assert.equal(out[f], ROW[f], `expected ${f} to pass through`);
  }
});

test('a field the row does not have stays absent, not undefined', () => {
  // { ...DEVICES[i], ...mapped } on the client means an explicit `undefined`
  // would overwrite a good value already on screen.
  const out = consoleDevice({ id: 1 }, {});
  assert.equal('owner_name' in out, false);
});

test('the exact dropped set is device_token, the screenshot image, and schedule bookkeeping, nothing more', () => {
  const merged = { ...ROW };
  const out = consoleDevice(ROW, {});
  const dropped = Object.keys(merged).filter((k) => !(k in out));
  assert.deepEqual(dropped.sort(), ['device_token', 'last_screenshot', 'schedule_last_state']);
});

test('schedule_last_state never survives — enforcement bookkeeping only, not console-facing', () => {
  const out = consoleDevice(ROW, {});
  assert.equal('schedule_last_state' in out, false);
});

test('last_screenshot_at survives so a console knows a capture is ready, but the image itself does not', () => {
  const out = consoleDevice(ROW, {});
  assert.equal(out.last_screenshot_at, ROW.last_screenshot_at);
  assert.equal('last_screenshot' in out, false);
  assert.equal(JSON.stringify(out).includes('notreallyanimage'), false);
});

test('a live-status payload key not on the allow-list is dropped too', () => {
  const out = consoleDevice(ROW, { some_future_secret: 'x', battery: 42 });
  assert.equal('some_future_secret' in out, false);
  assert.equal(out.battery, 42);
});

test('access_code (§2★ז launcher code) survives — the owner needs to see it to share it', () => {
  const out = consoleDevice(ROW, {});
  assert.equal(out.access_code, 'AB23CD');
});

test('payment_mode (§7) survives — never pushed via update_config, so this is its only path to a console', () => {
  const out = consoleDevice(ROW, {});
  assert.equal(out.payment_mode, 'manual');
});

test('display_orientation (§5) survives — the console needs it to render the device-edit form', () => {
  const out = consoleDevice(ROW, {});
  assert.equal(out.display_orientation, 'portrait');
});

test('exit_gesture_taps/corner/hold_ms (§4) survive — the console needs them to render the device-edit form', () => {
  const out = consoleDevice(ROW, {});
  assert.equal(out.exit_gesture_taps, 7);
  assert.equal(out.exit_gesture_corner, 'br');
  assert.equal(out.exit_gesture_hold_ms, 1500);
});
