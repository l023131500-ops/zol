// KIOSK_BUILD.md §3 Route A (Android + GMS, QR/zero-touch) + §10-A —
// "בונים גם A וגם B (וגם C ל-Windows ו-D ל-USB) — הם משלימים, לא מתחרים"
// (owner decision, locked). Routes B (Device Owner via ADB, the original
// beta) and C/D (first slices, prior rounds) already ship; Route A had zero
// coverage anywhere in this project before this round — nothing ever
// generated the QR payload §10-A's own install steps describe ("הקשה 6× על
// המסך → סורק QR").
//
// This is the standard Device Owner QR provisioning mechanism Android has
// shipped since 6.0: a JSON blob rendered as a QR code, scanned from a
// factory-reset device's Welcome screen (tap the screen six times to summon
// the QR scanner), which downloads a DPC APK, verifies its signing
// certificate against a checksum, and sets it as Device Owner — the same
// `dpm set-device-owner` outcome Route B reaches over ADB and Route D
// reaches over USB, without either. developer.android.com's dedicated-devices
// QR page 404'd when checked (24/08/2026) — verified instead against
// DevicePolicyManager's own stable `android.app.extra.PROVISIONING_*` extra
// names (unchanged since API 23) as reproduced consistently across multiple
// EMM vendors' published QR payload examples (Codeproof, and a
// community-maintained field reference), not assumed from memory alone.
//
// Unlike Route D's offline JSON (usbpackage.js), which carries a live,
// unlimited-lifetime deviceToken because it never leaves an air-gapped
// USB/adb transfer, this payload only ever carries a short-lived, single-use
// *enrollment code* — the same one Route B's manual "type 6 characters" entry
// already redeems — because a QR code is something that gets printed,
// displayed on a screen, or photographed. routes/agent.js's `enrollLimiter`
// and the code's own used/expires_at columns already cover that path; a bare
// deviceToken in a QR would have bypassed both protections for no reason.
// The device redeems it exactly the way EnrollActivity's manual flow already
// does, once Device Owner provisioning hands the app that code (see
// EnrollActivity.kt's onCreate QR-extras check).

export const DEVICE_ADMIN_COMPONENT_NAME = 'com.kioskfleet.agent/.KioskDeviceAdminReceiver';

// Every published example (Google's own EMM API docs, Codeproof, community
// references) is a standard unpadded base64url SHA-256: 43 chars for a
// SIGNATURE_CHECKSUM. Bounded loosely (20-64) rather than pinned to exactly
// 43 so a legitimate future checksum format is not rejected by an
// over-specific regex — the alphabet check is what actually matters here.
const CHECKSUM_RE = /^[A-Za-z0-9_-]{20,64}$/;
const ENROLLMENT_CODE_RE = /^[A-Z0-9]{6}$/;
const WIFI_SECURITY_TYPES = new Set(['WPA', 'WEP', 'NONE']);

/** Throws a Hebrew, console-facing message rather than silently building a QR the device cannot use. */
export function validateApkSignatureChecksum(raw) {
  const v = String(raw ?? '').trim();
  if (!CHECKSUM_RE.test(v)) {
    throw new Error('מסלול A לא מוגדר: חסר/שגוי KIOSK_AGENT_APK_SIGNATURE_CHECKSUM (ראו NEEDS_USER.md)');
  }
  return v;
}

export function validateApkDownloadUrl(raw) {
  const v = String(raw ?? '').trim();
  let u;
  try { u = new URL(v); } catch { u = null; }
  if (!u || u.protocol !== 'https:') {
    throw new Error('מסלול A לא מוגדר: חסר/שגוי KIOSK_AGENT_APK_URL (חייב https://, ראו NEEDS_USER.md)');
  }
  return v;
}

/**
 * §10-A assumes a connected device; a factory-reset unit at a venue with no
 * Wi-Fi typed in yet cannot download the DPC APK during provisioning at all,
 * so the two Wi-Fi fields are optional but, when given, are shaped the same
 * shallow way hosts.js validates everything server-side rather than trusted
 * straight into the payload. No SSID → no Wi-Fi block at all (device relies
 * on whatever network the setup wizard already joined), matching how an
 * empty allow-list means "no lock" elsewhere in this project rather than an
 * empty-but-present list.
 */
export function buildWifiFields({ wifiSsid, wifiPassword, wifiSecurityType } = {}) {
  const ssid = String(wifiSsid ?? '').trim();
  if (!ssid) return {};
  const requestedSecurity = String(wifiSecurityType ?? '').trim().toUpperCase();
  const security = WIFI_SECURITY_TYPES.has(requestedSecurity) ? requestedSecurity : 'WPA';
  const fields = {
    'android.app.extra.PROVISIONING_WIFI_SSID': ssid,
    'android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE': security,
  };
  if (security !== 'NONE' && wifiPassword) {
    fields['android.app.extra.PROVISIONING_WIFI_PASSWORD'] = String(wifiPassword);
  }
  return fields;
}

/**
 * Builds the full QR JSON payload for one (unused) enrollment code. Pure
 * object building — no fs/child_process/express, no config.js import — same
 * "generate now, verify by inspection" shape windowspackage.js/usbpackage.js
 * already established for logic this sandbox cannot execute end-to-end (no
 * real device to actually scan the code with). `apkUrl`/`apkSignatureChecksum`
 * are the caller's job to source (routes/devices.js reads them from
 * `config.js`) and validate through this module's own two validators before
 * calling — the same "caller composes, module validates" split
 * buildWindowsKioskScript/buildUsbOfflineScript already use for homeUrl.
 *
 * `serverUrl` is likewise the caller's job to compose — routes/devices.js
 * uses `config.publicUrl + config.basePath`, the same pair index.js's own
 * startup log already prints together.
 */
export function buildQrProvisioningPayload({
  code, serverUrl, apkUrl, apkSignatureChecksum, wifiSsid, wifiPassword, wifiSecurityType,
} = {}) {
  const cleanCode = String(code ?? '').trim().toUpperCase();
  if (!ENROLLMENT_CODE_RE.test(cleanCode)) throw new Error('code must be the 6-character enrollment code');

  const cleanServer = String(serverUrl ?? '').trim().replace(/\/+$/, '');
  try { new URL(cleanServer); } catch { throw new Error('serverUrl must be a valid URL'); }

  const cleanApkUrl = validateApkDownloadUrl(apkUrl);
  const cleanChecksum = validateApkSignatureChecksum(apkSignatureChecksum);

  return {
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME': DEVICE_ADMIN_COMPONENT_NAME,
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': cleanApkUrl,
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM': cleanChecksum,
    'android.app.extra.PROVISIONING_SKIP_ENCRYPTION': false,
    'android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED': false,
    ...buildWifiFields({ wifiSsid, wifiPassword, wifiSecurityType }),
    // Read back by EnrollActivity.kt's QR path via
    // DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE — the one
    // channel DevicePolicyManager hands the freshly-provisioned app after
    // Device Owner is set. Deliberately just these two fields (not the full
    // enroll body): `serial` is read on-device (Prefs.serial(this)) the same
    // way the manual-entry path already reads it, and every other device
    // field (homeUrl, allowedHost, adminCode, ...) already rides the normal
    // POST /api/agent/enroll response once this code is redeemed — this
    // bundle only has to get the app to make that call automatically.
    'android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE': {
      server: cleanServer,
      code: cleanCode,
    },
  };
}
