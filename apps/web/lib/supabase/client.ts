'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@kesef/db/types';

/** Browser Supabase client. Reads respect RLS. */
export function createClientSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('Supabase env is not configured (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).');
  }
  return createBrowserClient<Database>(url, anon);
}
