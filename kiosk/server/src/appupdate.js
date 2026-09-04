// KIOSK_BUILD.md §8 "עדכון מרחוק (OTA) של מדיניות ושל האפליקציה כשיש רשת" —
// the policy half of this line already ships (routes/devices.js's
// update_config command, pushed on every heartbeat/edit); the *app* half
// never did. commands.js had no command type that told the agent to fetch a
// newer APK, so an owner who wanted a fleet on a new build had no remote
// path at all — only the one-at-a-time manual reinstall every prior round's
// Kotlin work implicitly assumed.
//
// Deliberately reuses KIOSK_AGENT_APK_URL/_SIGNATURE_CHECKSUM (qrprovision.js)
// rather than introducing a second pair of env vars: both are "download this
// APK and check it came from us" — Route A's QR payload just does that once,
// at first boot, while this does it again on a running device. One
// documented-missing-token entry in NEEDS_USER.md, not two.
import { validateApkDownloadUrl, validateApkSignatureChecksum } from './qrprovision.js';

// Same "loosely bounded, not over-specific" reasoning as qrprovision.js's
// CHECKSUM_RE: a version string is whatever the Android build set as
// versionName (BuildConfig.VERSION_NAME) — free-form, not required to be
// semver. Reject only empty/absurdly-long, not a shape.
const VERSION_RE = /^.{1,64}$/;

/** Throws a Hebrew, console-facing message — same shape as qrprovision.js's validators. */
export function validateLatestVersion(raw) {
  const v = String(raw ?? '').trim();
  if (!VERSION_RE.test(v)) {
    throw new Error('עדכון אפליקציה לא מוגדר: חסר KIOSK_AGENT_LATEST_VERSION (ראו NEEDS_USER.md)');
  }
  return v;
}

/**
 * A device that never reported a version (never enrolled/never sent a
 * heartbeat yet) is not "out of date" — there is nothing to compare against,
 * and pushing an update command at a device with no confirmed agent running
 * would just queue a command nobody redeems. Compares as plain strings
 * (exact match), on purpose: an owner who wants devices to move from
 * "1.2.0" to "1.2.0" (a re-signed rebuild with the same versionName) can
 * still force it — see buildUpdateAppPayload's `force` bypass in the route.
 */
export function isUpdateAvailable(deviceAppVersion, latestVersion) {
  const device = String(deviceAppVersion ?? '').trim();
  const latest = String(latestVersion ?? '').trim();
  if (!device || !latest) return false;
  return device !== latest;
}

/**
 * Builds the update_app command payload from server config alone — unlike
 * most command types (message text, unlock minutes, ...) this one never
 * trusts the browser's request body for apkUrl/checksum/version, the same
 * "server fills it from config, not from whatever the console POSTed"
 * choice the qr-package route already made for the identical fields. An
 * owner who could pass their own apkUrl here could push arbitrary code to
 * every Device Owner in their fleet from a single authenticated click.
 */
export function buildUpdateAppPayload(config) {
  // validateApkDownloadUrl/validateApkSignatureChecksum's own error text
  // says "מסלול A לא מוגדר" — correct in qrprovision.js's own QR-package
  // route, misleading here (an owner using update_app may never have
  // touched Route A). Re-wrapped with this route's own prefix; the env var
  // name in each message (what the owner actually needs to act on) is kept
  // as-is.
  try {
    return {
      apkUrl: validateApkDownloadUrl(config.kioskAgentApkUrl),
      checksum: validateApkSignatureChecksum(config.kioskAgentApkSignatureChecksum),
      version: validateLatestVersion(config.kioskAgentLatestVersion),
    };
  } catch (e) {
    const detail = e.message.replace(/^מסלול A לא מוגדר: /, '');
    throw new Error(`עדכון אפליקציה לא מוגדר: ${detail}`);
  }
}
