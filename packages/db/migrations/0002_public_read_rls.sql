-- ============================================================
-- 0002 — Security hardening: public READ-ONLY RLS
-- Without RLS, Supabase/PostgREST exposes public tables for writes via the
-- anon key. This migration enables RLS on all kesef data tables and grants
-- anonymous SELECT only. Writes remain service-role (ETL jobs) exclusively.
-- Additive; does not touch pre-existing (non-kesef) tables. Idempotent.
-- Tables already carrying RLS in 0001 (alert, app_user, subscription, watch,
-- review_queue, agent_log) are intentionally NOT re-touched here.
-- ============================================================

do $$
declare
  -- publicly readable transparency data
  public_tables text[] := array[
    'authority','peer_group','chart_of_accounts','source_document','data_source',
    'sync_run','fact_financial','cross_check','tabar','tabar_funding','vendor',
    'tender','award','support_grant','donation','grant_call','grant_call_authority',
    'council_meeting','council_decision','official','council_vote','satellite_entity',
    'demographic_fact','benefit_uptake','metric_value','term_normalization','doc_chunk'
  ];
  -- internal tables: RLS on, no anon policy (service-role only)
  internal_tables text[] := array['moi_code_map','report_cache'];
  t text;
begin
  foreach t in array public_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'drop policy if exists %I on public.%I', 'public_read_' || t, t);
    execute format(
      'create policy %I on public.%I for select using (true)', 'public_read_' || t, t);
  end loop;

  -- correction_log is public only where is_public
  alter table public.correction_log enable row level security;
  drop policy if exists public_read_correction_log on public.correction_log;
  create policy public_read_correction_log on public.correction_log
    for select using (is_public = true);

  foreach t in array internal_tables loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
