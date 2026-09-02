// KIOSK_BUILD.md §3 Route C (Windows) + §10 Windows install instructions —
// "בונים גם A וגם B (וגם C ל-Windows ו-D ל-USB) — הם משלימים, לא מתחרים"
// (owner decision, locked). Route B (Android Device Owner) already ships;
// this is Route C's first slice.
//
// Generates the one-time PowerShell script an owner runs, as Administrator,
// on a Windows kiosk PC. Verified against Microsoft's current kiosk-mode
// docs (learn.microsoft.com/en-us/deployedge/microsoft-edge-configure-kiosk-mode,
// checked 24/08/2026) rather than assumed from memory. What it automates:
//   1. a dedicated local standard-user account for the kiosk, with Windows
//      auto-logon enabled so the PC boots straight into it — no one has to
//      remember a password at a venue;
//   2. Microsoft Edge's own URLAllowlist/URLBlocklist policy (the identical
//      HKLM\SOFTWARE\Policies\Microsoft\Edge registry Intune would push),
//      set to block everything except this device's allow-list — the same
//      hosts hosts.js already validates for the Android agent, so "only
//      these domains" means the same thing on both platforms;
//   3. a Startup-folder shortcut launching Microsoft's own documented
//      Digital/Interactive-signage kiosk command line: `msedge.exe --kiosk
//      <homeUrl> --edge-kiosk-type=fullscreen --no-first-run
//      --kiosk-idle-timeout-minutes=<n>`.
//
// What it deliberately does NOT attempt: replacing the Windows shell
// (Assigned Access / Shell Launcher v2 — §3C's other, deeper lockdown
// option) has no documented single PowerShell one-liner for "Edge with a
// custom URL"; Microsoft's own docs point administrators at the Settings
// app's "Set up a kiosk (assigned access)" wizard or Intune for that layer.
// Rather than assert an unverified CSP/XML automation for it, the generated
// script prints it as the recommended manual follow-up step. There is no
// Windows host in this sandbox to run the script on, so — like every
// Android-side entry in this project's log — this is verified by inspection
// and against current Microsoft documentation, not by execution.

import { normalizeHostList } from './hosts.js';

export const DEFAULT_IDLE_TIMEOUT_MINUTES = 5;
const MAX_IDLE_TIMEOUT_MINUTES = 1440; // ceiling Edge's own --kiosk-idle-timeout-minutes documents

/**
 * Single-quoted PowerShell string literal: doubling an embedded `'` is the
 * only escape a single-quoted literal needs. Everything else a crafted
 * homeUrl/device name could contain ($, `, ", parens) is inert inside single
 * quotes — unlike a double-quoted literal, which PowerShell expands
 * variables and `$(...)` subexpressions inside of, turning a homeUrl like
 * `https://x/$(Remove-Item C:\ -Recurse)` into code that runs when an
 * Administrator executes the generated script.
 */
