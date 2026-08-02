-- ============================================================
-- 0003 — Move all kesef objects out of `public` into a dedicated
-- `kesef` schema, so `public` stays exclusively for other projects
-- sharing this Supabase instance.
--
-- Uses ALTER ... SET SCHEMA (atomic move: tables carry their indexes,
-- constraints, triggers, RLS policies and data; enum columns keep working
-- via OID). Replaying 0001 → 0002 → 0003 on a clean DB yields everything
-- in `kesef`, so this is reproducible, not a one-off.
-- Touches ONLY kesef-named objects; other projects' tables are never named.
-- ============================================================

create schema if not exists kesef;

do $$
declare
  kesef_tables text[] := array[
    'data_source','sync_run','source_document','authority','peer_group',
    'chart_of_accounts','moi_code_map','fact_financial','cross_check','tabar',
    'tabar_funding','vendor','tender','award','support_grant','donation',
    'grant_call','grant_call_authority','council_meeting','council_decision',
    'official','council_vote','satellite_entity','demographic_fact','benefit_uptake',
    'metric_value','alert','review_queue','correction_log','app_user',
    'subscription','watch','report_cache','doc_chunk','agent_log','term_normalization'
  ];
  kesef_types text[] := array[
    'source_kind','authority_status','value_status','extraction_method',
    'grant_call_state','decision_state','satellite_kind','alert_severity','user_role'
  ];
  kesef_views text[] := array['v_authority_year_summary','v_topic_spending'];
  t text;
begin
  foreach t in array kesef_tables loop
    if exists (select 1 from pg_tables where schemaname='public' and tablename=t) then
      execute format('alter table public.%I set schema kesef', t);
    end if;
  end loop;

  foreach t in array kesef_views loop
    if exists (select 1 from pg_views where schemaname='public' and viewname=t) then
      execute format('alter view public.%I set schema kesef', t);
    end if;
  end loop;

  foreach t in array kesef_types loop
    if exists (
      select 1 from pg_type ty join pg_namespace n on n.oid=ty.typnamespace
      where n.nspname='public' and ty.typname=t
    ) then
      execute format('alter type public.%I set schema kesef', t);
    end if;
  end loop;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='enforce_alert_publication'
  ) then
    execute 'alter function public.enforce_alert_publication() set schema kesef';
  end if;
end $$;

-- Grants (step 4): reads for anon/authenticated (RLS still applies), full for service_role.
grant usage on schema kesef to anon, authenticated, service_role;
grant select on all tables in schema kesef to anon, authenticated;
grant all on all tables in schema kesef to service_role;
alter default privileges in schema kesef grant select on tables to anon, authenticated;
alter default privileges in schema kesef grant all on tables to service_role;
