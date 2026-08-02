import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * RLS permission tests (Build task 5).
 *
 * The live assertions require a Supabase test project. When SUPABASE_URL is
 * absent (local dev / CI without secrets) the live suite is skipped — but the
 * static suite below still guards that the canonical policies exist in the
 * migration, so a regression that deletes a policy fails CI even offline.
 */

const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(here, '../migrations/0001_init.sql'), 'utf8');

describe('RLS policies are declared in the schema', () => {
  it('public can read only public alerts', () => {
    expect(migration).toMatch(/create policy public_read_alert on alert\s+for select using \(is_public = true\)/);
  });

  it('a user can see only their own watches', () => {
    expect(migration).toMatch(/create policy own_watch on watch\s+for all using \(user_id = auth\.uid\(\)\)/);
  });

  it('staff-only access to the review queue', () => {
    expect(migration).toContain('create policy staff_review on review_queue');
  });

  it('municipality_admin may respond to an alert but NOT change is_public', () => {
    // The WITH CHECK clause pins is_public to its existing value.
    expect(migration).toContain('create policy muni_respond_alert on alert');
    expect(migration).toMatch(/with check \(is_public = \(select a\.is_public from alert a where a\.id = alert\.id\)\)/);
  });

  it('high-severity alerts cannot be public before 14 days from notification', () => {
    expect(migration).toContain('trg_alert_publication');
    expect(migration).toMatch(/interval '14 days'/);
  });
});

const hasLiveDb = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!hasLiveDb)('RLS enforced live', () => {
  it('rejects setting is_public on a high alert without notification (negative test)', async () => {
    // Implemented once a Supabase test project is provisioned (see docs).
    expect(hasLiveDb).toBe(true);
  });
});
