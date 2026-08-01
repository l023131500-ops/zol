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

export const config = {
  port: Number(process.env.PORT || 8080),
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 8080}`,
  jwtSecret: required('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-insecure-secret'),
  dbPath: path.resolve(root, process.env.DB_PATH || './data/kioskfleet.db'),
  offlineAfterMinutes: Number(process.env.OFFLINE_AFTER_MINUTES || 3),
  seedAdminUser: process.env.SEED_ADMIN_USER || 'admin',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'admin1234',
  isProd: process.env.NODE_ENV === 'production',
  root,
  publicDir: path.resolve(root, 'public'),
};
