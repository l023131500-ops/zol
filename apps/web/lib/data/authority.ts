import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Server-side data access for authority screens. Every function degrades
 * gracefully: if Supabase is unconfigured/unreachable or the table is empty,
 * it returns null/[] so the screen renders <NoData> — never invented data.
 */

export interface AuthoritySummary {
  symbol: number;
  name_he: string;
  status: string;
  population: number | null;
  socio_economic_cluster: number | null;
  peripherality_cluster: number | null;
}

/** Known slug → LMS symbol. Extended as authorities load. */
const SLUG_TO_SYMBOL: Record<string, number> = {
  'hatzor-haglilit': 2034,
};

export function slugToSymbol(slug: string): number | null {
  if (SLUG_TO_SYMBOL[slug] != null) return SLUG_TO_SYMBOL[slug];
  const n = Number(slug);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null; // unreachable DB in restricted envs → NoData, not a crash
  }
}

export async function getAuthority(slug: string): Promise<AuthoritySummary | null> {
  const symbol = slugToSymbol(slug);
  if (symbol == null) return null;
  return safe(async () => {
    const supabase = await createServerSupabase();
    if (!supabase) return null;
    const { data } = await supabase
      .from('authority')
      .select('symbol, name_he, status, population, socio_economic_cluster, peripherality_cluster')
      .eq('symbol', symbol)
      .maybeSingle();
    return (data as AuthoritySummary | null) ?? null;
  });
}

export interface AlertRow {
  rule_key: string;
  severity: string;
  statement_he: string;
  methodology_url: string;
  response_text: string | null;
}

export async function getPublicAlerts(symbol: number): Promise<AlertRow[]> {
  return (
    (await safe(async () => {
      const supabase = await createServerSupabase();
      if (!supabase) return [];
      // authority_id is a uuid; resolve via symbol first.
      const { data: auth } = await supabase.from('authority').select('id').eq('symbol', symbol).maybeSingle();
      const authId = (auth as { id: string } | null)?.id;
      if (!authId) return [];
      const { data } = await supabase
        .from('alert')
        .select('rule_key, severity, statement_he, methodology_url, response_text')
        .eq('authority_id', authId)
        .eq('is_public', true);
      return (data as AlertRow[] | null) ?? [];
    })) ?? []
  );
}

export interface MetricRow {
  metric_key: string;
  value: number | null;
  peer_median: number | null;
  formula: string;
}

export async function getMetrics(symbol: number, year: number): Promise<MetricRow[]> {
  return (
    (await safe(async () => {
      const supabase = await createServerSupabase();
      if (!supabase) return [];
      const { data: auth } = await supabase.from('authority').select('id').eq('symbol', symbol).maybeSingle();
      const authId = (auth as { id: string } | null)?.id;
      if (!authId) return [];
      const { data } = await supabase
        .from('metric_value')
        .select('metric_key, value, peer_median, formula')
        .eq('authority_id', authId)
        .eq('fiscal_year', year);
      return (data as MetricRow[] | null) ?? [];
    })) ?? []
  );
}
