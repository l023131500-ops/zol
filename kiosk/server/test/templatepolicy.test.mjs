/**
 * templatepolicy.js is the validation gate between whatever an owner types
 * into a "device group" template (KIOSK_BUILD.md §8) and the policy fields
 * routes/templates.js writes to the templates table / applies to every
 * selected device via policy.js's applyDevicePolicy. No database dependency,
 * so it is exercised for real, the same shape schedule.js/signage.js/
 * display.js/exitcode.js/clients.js already use.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTemplateFields, policyPatchFromTemplate, templateColumns } from '../src/templatepolicy.js';
import { ORIENTATIONS } from '../src/orientation.js';
import { GESTURE_CORNERS } from '../src/gesturesettings.js';

test('buildTemplateFields on an empty body changes nothing', () => {
  const { fields, error } = buildTemplateFields({});
  assert.equal(error, undefined);
  assert.deepEqual(fields, {});
});

test('buildTemplateFields requires a non-blank name when name is touched', () => {
  assert.match(buildTemplateFields({ name: '' }).error, /שם/);
  assert.match(buildTemplateFields({ name: '   ' }).error, /שם/);
  assert.equal(buildTemplateFields({ name: ' Evening ' }).fields.name, 'Evening');
});

test('buildTemplateFields normalizes an allow-list the same way a device edit does', () => {
  const { fields } = buildTemplateFields({ allowedHost: 'Example.com, pay.example.com' });
  assert.equal(fields.allowed_host, 'example.com,pay.example.com');
});

test('buildTemplateFields rejects an all-junk allow-list rather than silently clearing it', () => {
  const { error } = buildTemplateFields({ allowedHost: 'not a host, also not one' });
  assert.match(error, /דומיינים/);
});

test('buildTemplateFields leaves allowedHost unset (null) when explicitly emptied', () => {
  const { fields } = buildTemplateFields({ allowedHost: '' });
  assert.equal(fields.allowed_host, null);
});

test('buildTemplateFields treats idleReturnSeconds null/"" as "not part of the template"', () => {
  assert.equal(buildTemplateFields({ idleReturnSeconds: null }).fields.idle_return_seconds, null);
  assert.equal(buildTemplateFields({ idleReturnSeconds: '' }).fields.idle_return_seconds, null);
  assert.equal(buildTemplateFields({ idleReturnSeconds: 30 }).fields.idle_return_seconds, 30);
  assert.equal(buildTemplateFields({ idleReturnSeconds: -5 }).fields.idle_return_seconds, 0);
});

test('buildTemplateFields exitCode "" is a real clear value, distinct from unset', () => {
  const cleared = buildTemplateFields({ exitCode: '' });
  assert.equal(cleared.error, undefined);
  assert.equal(cleared.fields.exit_code, '');
  assert.ok('exit_code' in cleared.fields);
  const untouched = buildTemplateFields({});
  assert.ok(!('exit_code' in untouched.fields));
});

test('buildTemplateFields rejects a weak exitCode the same way exitcode.js does', () => {
  assert.match(buildTemplateFields({ exitCode: '1111' }).error, /תחזוקה/);
});

test('buildTemplateFields clamps displayZoomPercent and treats null/"" as unset', () => {
  assert.equal(buildTemplateFields({ displayZoomPercent: 1000 }).fields.display_zoom_percent, 300);
  assert.equal(buildTemplateFields({ displayZoomPercent: null }).fields.display_zoom_percent, null);
});

test('buildTemplateFields accepts every §5 orientation and rejects an unknown one', () => {
  for (const o of ORIENTATIONS) {
    const { fields, error } = buildTemplateFields({ displayOrientation: o });
    assert.equal(error, undefined);
    assert.equal(fields.display_orientation, o);
  }
  assert.match(buildTemplateFields({ displayOrientation: 'upside-down' }).error, /לא נתמכת/);
});

test('buildTemplateFields requires a valid open/close pair only when schedule is enabled', () => {
  const bad = buildTemplateFields({ scheduleEnabled: true, scheduleOpenTime: '09:00', scheduleCloseTime: '09:00' });
  assert.match(bad.error, /פתיחה\/סגירה|זהות/);
  const ok = buildTemplateFields({ scheduleEnabled: true, scheduleOpenTime: '09:00', scheduleCloseTime: '21:00' });
  assert.equal(ok.error, undefined);
  assert.equal(ok.fields.schedule_enabled, 1);
  assert.equal(ok.fields.schedule_open_time, '09:00');
});

test('buildTemplateFields allows disabling a schedule without supplying times', () => {
  const { fields, error } = buildTemplateFields({ scheduleEnabled: false });
  assert.equal(error, undefined);
  assert.equal(fields.schedule_enabled, 0);
  assert.equal(fields.schedule_open_time, null);
});

test('buildTemplateFields requires a valid playlist only when signage is enabled', () => {
  const bad = buildTemplateFields({ signageEnabled: true, signageUrls: '' });
  assert.match(bad.error, /קישור אחד/);
  const ok = buildTemplateFields({ signageEnabled: true, signageUrls: 'https://a.example.com\nhttps://b.example.com', signageIntervalSeconds: 20 });
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.fields.signage_urls, 'https://a.example.com\nhttps://b.example.com');
  assert.equal(ok.fields.signage_interval_seconds, 20);
});

test('buildTemplateFields rejects a non-URL displayZoomPercent-style bad homeUrl', () => {
  assert.match(buildTemplateFields({ homeUrl: 'not a url' }).error, /כתובת אתר/);
  assert.equal(buildTemplateFields({ homeUrl: '' }).fields.home_url, null);
});

test('buildTemplateFields rejects a non-http(s) homeUrl the same way normalizeHomeUrl does everywhere else', () => {
  // A template's home_url is copied verbatim into a device's home_url the
  // moment it is applied (policyPatchFromTemplate + POST /templates/:id/apply)
  // — this door used to only check `new URL()` doesn't throw, which passes
  // `javascript://x` straight through (its `.host` is non-empty, so even a
  // host-only check misses it too).
  assert.equal(buildTemplateFields({ homeUrl: 'javascript://x' }).error, 'האתר הראשי חייב להתחיל ב-http:// או ב-https://');
  assert.equal(buildTemplateFields({ homeUrl: 'javascript:alert(1)' }).error, 'האתר הראשי חייב להתחיל ב-http:// או ב-https://');
  assert.equal(buildTemplateFields({ homeUrl: 'data:text/html,<script>1</script>' }).error, 'האתר הראשי חייב להתחיל ב-http:// או ב-https://');
  assert.equal(buildTemplateFields({ homeUrl: 'ftp://example.com/x' }).error, 'האתר הראשי חייב להתחיל ב-http:// או ב-https://');
  assert.equal(buildTemplateFields({ homeUrl: '  https://example.com  ' }).fields.home_url, 'https://example.com');
});

test('buildTemplateFields accepts a maintenance flag+message and rejects an over-long one', () => {
  const ok = buildTemplateFields({ maintenanceEnabled: true, maintenanceMessage: 'בתחזוקה עד הערב' });
  assert.equal(ok.error, undefined);
  assert.equal(ok.fields.maintenance_enabled, 1);
  assert.equal(ok.fields.maintenance_message, 'בתחזוקה עד הערב');
  const bad = buildTemplateFields({ maintenanceEnabled: true, maintenanceMessage: 'א'.repeat(201) });
  assert.match(bad.error, /ארוכה מדי/);
});

test('buildTemplateFields allows disabling maintenance without a message', () => {
  const { fields, error } = buildTemplateFields({ maintenanceEnabled: false });
  assert.equal(error, undefined);
  assert.equal(fields.maintenance_enabled, 0);
  assert.equal(fields.maintenance_message, null);
});

test('buildTemplateFields accepts each of the 3 payment modes plus "none"', () => {
  for (const mode of ['none', 'manual', 'reader_prefill', 'emv_terminal']) {
    const { fields, error } = buildTemplateFields({ paymentMode: mode });
    assert.equal(error, undefined);
    assert.equal(fields.payment_mode, mode);
  }
});

test('buildTemplateFields rejects an unsupported paymentMode', () => {
  assert.match(buildTemplateFields({ paymentMode: 'hid_magstripe' }).error, /לא נתמך/);
});

test('buildTemplateFields leaves payment_mode out entirely when untouched', () => {
  assert.ok(!('payment_mode' in buildTemplateFields({}).fields));
});

test('buildTemplateFields clamps exitGestureTaps/HoldMs and treats null/"" as unset', () => {
  assert.equal(buildTemplateFields({ exitGestureTaps: 1 }).fields.exit_gesture_taps, 3);
  assert.equal(buildTemplateFields({ exitGestureTaps: 999 }).fields.exit_gesture_taps, 10);
  assert.equal(buildTemplateFields({ exitGestureTaps: null }).fields.exit_gesture_taps, null);
  assert.equal(buildTemplateFields({ exitGestureTaps: '' }).fields.exit_gesture_taps, null);
  assert.equal(buildTemplateFields({ exitGestureHoldMs: 99999 }).fields.exit_gesture_hold_ms, 5000);
  assert.equal(buildTemplateFields({ exitGestureHoldMs: null }).fields.exit_gesture_hold_ms, null);
});

test('buildTemplateFields accepts every §4 gesture corner and rejects an unknown one', () => {
  for (const c of GESTURE_CORNERS) {
    const { fields, error } = buildTemplateFields({ exitGestureCorner: c });
    assert.equal(error, undefined);
    assert.equal(fields.exit_gesture_corner, c);
  }
  assert.match(buildTemplateFields({ exitGestureCorner: 'center' }).error, /לא נתמכת/);
});

test('policyPatchFromTemplate carries exit-gesture fields only when the template row sets them', () => {
  const untouched = {
    home_url: null, allowed_host: null, idle_return_seconds: null, exit_code: null,
    display_zoom_percent: null, schedule_enabled: null, schedule_open_time: null,
    schedule_close_time: null, signage_enabled: null, signage_urls: null, signage_interval_seconds: null,
    exit_gesture_taps: null, exit_gesture_corner: null, exit_gesture_hold_ms: null,
  };
  assert.deepEqual(policyPatchFromTemplate(untouched), {});
  const touched = { ...untouched, exit_gesture_taps: 7, exit_gesture_corner: 'br', exit_gesture_hold_ms: 1500 };
  assert.deepEqual(policyPatchFromTemplate(touched), {
    exitGestureTaps: 7, exitGestureCorner: 'br', exitGestureHoldMs: 1500,
  });
});

test('policyPatchFromTemplate includes only the columns a template row actually sets', () => {
  const row = {
    home_url: null, allowed_host: 'example.com', idle_return_seconds: null,
    exit_code: '', display_zoom_percent: 150,
    schedule_enabled: null, schedule_open_time: null, schedule_close_time: null,
    signage_enabled: 1, signage_urls: 'https://a.example.com', signage_interval_seconds: 20,
  };
  const patch = policyPatchFromTemplate(row);
  assert.deepEqual(patch, {
    allowedHost: 'example.com',
    exitCode: '',
    displayZoomPercent: 150,
    signageEnabled: true,
    signageUrls: 'https://a.example.com',
    signageIntervalSeconds: 20,
  });
});

test('policyPatchFromTemplate on an all-null row (a template that sets nothing) is an empty patch', () => {
  const row = {
    home_url: null, allowed_host: null, idle_return_seconds: null, exit_code: null,
    display_zoom_percent: null, schedule_enabled: null, schedule_open_time: null,
    schedule_close_time: null, signage_enabled: null, signage_urls: null, signage_interval_seconds: null,
  };
  assert.deepEqual(policyPatchFromTemplate(row), {});
});

test('templateColumns is a fixed whitelist, not derived from any request', () => {
  const cols = templateColumns();
  assert.ok(cols.includes('name'));
  assert.ok(cols.includes('signage_interval_seconds'));
  assert.ok(cols.includes('maintenance_enabled'));
  assert.ok(cols.includes('maintenance_message'));
  assert.ok(cols.includes('payment_mode'));
  assert.ok(cols.includes('display_orientation'));
  assert.equal(new Set(cols).size, cols.length);
});

test('policyPatchFromTemplate carries displayOrientation only when the template row sets it', () => {
  const untouched = {
    home_url: null, allowed_host: null, idle_return_seconds: null, exit_code: null,
    display_zoom_percent: null, schedule_enabled: null, schedule_open_time: null,
    schedule_close_time: null, signage_enabled: null, signage_urls: null, signage_interval_seconds: null,
    display_orientation: null,
  };
  assert.deepEqual(policyPatchFromTemplate(untouched), {});
  const touched = { ...untouched, display_orientation: 'portrait' };
  assert.deepEqual(policyPatchFromTemplate(touched), { displayOrientation: 'portrait' });
});


test('policyPatchFromTemplate carries maintenance fields when the template sets them', () => {
  const row = {
    home_url: null, allowed_host: null, idle_return_seconds: null, exit_code: null,
    display_zoom_percent: null, schedule_enabled: null, schedule_open_time: null,
    schedule_close_time: null, signage_enabled: null, signage_urls: null, signage_interval_seconds: null,
    maintenance_enabled: 1, maintenance_message: 'סגור לתחזוקה',
  };
  assert.deepEqual(policyPatchFromTemplate(row), {
    maintenanceEnabled: true,
    maintenanceMessage: 'סגור לתחזוקה',
  });
});

test('policyPatchFromTemplate carries paymentMode when the template sets it, omits it when NULL', () => {
  const withPayment = {
    home_url: null, allowed_host: null, idle_return_seconds: null, exit_code: null,
    display_zoom_percent: null, schedule_enabled: null, schedule_open_time: null,
    schedule_close_time: null, signage_enabled: null, signage_urls: null, signage_interval_seconds: null,
    payment_mode: 'emv_terminal',
  };
  assert.deepEqual(policyPatchFromTemplate(withPayment), { paymentMode: 'emv_terminal' });

  const withoutPayment = { ...withPayment, payment_mode: null };
  assert.equal('paymentMode' in policyPatchFromTemplate(withoutPayment), false);
});
