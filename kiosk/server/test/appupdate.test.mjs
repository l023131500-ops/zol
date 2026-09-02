/**
 * appupdate.js is the pure logic behind KIOSK_BUILD.md §8's app half of
 * "עדכון מרחוק (OTA) של מדיניות ושל האפליקציה" — no database/express
 * dependency, exercised directly the same way qrprovision.test.mjs covers
 * its own config-driven builder.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isUpdateAvailable, validateLatestVersion, buildUpdateAppPayload } from '../src/appupdate.js';

const VALID_CHECKSUM = 'gJD2YwtOiWJHkSMkkIfLRlj-quNqG1fb6v100QmzM9w';
const VALID_APK_URL = 'https://cdn.example.com/kioskfleet-agent.apk';

function baseConfig(extra = {}) {
  return {
    kioskAgentApkUrl: VALID_APK_URL,
    kioskAgentApkSignatureChecksum: VALID_CHECKSUM,
    kioskAgentLatestVersion: '1.3.0',
    ...extra,
  };
}

test('isUpdateAvailable compares device vs latest exactly', () => {
  assert.equal(isUpdateAvailable('1.2.0', '1.3.0'), true);
  assert.equal(isUpdateAvailable('1.3.0', '1.3.0'), false);
  assert.equal(isUpdateAvailable(' 1.3.0 ', '1.3.0'), false);
});

test('isUpdateAvailable is false with no data to compare, not true', () => {
  // A device that never enrolled/never reported a version is not "behind" —
  // there is nothing to be behind on.
  assert.equal(isUpdateAvailable(null, '1.3.0'), false);
  assert.equal(isUpdateAvailable('', '1.3.0'), false);
  assert.equal(isUpdateAvailable('1.2.0', ''), false);
  assert.equal(isUpdateAvailable(undefined, undefined), false);
});

test('validateLatestVersion rejects empty, accepts a free-form string', () => {
  assert.throws(() => validateLatestVersion(''), /KIOSK_AGENT_LATEST_VERSION/);
  assert.throws(() => validateLatestVersion(undefined), /KIOSK_AGENT_LATEST_VERSION/);
  assert.equal(validateLatestVersion(' 1.3.0 '), '1.3.0');
  assert.equal(validateLatestVersion('2026.08.25-build42'), '2026.08.25-build42');
});

test('buildUpdateAppPayload returns apkUrl/checksum/version from config', () => {
  const payload = buildUpdateAppPayload(baseConfig());
  assert.deepEqual(payload, { apkUrl: VALID_APK_URL, checksum: VALID_CHECKSUM, version: '1.3.0' });
});

test('buildUpdateAppPayload refuses when any of the three is missing', () => {
  assert.throws(() => buildUpdateAppPayload(baseConfig({ kioskAgentApkUrl: '' })), /KIOSK_AGENT_APK_URL/);
  assert.throws(() => buildUpdateAppPayload(baseConfig({ kioskAgentApkSignatureChecksum: '' })), /KIOSK_AGENT_APK_SIGNATURE_CHECKSUM/);
  assert.throws(() => buildUpdateAppPayload(baseConfig({ kioskAgentLatestVersion: '' })), /KIOSK_AGENT_LATEST_VERSION/);
});
