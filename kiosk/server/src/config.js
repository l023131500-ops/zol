import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

/**
 * Path prefix the whole app is served under, e.g. "/kiosk".
 *
 * NetFree blocks *.up.railway.app, so users reach this server through
 * more30.com/kiosk — a path proxy on the platform portal, not a subdomain.
 * A proxy that strips the prefix would break every absolute link the server
 * emits, so the server owns the prefix instead: it mounts its own routes,
 * static files and WebSocket paths under it. Empty = served at the root,
 * which is what a direct Railway URL and local dev still get.
 */
function normalizeBasePath(raw) {
  const v = String(raw ?? '').trim();
  if (!v || v === '/') return '';
  return ('/' + v.replace(/^\/+/, '').replace(/\/+$/, ''));
}

export const config = {
  port: Number(process.env.PORT || 8080),
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 8080}`,
  basePath: normalizeBasePath(process.env.BASE_PATH),
  /**
   * Host to open the realtime WebSocket against, e.g. "kiosk.more30.com".
   *
   * Measured, not assumed: a Vercel path rewrite forwards HTTP but answers a
   * WebSocket upgrade with 404 — more30.com/kiosk can serve the console but
   * cannot carry its socket. Remote control is the point of this product, so
   * the socket gets its own hostname pointing straight at this service, while
   * the console keeps being served from the path the platform standardises on.
   * Empty = same host as the page (correct for local dev and for reaching this
   * service directly).
   */
  wsHost: (process.env.WS_HOST || '').trim().replace(/^wss?:\/\//, '').replace(/\/+$/, ''),
  /** 'production' opens indexing; anything else shows the test banner and blocks robots. */
  env: process.env.KIOSK_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
  jwtSecret: required('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-insecure-secret'),
  dbPath: path.resolve(root, process.env.DB_PATH || './data/kioskfleet.db'),
  offlineAfterMinutes: Number(process.env.OFFLINE_AFTER_MINUTES || 3),
  // KIOSK_BUILD.md §9 "התראות": thresholds for the alerts the console surfaces.
  // Deliberately a separate, longer window than offlineAfterMinutes above —
  // that one marks a device offline the moment its heartbeat lapses (a normal,
  // frequent blip on a venue's wifi); this one is "offline long enough that an
  // owner should actually go check on it".
  alertOfflineMinutes: Number(process.env.ALERT_OFFLINE_MINUTES || 15),
  lowBatteryPercent: Number(process.env.LOW_BATTERY_PERCENT || 15),
  exitAttemptWindowHours: Number(process.env.EXIT_ATTEMPT_WINDOW_HOURS || 24),
  // KIOSK_BUILD.md §0/§8 "watchdog": a single crash/frozen-screen recovery is
  // the device doing exactly what it should — this is the "an owner should
  // go look at this kiosk" threshold on top of it. Short window on purpose:
  // 3 recoveries within an hour is a device that is actually looping, not
  // one that happened to reboot twice over a slow week.
  crashLoopWindowHours: Number(process.env.CRASH_LOOP_WINDOW_HOURS || 1),
  crashLoopThreshold: Number(process.env.CRASH_LOOP_THRESHOLD || 3),
  seedAdminUser: process.env.SEED_ADMIN_USER || 'admin',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'admin1234',
  // KIOSK_BUILD.md §3 Route A (QR provisioning): the agent APK's own hosted
  // download URL and its signing-certificate checksum. Optional — Route A's
  // QR endpoint (qrprovision.js) refuses with a clear message instead of
  // generating a broken payload when either is unset, the same "documented
  // missing token, not a crash" shape CONNECTIONS.md already records for
  // igud-transcribe's OPENAI_API_KEY. Not `required()`: every other route
  // (B/C/D) works with neither set, so this deployment must keep booting
  // without them.
  kioskAgentApkUrl: (process.env.KIOSK_AGENT_APK_URL || '').trim(),
  kioskAgentApkSignatureChecksum: (process.env.KIOSK_AGENT_APK_SIGNATURE_CHECKSUM || '').trim(),
  // KIOSK_BUILD.md §8 "עדכון מרחוק (OTA) ... של האפליקציה": the version
  // string (BuildConfig.VERSION_NAME) the currently-hosted release APK
  // reports. Optional like the two above — appupdate.js refuses with the
  // same documented-missing-token shape instead of a broken command when
  // this is unset.
  kioskAgentLatestVersion: (process.env.KIOSK_AGENT_LATEST_VERSION || '').trim(),
  isProd: process.env.NODE_ENV === 'production',
  root,
  publicDir: path.resolve(root, 'public'),
};
