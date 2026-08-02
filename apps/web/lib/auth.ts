import { createServerSupabase } from './supabase/server';
import type { SessionRole } from './roles';
import type { UserRole } from '@kesef/db/types';

export interface SessionInfo {
  userId: string | null;
  email: string | null;
  role: SessionRole;
  authorityId: string | null;
}

const ANON: SessionInfo = { userId: null, email: null, role: null, authorityId: null };

/**
 * Resolve the current session and app_user role on the server.
 * Anonymous (or unconfigured Supabase) yields a null role.
 */
export async function getSession(): Promise<SessionInfo> {
  const supabase = await createServerSupabase();
  if (!supabase) return ANON;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return ANON;

  const { data } = await supabase
    .from('app_user')
    .select('role, authority_id, email')
    .eq('id', user.id)
    .maybeSingle();

  const profile = data as { role: UserRole; authority_id: string | null; email: string | null } | null;

  return {
    userId: user.id,
    email: profile?.email ?? user.email ?? null,
    role: profile?.role ?? 'resident',
    authorityId: profile?.authority_id ?? null,
  };
}
