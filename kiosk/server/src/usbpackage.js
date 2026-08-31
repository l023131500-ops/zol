// KIOSK_BUILD.md §3 Route D (USB, fully offline) + §6 + §10-D —
// "בונים גם A וגם B (וגם C ל-Windows ו-D ל-USB) — הם משלימים, לא מתחרים"
// (owner decision, locked). Routes B (Android Device Owner via ADB, online)
// and C (Windows, first slice) already ship; this is Route D's first slice.
//
// The other three routes all still need a network round-trip at some point
// during setup: B's EnrollActivity POSTs the code to /api/agent/enroll over
// HTTP, and C's PowerShell script only configures the PC, not the connection
// it will use once the kiosk is running. §10-D's own steps are stricter —
// "חיבור למכשיר והרצה — בלי אינטרנט כלל" (connect to the device and run —
// with no internet at all) — so the device row (and its token) has to be
// minted *before* the technician ever leaves the desk, by the owner
// generating this package while online, not by the device phoning in from
// the venue the way every other route works.
//
// Shape: the server (routes/devices.js) provisions the `devices` row right
// away from an unused enrollment code plus a serial the owner already read
// off the physical unit (`adb devices`, done once at the desk, still with a
// network connection — nothing at the *venue* needs one). This module turns
// that already-provisioned device into a downloadable shell script + an
// embedded offline-enrollment JSON payload; the script pushes the JSON onto
// the device with `adb push` and starts the app, and EnrollActivity.kt reads
// it directly — the exact same envelope shape /api/agent/enroll's response
// already has, so one Kotlin code path applies both.
//
// Pure string templating — no fs/child_process/express — same "generate now,
// verify by inspection" shape windowspackage.js already established for
// logic this sandbox cannot execute end-to-end (no real device/adb host
// here either).

const PACKAGE_NAME = 'com.kioskfleet.agent';
const DEFAULT_APK_FILENAME = 'kioskfleet-agent.apk';
// The app's own app-specific external-storage directory: no storage
// permission needed on any API level (verified against Android's
// "App-specific directory access" doc — apps have always had unrestricted
// access to their own directory here, and scoped storage on API 29+ only
// restricts *other* apps' directories, not this one). It does not exist
// until the app has run at least once, though — the system creates it
// lazily on first getExternalFilesDir()/write, not at install time — which
// is why the generated script launches the app once, before pushing.
const OFFLINE_CONFIG_PATH = `/sdcard/Android/data/${PACKAGE_NAME}/files/offline_enroll.json`;

/** A device serial as `adb devices` prints it: letters/digits/:/_/.- only. */
export function sanitizeSerial(raw) {
  return String(raw ?? '').trim().replace(/[^A-Za-z0-9:_.-]/g, '').slice(0, 64);
}

/**
 * POSIX single-quoted shell string literal: doubling out to `'\''` is the
 * standard way to embed a literal `'` inside a single-quoted string (close
 * the quote, an escaped quote, reopen the quote). Everything else — `$`,
 * backticks, `"`, `(...)` — is inert inside single quotes, unlike a
 * double-quoted literal, which bash expands variables and `$(...)`
 * command substitutions inside of. Same purpose as windowspackage.js's
 * `psQuote`, for bash instead of PowerShell.
 */
