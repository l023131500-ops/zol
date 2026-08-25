/**
 * qrprovision.js turns an enrollment code into the QR provisioning payload
 * for KIOSK_BUILD.md Sec.3 Route A (Android + GMS, QR/zero-touch). No
 * database/express dependency, so it is exercised for real — same shape
 * usbpackage.js/windowspackage.js's own tests already use for logic this
 * sandbox cannot execute end-to-end (no real device to scan a QR with).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_ADMIN_COMPONENT_NAME, validateApkSignatureChecksum, validateApkDownloadUrl,
  buildWifiFields, buildQrProvisioningPayload,
} from '../src/qrprovision.js';

const VALID_CHECKSUM = 'gJD2YwtOiWJHkSMkkIfLRlj-quNqG1fb6v100QmzM9w';
const VALID_APK_URL = 'https://cdn.example.com/kioskfleet-agent.apk';

function baseArgs(extra = {}) {
  return {
    code: 'ab12cd', serverUrl: 'https://kiosk.more30.com',
    apkUrl: VALID_APK_URL, apkSignatureChecksum: VALID_CHECKSUM, ...extra,
  };
}

test('validateApkDownloadUrl requires https', () => {
  assert.throws(() => validateApkDownloadUrl('http://insecure.example.com/a.apk'), /KIOSK_AGENT_APK_URL/);
  assert.throws(() => validateApkDownloadUrl('not a url'), /KIOSK_AGENT_APK_URL/);
  assert.throws(() => validateApkDownloadUrl(''), /KIOSK_AGENT_APK_URL/);
  assert.throws(() => validateApkDownloadUrl(undefined), /KIOSK_AGENT_APK_URL/);
  assert.equal(validateApkDownloadUrl(VALID_APK_URL), VALID_APK_URL);
});

test('validateApkSignatureChecksum requires a base64url-shaped string', () => {
  assert.throws(() => validateApkSignatureChecksum(''), /KIOSK_AGENT_APK_SIGNATURE_CHECKSUM/);
  assert.throws(() => validateApkSignatureChecksum(undefined), /KIOSK_AGENT_APK_SIGNATURE_CHECKSUM/);
  assert.throws(() => validateApkSignatureChecksum('has spaces in it'), /KIOSK_AGENT_APK_SIGNATURE_CHECKSUM/);
  assert.throws(() => validateApkSignatureChecksum('short'), /KIOSK_AGENT_APK_SIGNATURE_CHECKSUM/);
  assert.throws(() => validateApkSignatureChecksum('has+plus/slash=pad'), /KIOSK_AGENT_APK_SIGNATURE_CHECKSUM/);
  assert.equal(validateApkSignatureChecksum(VALID_CHECKSUM), VALID_CHECKSUM);
  assert.equal(validateApkSignatureChecksum(`  ${VALID_CHECKSUM}  `), VALID_CHECKSUM);
});

test('buildWifiFields returns nothing when no SSID is given', () => {
  assert.deepEqual(buildWifiFields({}), {});
  assert.deepEqual(buildWifiFields({ wifiPassword: 'secret' }), {});
});

test('buildWifiFields defaults an unknown/missing security type to WPA', () => {
  assert.deepEqual(buildWifiFields({ wifiSsid: 'Venue-WiFi', wifiPassword: 'secret' }), {
    'android.app.extra.PROVISIONING_WIFI_SSID': 'Venue-WiFi',
    'android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE': 'WPA',
    'android.app.extra.PROVISIONING_WIFI_PASSWORD': 'secret',
  });
});

test('buildWifiFields omits the password for an open (NONE) network', () => {
  const fields = buildWifiFields({ wifiSsid: 'Open-WiFi', wifiPassword: 'ignored', wifiSecurityType: 'none' });
  assert.deepEqual(fields, {
    'android.app.extra.PROVISIONING_WIFI_SSID': 'Open-WiFi',
    'android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE': 'NONE',
  });
});

test('buildWifiFields is case-insensitive on the security type', () => {
  const fields = buildWifiFields({ wifiSsid: 'Venue-WiFi', wifiPassword: 'secret', wifiSecurityType: 'wep' });
  assert.equal(fields['android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE'], 'WEP');
});

test('buildQrProvisioningPayload rejects a malformed enrollment code', () => {
  assert.throws(() => buildQrProvisioningPayload(baseArgs({ code: '' })), /6-character enrollment code/);
  assert.throws(() => buildQrProvisioningPayload(baseArgs({ code: 'toolong123' })), /6-character enrollment code/);
  assert.throws(() => buildQrProvisioningPayload(baseArgs({ code: '!!!!!!' })), /6-character enrollment code/);
});

test('buildQrProvisioningPayload rejects an invalid serverUrl', () => {
  assert.throws(() => buildQrProvisioningPayload(baseArgs({ serverUrl: 'not a url' })), /serverUrl must be a valid URL/);
  assert.throws(() => buildQrProvisioningPayload(baseArgs({ serverUrl: '' })), /serverUrl must be a valid URL/);
});

test('buildQrProvisioningPayload surfaces the "not configured" error when the APK URL/checksum are missing', () => {
  assert.throws(() => buildQrProvisioningPayload(baseArgs({ apkUrl: '' })), /KIOSK_AGENT_APK_URL/);
  assert.throws(() => buildQrProvisioningPayload(baseArgs({ apkSignatureChecksum: '' })), /KIOSK_AGENT_APK_SIGNATURE_CHECKSUM/);
});

test('buildQrProvisioningPayload uppercases the code and strips a trailing slash from serverUrl', () => {
  const payload = buildQrProvisioningPayload(baseArgs({ code: 'ab12cd', serverUrl: 'https://kiosk.more30.com/' }));
  assert.deepEqual(payload['android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE'], {
    server: 'https://kiosk.more30.com', code: 'AB12CD',
  });
});

test('buildQrProvisioningPayload uses the standard DevicePolicyManager provisioning extra keys', () => {
  const payload = buildQrProvisioningPayload(baseArgs());
  assert.equal(payload['android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME'], DEVICE_ADMIN_COMPONENT_NAME);
  assert.equal(payload['android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION'], VALID_APK_URL);
  assert.equal(payload['android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM'], VALID_CHECKSUM);
  assert.equal(payload['android.app.extra.PROVISIONING_SKIP_ENCRYPTION'], false);
  assert.equal(payload['android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED'], false);
});

test('DEVICE_ADMIN_COMPONENT_NAME matches the same package/receiver Route B/D already provision as Device Owner', () => {
  assert.equal(DEVICE_ADMIN_COMPONENT_NAME, 'com.kioskfleet.agent/.KioskDeviceAdminReceiver');
});

test('buildQrProvisioningPayload with no Wi-Fi args has no Wi-Fi keys at all', () => {
  const payload = buildQrProvisioningPayload(baseArgs());
  const wifiKeys = Object.keys(payload).filter((k) => k.includes('WIFI'));
  assert.deepEqual(wifiKeys, []);
});

test('buildQrProvisioningPayload includes Wi-Fi keys when given an SSID', () => {
  const payload = buildQrProvisioningPayload(baseArgs({ wifiSsid: 'Venue-WiFi', wifiPassword: 'secret' }));
  assert.equal(payload['android.app.extra.PROVISIONING_WIFI_SSID'], 'Venue-WiFi');
  assert.equal(payload['android.app.extra.PROVISIONING_WIFI_PASSWORD'], 'secret');
});

test('buildQrProvisioningPayload never embeds a live deviceToken (only the short-lived enrollment code)', () => {
  const payload = buildQrProvisioningPayload(baseArgs());
  const serialized = JSON.stringify(payload);
  assert.ok(!serialized.includes('deviceToken'));
});

test('the payload is valid JSON round-trippable end to end (what the console actually shows/copies)', () => {
  const payload = buildQrProvisioningPayload(baseArgs({ wifiSsid: 'Venue-WiFi', wifiPassword: 'secret' }));
  const json = JSON.stringify(payload, null, 2);
  assert.deepEqual(JSON.parse(json), payload);
});
