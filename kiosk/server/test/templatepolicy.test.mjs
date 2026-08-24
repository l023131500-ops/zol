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
  assert.equal(new Set(cols).size, cols.length);
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
