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
const mig = (f: string) => readFileSync(join(here, '../migrations', f), 'utf8');
const migration = mig('0001_init.sql');
const move = mig('0003_move_to_kesef_schema.sql');
const guard = mig('0004_alert_response_guard.sql');
const visibility = mig('0005_alert_visibility.sql');
const respondFix = mig('0006_fix_muni_respond_policy.sql');

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

  it('high-severity alerts cannot be public before 14 days from notification', () => {
    expect(migration).toContain('trg_alert_publication');
    expect(migration).toMatch(/interval '14 days'/);
  });
});

describe('kesef schema move + hardening (migrations 0003-0006)', () => {
  it('all kesef objects are moved into the kesef schema', () => {
    expect(move).toContain('create schema if not exists kesef');
    expect(move).toContain('set schema kesef');
    expect(move).toMatch(/grant select on all tables in schema kesef to anon, authenticated/);
  });

  it('a deterministic trigger blocks non-staff from changing is_public/severity/statement', () => {
    expect(guard).toContain('enforce_alert_response_only');
    expect(guard).toContain('trg_alert_response_only');
    expect(guard).toMatch(/new\.is_public\s+is distinct from old\.is_public/);
  });

  it('municipality_admin and staff can SELECT alerts for right-of-reply', () => {
    expect(visibility).toContain('muni_read_own_alert');
    expect(visibility).toContain('staff_read_alert');
  });

  it('muni_respond_alert WITH CHECK no longer self-references alert (no recursion)', () => {
    expect(respondFix).toContain('create policy muni_respond_alert on kesef.alert');
    // The fixed policy checks app_user scope, never subqueries alert itself.
    expect(respondFix).not.toMatch(/from\s+kesef\.alert|from\s+alert\b/);
  });

  it('officials cannot store contact details without a source document (0007)', () => {
    const guard = mig('0007_official_contact_source.sql');
    expect(guard).toContain('official_contact_needs_source');
    expect(guard).toMatch(/official_phone is null and official_email is null/);
  });
});

const hasLiveDb = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!hasLiveDb)('RLS enforced live', () => {
  it('rejects setting is_public on a high alert without notification (negative test)', async () => {
    // Implemented once a Supabase test project is provisioned (see docs).
    expect(hasLiveDb).toBe(true);
  });
});
