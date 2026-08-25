/**
 * usbpackage.js turns a device's config into the fully-offline USB/adb
 * install script (KIOSK_BUILD.md Sec.3 Route D). No database/express
 * dependency, so it is exercised for real — same shape windowspackage.js's
 * own tests already use for logic this sandbox cannot execute end-to-end (no
 * real device/adb host here either).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeSerial, shQuote, sanitizeApkFilename, buildOfflineEnrollPayload, buildUsbOfflineScript,
  OFFLINE_CONFIG_PATH, PACKAGE_NAME,
} from '../src/usbpackage.js';

test('sanitizeSerial strips everything but letters/digits/:/_/.- and caps length', () => {
  assert.equal(sanitizeSerial(' AB-12:34.cd_ef!! '), 'AB-12:34.cd_ef');
  assert.equal(sanitizeSerial('a'.repeat(100)), 'a'.repeat(64));
  assert.equal(sanitizeSerial(''), '');
  assert.equal(sanitizeSerial(undefined), '');
});

test('shQuote wraps in single quotes and escapes an embedded single quote', () => {
  assert.equal(shQuote('plain'), "'plain'");
  assert.equal(shQuote("it's"), "'it'\\''s'");
  assert.equal(shQuote(null), "''");
  assert.equal(shQuote(undefined), "''");
});

test('shQuote neutralises a command-substitution injection attempt', () => {
  const malicious = '$(rm -rf /)';
  assert.equal(shQuote(malicious), "'" + malicious + "'");
});

test('buildOfflineEnrollPayload requires deviceToken and homeUrl', () => {
  assert.throws(() => buildOfflineEnrollPayload({}), /deviceToken is required/);
  assert.throws(() => buildOfflineEnrollPayload({ deviceToken: 't' }), /homeUrl is required/);
});

test('buildOfflineEnrollPayload matches the shape /api/agent/enroll already returns', () => {
  const payload = buildOfflineEnrollPayload({
    deviceToken: 'tok123', name: 'Kiosk 1', homeUrl: 'https://venue.example.com',
    allowedHost: 'venue.example.com,pay.example.com', idleReturnSeconds: 30,
    adminCode: '1379', displayZoomPercent: 150, displayOrientation: 'portrait',
    approvedClients: [{ code: 'A1' }],
    exitGestureTaps: 7, exitGestureCorner: 'br', exitGestureHoldMs: 1500,
  });
  assert.deepEqual(payload, {
    deviceToken: 'tok123',
    device: {
      name: 'Kiosk 1', homeUrl: 'https://venue.example.com',
      allowedHost: 'venue.example.com,pay.example.com', idleReturnSeconds: 30,
      adminCode: '1379', displayZoomPercent: 150, displayOrientation: 'portrait',
      approvedClients: [{ code: 'A1' }],
      exitGestureTaps: 7, exitGestureCorner: 'br', exitGestureHoldMs: 1500,
    },
  });
});

test('buildOfflineEnrollPayload defaults optional fields the same way enroll() does', () => {
  const payload = buildOfflineEnrollPayload({ deviceToken: 't', homeUrl: 'https://venue.example.com' });
  assert.deepEqual(payload.device, {
    name: '', homeUrl: 'https://venue.example.com', allowedHost: '',
    idleReturnSeconds: 0, adminCode: '', displayZoomPercent: 100, displayOrientation: 'landscape',
    approvedClients: [],
    exitGestureTaps: 5, exitGestureCorner: 'tl', exitGestureHoldMs: 0,
  });
});

test('buildUsbOfflineScript rejects missing serial, homeUrl, or deviceToken', () => {
  assert.throws(() => buildUsbOfflineScript({}), /serial is required/);
  assert.throws(() => buildUsbOfflineScript({ serial: 'ABC123' }), /homeUrl is required/);
  assert.throws(() => buildUsbOfflineScript({ serial: 'ABC123', homeUrl: 'not a url' }), /valid URL/);
  assert.throws(
    () => buildUsbOfflineScript({ serial: 'ABC123', homeUrl: 'https://venue.example.com' }),
    /deviceToken is required/
  );
});

test('buildUsbOfflineScript rejects a javascript:/data: homeUrl the same way every other door does', () => {
  assert.throws(
    () => buildUsbOfflineScript({ serial: 'ABC123', homeUrl: 'javascript:alert(document.cookie)' }),
    /valid URL/
  );
  assert.throws(
    () => buildUsbOfflineScript({ serial: 'ABC123', homeUrl: 'data:text/html,<script>alert(1)</script>' }),
    /valid URL/
  );
});

function baseArgs(extra = {}) {
  return {
    serial: 'R58N123ABCD', homeUrl: 'https://venue.example.com/kiosk',
    allowedHost: 'venue.example.com', deviceToken: 'TOKEN123', ...extra,
  };
}

test('buildUsbOfflineScript pins EXPECTED_SERIAL to the sanitized serial', () => {
  const script = buildUsbOfflineScript(baseArgs());
  assert.match(script, /EXPECTED_SERIAL='R58N123ABCD'/);
});

test('buildUsbOfflineScript refuses to run against a mismatched connected device (script logic, not just data)', () => {
  const script = buildUsbOfflineScript(baseArgs());
  assert.match(script, /if \[ "\$CONNECTED" != "\$EXPECTED_SERIAL" \]; then/);
  assert.match(script, /does not match the serial this package was generated for/);
});

test('buildUsbOfflineScript requires exactly one authorized device attached', () => {
  const script = buildUsbOfflineScript(baseArgs());
  assert.match(script, /"\$COUNT" -eq 0/);
  assert.match(script, /"\$COUNT" -gt 1/);
});

test('buildUsbOfflineScript references the app-specific external files path and package name', () => {
  const script = buildUsbOfflineScript(baseArgs());
  assert.ok(script.includes(OFFLINE_CONFIG_PATH));
  assert.ok(script.includes(`${PACKAGE_NAME}/.KioskDeviceAdminReceiver`));
  assert.ok(script.includes(`${PACKAGE_NAME}/.EnrollActivity`));
});

test('buildUsbOfflineScript embeds the exact offline-enroll JSON payload in a quoted heredoc', () => {
  const script = buildUsbOfflineScript(baseArgs({ deviceName: 'Front Desk', idleReturnSeconds: 45 }));
  assert.match(script, /<<'KIOSKFLEET_OFFLINE_CONFIG_EOF'/);
  const payload = buildOfflineEnrollPayload({
    deviceToken: 'TOKEN123', name: 'Front Desk', homeUrl: 'https://venue.example.com/kiosk',
    allowedHost: 'venue.example.com', idleReturnSeconds: 45,
  });
  assert.ok(script.includes(JSON.stringify(payload, null, 2)));
});

test('buildUsbOfflineScript carries displayOrientation into the embedded JSON payload', () => {
  const script = buildUsbOfflineScript(baseArgs({ displayOrientation: 'portrait' }));
  const payload = buildOfflineEnrollPayload({
    deviceToken: 'TOKEN123', homeUrl: 'https://venue.example.com/kiosk',
    allowedHost: 'venue.example.com', displayOrientation: 'portrait',
  });
  assert.ok(script.includes(JSON.stringify(payload, null, 2)));
  assert.match(script, /"displayOrientation": "portrait"/);
});

test('buildUsbOfflineScript carries exit-gesture settings into the embedded JSON payload', () => {
  const script = buildUsbOfflineScript(baseArgs({ exitGestureTaps: 8, exitGestureCorner: 'bl', exitGestureHoldMs: 2000 }));
  const payload = buildOfflineEnrollPayload({
    deviceToken: 'TOKEN123', homeUrl: 'https://venue.example.com/kiosk',
    allowedHost: 'venue.example.com',
    exitGestureTaps: 8, exitGestureCorner: 'bl', exitGestureHoldMs: 2000,
  });
  assert.ok(script.includes(JSON.stringify(payload, null, 2)));
  assert.match(script, /"exitGestureTaps": 8/);
  assert.match(script, /"exitGestureCorner": "bl"/);
  assert.match(script, /"exitGestureHoldMs": 2000/);
});

test('buildUsbOfflineScript strips CR/LF from the device name before it reaches the header comment', () => {
  const script = buildUsbOfflineScript(baseArgs({ deviceName: 'evil\r\nInvoke-Evil' }));
  assert.ok(!script.includes('evil\r\nInvoke-Evil'));
  assert.match(script, /evil\s+Invoke-Evil/);
});

test('buildUsbOfflineScript falls back to the serial as the label when no device name is given', () => {
  const script = buildUsbOfflineScript(baseArgs());
  assert.match(script, /offline USB install for "R58N123ABCD"/);
});

test('buildUsbOfflineScript defaults the APK filename and accepts a custom one', () => {
  const withDefault = buildUsbOfflineScript(baseArgs());
  assert.match(withDefault, /APK_FILE="\$\{1:-kioskfleet-agent\.apk\}"/);
  const withCustom = buildUsbOfflineScript(baseArgs({ apkFilename: 'agent-v2.apk' }));
  assert.match(withCustom, /APK_FILE="\$\{1:-agent-v2\.apk\}"/);
});

test('buildUsbOfflineScript strips quotes/newlines/slashes out of a hostile apkFilename', () => {
  const script = buildUsbOfflineScript(baseArgs({ apkFilename: 'evil".apk\r\nrm -rf /' }));
  assert.ok(!script.includes('evil".apk'));
  assert.match(script, /APK_FILE="\$\{1:-evil\.apkrm -rf\}"/);
});

test('sanitizeApkFilename strips everything but letters/digits/space/./_/- and falls back to the default', () => {
  assert.equal(sanitizeApkFilename('agent v2!.apk'), 'agent v2.apk');
  assert.equal(sanitizeApkFilename(''), 'kioskfleet-agent.apk');
  assert.equal(sanitizeApkFilename(undefined), 'kioskfleet-agent.apk');
  assert.equal(sanitizeApkFilename('$(rm -rf ~)`whoami`.apk'), 'rm -rf whoami.apk');
});

// Regression: an owner-settable device name or APK filename containing `"`,
// `$(...)`, or backticks used to be spliced raw into an executable
// double-quoted `echo`/assignment line, letting it break out of the string
// or run a command substitution when the generated script executed. Fixed
// by routing the label through `shQuote` (single-quote wrapped, adjacent to
// a double-quoted prefix rather than embedded inside one) and by
// allow-listing the APK filename instead of only blacklisting `'"\r\n`.
test('a device name containing a double-quote and a command substitution cannot break out of the echo line', () => {
  const hostileName = 'Front Desk — "quoted" & $(rm -rf ~) `whoami`';
  const script = buildUsbOfflineScript(baseArgs({ deviceName: hostileName }));
  assert.match(script, /echo "KioskFleet: fully offline USB install for "'Front Desk — "quoted" & \$\(rm -rf ~\) `whoami`'/);
  // The offending text must appear only inside the single-quoted segment —
  // never left dangling in still-double-quoted, still-executable context.
  const echoLine = script.split('\n').find((l) => l.startsWith('echo "KioskFleet:'));
  assert.ok(echoLine.trimEnd().endsWith("`whoami`'"));
});

test('an APK filename containing a command substitution cannot reach the default-value assignment or the not-found message', () => {
  const hostile = 'evil$(rm -rf ~)`whoami`.apk';
  const script = buildUsbOfflineScript(baseArgs({ apkFilename: hostile }));
  assert.ok(!script.includes('$(rm -rf ~)'));
  assert.ok(!script.includes('`whoami`'));
  assert.match(script, /APK_FILE="\$\{1:-evilrm -rf whoami\.apk\}"/);
});

test('embedded JSON never contains a bare KIOSKFLEET_OFFLINE_CONFIG_EOF line, even with that text in a field', () => {
  const script = buildUsbOfflineScript(baseArgs({ deviceName: 'KIOSKFLEET_OFFLINE_CONFIG_EOF' }));
  const between = script.split("<<'KIOSKFLEET_OFFLINE_CONFIG_EOF'\n")[1].split('\nKIOSKFLEET_OFFLINE_CONFIG_EOF\n')[0];
  assert.ok(!between.split('\n').some((line) => line.trim() === 'KIOSKFLEET_OFFLINE_CONFIG_EOF'));
});
