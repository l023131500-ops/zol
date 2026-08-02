#!/usr/bin/env node
/**
 * Applies SQL migrations in packages/db/migrations in filename order.
 * Dependency-free: shells out to `psql` using $DATABASE_URL.
 *
 *   DATABASE_URL=postgres://... node scripts/migrate.mjs
 */
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.error('No migrations found.');
  process.exit(1);
}

for (const file of files) {
  console.log(`→ applying ${file}`);
  execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', join(dir, file)], {
    stdio: 'inherit',
  });
}
console.log(`✓ applied ${files.length} migration(s)`);
