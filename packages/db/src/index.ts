import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export * from './types';

/**
 * Browser / anon client. Reads respect Row Level Security.
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
export function createBrowserDb(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return createClient<Database, 'kesef'>(url, anon, { db: { schema: 'kesef' } });
}

/**
 * Service-role client — server / ETL jobs ONLY. Bypasses RLS.
 * NEVER import this into client components or expose the key to the browser.
 */
export function createServiceDb(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient<Database, 'kesef'>(url, key, {
    db: { schema: 'kesef' },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