export function shQuote(value) {
  return "'" + String(value ?? '').replace(/'/g, "'\\''") + "'";
}

/**
 * An APK filename embedded both as a bash default-value expansion
 * (`${1:-DEFAULT}`) and inside plain double-quoted `echo` text — two spots
 * `shQuote`'s single-quote wrapping does not fit (one is itself inside a
 * `${...}` expansion, the other sits mid-sentence). Allow-listing to the
 * characters a filename actually needs sidesteps quoting both places
 * instead of quoting each differently, the same shape `sanitizeSerial`/
 * windowspackage.js's `sanitizeKioskUsername` already use for the same
 * reason.
 */
export function sanitizeApkFilename(raw) {
  const cleaned = String(raw ?? '').replace(/[^A-Za-z0-9 ._-]/g, '').trim();
  return cleaned.slice(0, 120) || DEFAULT_APK_FILENAME;
}

/**
 * The exact envelope POST /api/agent/enroll already returns on success
 * ({ deviceToken, device: {...} }) — EnrollActivity.kt's offline path reuses
 * the same parsing the network path uses, so the two can never drift apart
 * on which fields get applied.
 */
export function buildOfflineEnrollPayload({
  deviceToken, name, homeUrl, allowedHost, idleReturnSeconds, adminCode, displayZoomPercent,
  displayOrientation, approvedClients,
} = {}) {
  if (!deviceToken) throw new Error('deviceToken is required');
  if (!homeUrl) throw new Error('homeUrl is required');
  return {
    deviceToken,
    device: {
      name: name || '',
      homeUrl,
      allowedHost: allowedHost || '',
      idleReturnSeconds: idleReturnSeconds ?? 0,
      adminCode: adminCode || '',
      displayZoomPercent: displayZoomPercent ?? 100,
      displayOrientation: displayOrientation || 'landscape',
      approvedClients: approvedClients ?? [],
    },
  };
}

/**
 * Builds the full install script text for one device. `configJson` is
 * embedded inside a single-quoted heredoc (`<<'EOF'`), which bash leaves
 * completely unexpanded — safe for raw JSON regardless of what a device
 * name/URL contains. The one thing a quoted heredoc cannot tolerate is a
 * line that is *exactly* the delimiter text; JSON.stringify's own output
 * can never produce that, because every line it emits is either a
 * structural line (starting with whitespace + `{`/`}`/`[`/`]`) or a
 * `"key": value` line — never a bare word with no JSON syntax around it —
 * so a delimiter distinctive enough not to collide with a `{`/`"`/`}` line
 * is all `buildUsbOfflineScript` needs, not a runtime scan of the payload.
 */
export function buildUsbOfflineScript({
  serial, deviceName, homeUrl, allowedHost, deviceToken, idleReturnSeconds,
  adminCode, displayZoomPercent, displayOrientation, approvedClients, apkFilename,
} = {}) {
  const cleanSerial = sanitizeSerial(serial);
  if (!cleanSerial) throw new Error('serial is required');
  if (!homeUrl) throw new Error('homeUrl is required');
  try { new URL(homeUrl); } catch { throw new Error('homeUrl must be a valid URL'); }
  if (!deviceToken) throw new Error('deviceToken is required');

  const payload = buildOfflineEnrollPayload({
    deviceToken, name: deviceName, homeUrl, allowedHost, idleReturnSeconds,
    adminCode, displayZoomPercent, displayOrientation, approvedClients,
  });
  const configJson = JSON.stringify(payload, null, 2);
  // Comment-safe (CR/LF stripped so it cannot break out of a `#` line) but
  // NOT shell-safe on its own — a device name is owner-settable text, so
  // every place `label` lands inside an executable double-quoted string
  // (as opposed to a `#` comment) uses `quotedLabel` instead, below.
  const label = String(deviceName || cleanSerial).replace(/[\r\n]/g, ' ');
  const quotedLabel = shQuote(label);
  const apkFile = sanitizeApkFilename(apkFilename);

  return `#!/usr/bin/env bash
# KioskFleet — fully offline USB install for "${label}" (KIOSK_BUILD.md
# Sec.3 Route D + Sec.6 + Sec.10-D). Run this on a computer with the target
# device connected over USB and Android platform-tools (\`adb\`) installed —
# neither the computer nor the device needs any internet connection at any
# point in this script. Requires the device to have USB debugging enabled
# and to have no accounts configured yet (a factory-reset or freshly wiped
# device — the same precondition Route B's \`dpm set-device-owner\` step
# already has). Some China-market Android builds block Device Owner
# entirely; test one unit of a new model before provisioning a batch
# (KIOSK_BUILD.md Sec.11).
#
# This script and its embedded configuration are bound to ONE device: the
# serial below. It refuses to run against a different connected device
# rather than silently handing that device's credentials to a different
# physical unit.
#
# What it does, in order:
#   1. Confirms exactly one authorized device is attached, and that its
#      serial matches the one this package was generated for.
#   2. Installs the agent APK (must be in the same folder as this script,
#      as "${apkFile}", or passed as this script's first argument).
#   3. Launches the app once and stops it again, so Android creates the
#      app's private storage folder (it does not exist until the app has
#      run at least once — nothing to push into otherwise).
#   4. Writes this device's configuration to a local temp file and \`adb
#      push\`es it into that folder. Nothing here touches the network.
#   5. Sets the app as Device Owner (\`dpm set-device-owner\`) — the same
#      mechanism Route B uses online.
#   6. Relaunches the app. It finds the pushed file, applies it, deletes it,
#      and locks into the kiosk — without ever contacting the server.
#
# The device will sync with the management console (remote commands,
# policy changes, OTA) the next time it has any network connection at all —
# nothing about being provisioned offline makes that permanent.
set -euo pipefail

EXPECTED_SERIAL=${shQuote(cleanSerial)}
APK_FILE="\${1:-${apkFile}}"

echo "KioskFleet: fully offline USB install for "${quotedLabel}

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found on PATH. Install Android platform-tools first." >&2
  exit 1
fi

if [ ! -f "$APK_FILE" ]; then
  echo "APK not found: $APK_FILE" >&2
  echo "Place ${apkFile} next to this script, or pass its path as the first argument." >&2
  exit 1
fi

CONNECTED=$(adb devices | awk 'NR>1 && $2=="device" {print $1}')
COUNT=$(printf '%s\\n' "$CONNECTED" | grep -c . || true)
if [ "$COUNT" -eq 0 ]; then
  echo "No authorized device connected over USB. Connect the device, enable USB debugging, and accept the RSA fingerprint prompt on its screen." >&2
  exit 1
fi
if [ "$COUNT" -gt 1 ]; then
  echo "More than one authorized device is connected. Disconnect all but the target device and re-run." >&2
  exit 1
fi

if [ "$CONNECTED" != "$EXPECTED_SERIAL" ]; then
  echo "Connected device serial ($CONNECTED) does not match the serial this package was generated for ($EXPECTED_SERIAL)." >&2
  echo "This package carries one device's own credentials -- generate a new package for this device, or connect the right one." >&2
  exit 1
fi

echo "Installing the agent..."
adb install -r "$APK_FILE"

echo "Starting the app once so its private storage folder exists..."
adb shell am start -n ${PACKAGE_NAME}/.EnrollActivity >/dev/null
sleep 3
adb shell am force-stop ${PACKAGE_NAME}

CONFIG_TMP=$(mktemp)
trap 'rm -f "$CONFIG_TMP"' EXIT
cat > "$CONFIG_TMP" <<'KIOSKFLEET_OFFLINE_CONFIG_EOF'
${configJson}
KIOSKFLEET_OFFLINE_CONFIG_EOF

echo "Pushing the device's configuration (local only, no network)..."
adb push "$CONFIG_TMP" ${OFFLINE_CONFIG_PATH}

echo "Setting the app as device owner (the device must have no configured accounts)..."
adb shell dpm set-device-owner ${PACKAGE_NAME}/.KioskDeviceAdminReceiver

echo "Launching the kiosk..."
adb shell am start -n ${PACKAGE_NAME}/.EnrollActivity >/dev/null

echo ""
echo "Done. The device applied its configuration locally and locked into the kiosk -- no internet was used at any point."
echo "It will sync with the management console automatically the next time it has any network connection."
`;
}

export { OFFLINE_CONFIG_PATH, PACKAGE_NAME };
