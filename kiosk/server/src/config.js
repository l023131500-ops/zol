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
  /** 'production' opens indexing; anything else shows the test banner and blocks robots. */
  env: process.env.KIOSK_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
  jwtSecret: required('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-insecure-secret'),
  dbPath: path.resolve(root, process.env.DB_PATH || './data/kioskfleet.db'),
  offlineAfterMinutes: Number(process.env.OFFLINE_AFTER_MINUTES || 3),
  seedAdminUser: process.env.SEED_ADMIN_USER || 'admin',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'admin1234',
  isProd: process.env.NODE_ENV === 'production',
  root,
  publicDir: path.resolve(root, 'public'),
};