export function psQuote(value) {
  return "'" + String(value ?? '').replace(/'/g, "''") + "'";
}

/**
 * Clamp + default the idle timeout the same way display.js clamps zoom — an
 * out-of-range or non-numeric value is corrected, not rejected, since this
 * only feeds a generated script rather than being persisted to a device row.
 */
export function clampIdleTimeoutMinutes(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_IDLE_TIMEOUT_MINUTES;
  return Math.min(MAX_IDLE_TIMEOUT_MINUTES, Math.max(0, Math.round(n)));
}

/** A Windows local username: letters/digits/-/_ only, capped well under the 20-char SAM limit. */
export function sanitizeKioskUsername(raw) {
  const cleaned = String(raw ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
  return cleaned || 'KioskFleetUser';
}

/**
 * Builds the full .ps1 script text for one device. Pure string templating —
 * no fs/child_process/express — so it is exercised here without a Windows
 * host, the same "generate now, verify by inspection" shape schedule.js's
 * own tests already rely on for logic this sandbox cannot execute
 * end-to-end (no real device, no real Windows PC).
 */
export function buildWindowsKioskScript({ deviceName, homeUrl, allowedHost, idleTimeoutMinutes, kioskUsername } = {}) {
  if (!homeUrl) throw new Error('homeUrl is required');
  let homeHost = '';
  try { homeHost = new URL(homeUrl).host.toLowerCase(); } catch { throw new Error('homeUrl must be a valid URL'); }

  // hostsForUrl() already folds the home URL's own host into allowed_host at
  // write time (see hosts.js), but this generator is defensive on its own
  // input rather than trusting that every caller went through that path.
  const hosts = normalizeHostList(allowedHost);
  if (!hosts.includes(homeHost)) hosts.unshift(homeHost);

  const username = sanitizeKioskUsername(kioskUsername);
  const idleMinutes = clampIdleTimeoutMinutes(idleTimeoutMinutes);
  const label = String(deviceName || homeHost).replace(/[\r\n]/g, ' ');

  const allowlistLines = hosts
    .map((h, i) => `Set-ItemProperty -Path $edgeAllowlistPath -Name '${i + 1}' -Value ${psQuote(h)} -Type String`)
    .join('\n');

  return `<#
  KioskFleet — Windows kiosk setup for "${label}"
  Generated by KioskFleet (KIOSK_BUILD.md Sec.3 Route C). Run as
  Administrator, once, on the PC that will run this kiosk. Requires Windows
  10 2004+ / Windows 11, and Microsoft Edge (Chromium) 89+.

  What this script does:
    1. Creates a dedicated local standard-user account and enables Windows
       auto-logon into it, so the PC boots straight into the kiosk.
    2. Locks Microsoft Edge to this device's allow-list via Edge's own
       URLAllowlist/URLBlocklist policy (blocks everything else).
    3. Adds a Startup-folder shortcut that launches Edge in kiosk
       (Digital/Interactive-signage) mode against this device's home URL.

  What this script does NOT do: replace the Windows shell (Assigned Access /
  Shell Launcher v2) for the deeper OS-level lockdown Sec.3C also lists —
  that has no documented single PowerShell command for Edge with a custom
  URL. Once this script finishes, the recommended next step is Windows
  Settings -> search "kiosk" -> "Set up a kiosk (assigned access)" -> pick
  the '${username}' account -> Microsoft Edge -> this same URL.

  Known trade-off: Windows auto-logon stores this account's password in the
  registry (HKLM\\...\\Winlogon\\DefaultPassword) in a reversible form — the
  standard, documented mechanism Windows itself provides for unattended
  sign-in, accepted here because this account has no privileges beyond a
  standard user on a single-purpose kiosk PC.
#>

$ErrorActionPreference = 'Stop'
$kioskUser   = ${psQuote(username)}
$homeUrl     = ${psQuote(homeUrl)}
$idleMinutes = ${idleMinutes}

Write-Host "KioskFleet: setting up Windows kiosk for $kioskUser -> $homeUrl"

# 1) Dedicated local standard-user account, Windows auto-logon enabled.
if (-not (Get-LocalUser -Name $kioskUser -ErrorAction SilentlyContinue)) {
  Add-Type -AssemblyName System.Web
  $kioskPasswordPlain = [System.Web.Security.Membership]::GeneratePassword(24, 4)
  $kioskPasswordSecure = ConvertTo-SecureString -String $kioskPasswordPlain -AsPlainText -Force
  New-LocalUser -Name $kioskUser -Password $kioskPasswordSecure -PasswordNeverExpires -UserMayNotChangePassword | Out-Null
  Add-LocalGroupMember -Group 'Users' -Member $kioskUser
  $winlogonPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
  Set-ItemProperty -Path $winlogonPath -Name AutoAdminLogon -Value '1'
  Set-ItemProperty -Path $winlogonPath -Name DefaultUserName -Value $kioskUser
  Set-ItemProperty -Path $winlogonPath -Name DefaultPassword -Value $kioskPasswordPlain
  Write-Host "Created local account '$kioskUser' with auto-logon enabled."
} else {
  Write-Host "Local account '$kioskUser' already exists -- leaving its password/auto-logon as-is."
}

# 2) Edge policy: block everything except this device's allow-list.
#    Registry path verified against Microsoft's Edge policy docs (URLAllowlist/
#    URLBlocklist under HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge, numbered
#    string values; URLAllowlist takes precedence over a matching URLBlocklist
#    entry, which is why "*" alone in URLBlocklist is safe to combine with it).
$edgePolicyPath    = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge'
$edgeAllowlistPath = "$edgePolicyPath\\URLAllowlist"
$edgeBlocklistPath = "$edgePolicyPath\\URLBlocklist"
New-Item -Path $edgePolicyPath -Force | Out-Null
New-Item -Path $edgeAllowlistPath -Force | Out-Null
New-Item -Path $edgeBlocklistPath -Force | Out-Null
Set-ItemProperty -Path $edgeBlocklistPath -Name '1' -Value '*' -Type String
${allowlistLines}
Write-Host "Edge allow-list set to: ${hosts.join(', ')}"

# 3) Startup shortcut: launch Edge in kiosk (digital signage) mode. Command
#    line verified against Microsoft's own "Configure Microsoft Edge kiosk
#    mode" doc.
$edgePath = "\${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe"
if (-not (Test-Path $edgePath)) { $edgePath = "$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe" }
$startupDir = "C:\\Users\\$kioskUser\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"
New-Item -Path $startupDir -ItemType Directory -Force | Out-Null
$shortcutPath = Join-Path $startupDir 'KioskFleet.lnk'
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $edgePath
$shortcut.Arguments = "--kiosk \`"$homeUrl\`" --edge-kiosk-type=fullscreen --no-first-run --kiosk-idle-timeout-minutes=$idleMinutes"
$shortcut.Save()
Write-Host "Startup shortcut written: $shortcutPath"

Write-Host ""
Write-Host "Done. Restart the PC to boot straight into the kiosk."
Write-Host "Recommended next step for full OS lockdown: Settings -> search 'kiosk' -> 'Set up a kiosk (assigned access)' -> account '$kioskUser' -> Microsoft Edge -> this URL."
`;
}
