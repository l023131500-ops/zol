-- ============================================================
-- 02 — מודל הנתונים
-- PostgreSQL 15+ / Supabase
-- כל שינוי בקובץ הזה טעון אישור מפורש מהמשתמש.
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists vector;
create extension if not exists pg_trgm;
-- ============================================================
-- א. מקורות ומסמכים — הבסיס של הכול
-- ============================================================
create type source_kind as enum (
  'api','bulk_file','scrape','foi_response','manual_upload'
);
create table data_source (
  id                uuid primary key default uuid_generate_v4(),
  slug              text unique not null,          -- 'data_gov_local_authorities'
  display_name      text not null,
  kind              source_kind not null,
  base_url          text,
  license_note      text,                          -- רישיון פר-מקור. אין להניח פתיחות
  sync_frequency    text,                          -- 'daily' | 'weekly' | 'monthly'
  is_active         boolean not null default true,
  last_ok_at        timestamptz,
  last_error        text,
  notes             text
);
create table sync_run (
  id                uuid primary key default uuid_generate_v4(),
  source_id         uuid not null references data_source(id),
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  status            text not null default 'running', -- running|ok|partial|failed
  rows_in           integer default 0,
  rows_written      integer default 0,
  rows_rejected     integer default 0,
  http_errors       jsonb default '[]'::jsonb,       -- כולל 403 — מתעדים, לא עוקפים
  message           text
);
create index on sync_run (source_id, started_at desc);
-- כל מסמך מקור. immutable. לעולם לא נמחק.
create table source_document (
  id                uuid primary key default uuid_generate_v4(),
  source_id         uuid not null references data_source(id),
  authority_id      uuid,                            -- FK מוגדר בהמשך
  url               text,
  r2_key            text not null,                   -- מפתח באחסון
  sha256            text not null unique,            -- זיהוי כפילויות
  doc_type          text not null,                   -- 'audited_report'|'tender'|
                                                     -- 'protocol'|'tabar'|'support_criteria'|...
  title             text,
  published_at      date,
  fetched_at        timestamptz not null default now(),
  page_count        integer,
  is_text_extractable boolean,
  disappeared_at    timestamptz,                     -- מתי נעלם מאתר המקור
  meta              jsonb default '{}'::jsonb
);
create index on source_document (authority_id, doc_type, published_at desc);
-- ============================================================
-- ב. רשויות וקבוצות שווים
-- ============================================================
create type authority_status as enum (
  'municipality','local_council','regional_council'
);
create table authority (
  id                    uuid primary key default uuid_generate_v4(),
  symbol                integer unique not null,     -- סמל רשות (למ"ס) — המפתח הקנוני
  name_he               text not null,
  name_variants         text[] default '{}',         -- שמות חלופיים לצורך התאמה
  status                authority_status not null,
  district              text,                        -- מחוז
  socio_economic_cluster smallint,                   -- 1-10
  socio_economic_year   smallint,
  peripherality_cluster smallint,                    -- 1-10
  peripherality_year    smallint,
  population            integer,
  population_year       smallint,
  pct_children          numeric(5,2),
  pct_elderly           numeric(5,2),
  website_url           text,
  financial_status      text,                        -- 'stable'|'recovery_plan'|
                                                     -- 'accompanying_accountant'|'appointed_committee'
  financial_status_source uuid references source_document(id),
  geom_center           point,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);
create index on authority (socio_economic_cluster, peripherality_cluster, population);
alter table source_document
  add constraint fk_sd_authority foreign key (authority_id) references authority(id);
-- קבוצת שווים — מחושבת, נשמרת לביצועים
create table peer_group (
  authority_id      uuid not null references authority(id),
  peer_id           uuid not null references authority(id),
  similarity        numeric(5,4) not null,
  computed_at       timestamptz not null default now(),
  primary key (authority_id, peer_id)
);
-- ============================================================
-- ג. ספר הקידודים — המפתח להשוואות בין רשויות
-- מכוח תקנות הרשויות המקומיות (הנהלת חשבונות), תשמ"ח-1988
-- ============================================================
create table chart_of_accounts (
  code              integer primary key,             -- 1 / 11 / 111 / 1111
  level             smallint not null,               -- 1-4
  parent_code       integer references chart_of_accounts(code),
  name_he           text not null,
  plain_he          text,                            -- ניסוח בשפה פשוטה לתושב
  flow              text not null,                   -- 'receipt' | 'payment'
  topic             text,                            -- education|welfare|culture|religion|
                                                     -- infrastructure|security|sanitation|
                                                     -- administration|debt
  is_leaf           boolean not null default false
);
create index on chart_of_accounts (parent_code);
create index on chart_of_accounts (topic);
-- מיפוי מהקוד שבדאטהסט של משרד הפנים אל ספר הקידודים.
-- הכרחי כי עמודת `קוד` בדאטהסט אינה זהה תמיד לקוד הספר.
create table moi_code_map (
  moi_code          integer not null,
  report_year       smallint not null,
  sheet_name        text not null,                   -- הגיליון (37 אפשרויות)
  row_label         text not null,
  column_label      text not null,
  coa_code          integer references chart_of_accounts(code),
  measure           text not null,                   -- 'budget'|'actual'|'prev_year'|
                                                     -- 'pct_executed'|'balance'
  verified_by_human boolean not null default false,
  primary key (moi_code, report_year, sheet_name, row_label, column_label)
);
-- ============================================================
-- ד. טבלת העובדות המרכזית
-- כל שורה = ערך אחד, עם מקור מלא. NOT NULL על המקור — לא לעקוף.
-- ============================================================
create type value_status as enum ('reported','calculated','estimated');
create type extraction_method as enum ('api','regex','llm','manual');
create table fact_financial (
  id                  uuid primary key default uuid_generate_v4(),
  authority_id        uuid not null references authority(id),
  fiscal_year         smallint not null,
  period              text not null default 'annual', -- 'annual'|'q1'..'q4'
  coa_code            integer references chart_of_accounts(code),
  moi_code            integer,
  sheet_name          text,
  row_label           text,
  column_label        text,
  measure             text not null,                  -- budget|actual|prev_year|balance
  value               numeric(18,2) not null,
  unit                text not null default 'ILS',
  -- provenance — חובה. זהו הנכס האסטרטגי של המערכת.
  source_document_id  uuid not null references source_document(id),
  page_number         integer,
  bbox                jsonb,
  extraction_method   extraction_method not null,
  extraction_confidence numeric(4,3),
  verified_by_human   boolean not null default false,
  verified_by         uuid,
  verified_at         timestamptz,
  value_status        value_status not null default 'reported',
  calculation_formula text,
  superseded_by       uuid references fact_financial(id),
  ingested_at         timestamptz not null default now(),
  last_checked_at     timestamptz
);
create index on fact_financial (authority_id, fiscal_year, coa_code);
create index on fact_financial (coa_code, fiscal_year) where superseded_by is null;
create index on fact_financial (fiscal_year, measure) where superseded_by is null;
-- הצלבה בין מקורות — הממצא המרכזי של המוצר
create table cross_check (
  id                uuid primary key default uuid_generate_v4(),
  authority_id      uuid not null references authority(id),
  fiscal_year       smallint not null,
  topic             text not null,                    -- 'state_transfers'
  value_a           numeric(18,2) not null,           -- obudget: כמה המדינה העבירה
  source_a          uuid not null references source_document(id),
  value_b           numeric(18,2) not null,           -- דוח מבוקר: כמה נרשם שהתקבל
  source_b          uuid not null references source_document(id),
  delta             numeric(18,2) generated always as (value_a - value_b) stored,
  delta_pct         numeric(8,4),
  is_material       boolean not null default false,   -- פער > 5%
  computed_at       timestamptz not null default now()
);
create index on cross_check (authority_id, fiscal_year) where is_material;
-- ============================================================
-- ה. תב"ר, מכרזים, ספקים, תמיכות, תרומות, קולות קוראים
-- ============================================================
create table tabar (
  id                uuid primary key default uuid_generate_v4(),
  authority_id      uuid not null references authority(id),
  number            text not null,
  name              text not null,
  approved_amount   numeric(18,2),
  status            text,                             -- approved_council|approved_ministry|
                                                      -- in_progress|completed|frozen|cancelled
  financial_pct     numeric(5,2),
  physical_pct      numeric(5,2),
  original_due      date,
  current_due       date,
  contractor_id     uuid,
  geom              point,
  source_document_id uuid not null references source_document(id),
  page_number       integer,
  verified_by_human boolean not null default false,
  created_at        timestamptz default now(),
  unique (authority_id, number)
);
create table tabar_funding (
  id                uuid primary key default uuid_generate_v4(),
  tabar_id          uuid not null references tabar(id) on delete cascade,
  source_name       text not null,                    -- 'משרד הביטחון' | 'קרן עבודות פיתוח'
  amount            numeric(18,2) not null,
  approval_ref      text
);
create table vendor (
  id                uuid primary key default uuid_generate_v4(),
  registration_id   text unique,                      -- ח"פ / ע"ר
  name              text not null,
  name_variants     text[] default '{}',
  entity_type       text,                             -- company|association|sole_trader|gov
  registered_at     date,
  sector            text
);
alter table tabar add constraint fk_tabar_contractor
  foreign key (contractor_id) references vendor(id);
-- מכרזים בסכימת OCDS. ocid: il-loc-{symbol}-{id}
create table tender (
  id                uuid primary key default uuid_generate_v4(),
  ocid              text unique not null,
  authority_id      uuid not null references authority(id),
  title             text not null,
  category          text,
  procurement_method text,                            -- open|limited|small|framework|direct
  exemption_reason  text,                             -- עילת פטור, אם רלוונטי
  published_at      date,
  closes_at         date,
  estimate_amount   numeric(18,2),
  source_document_id uuid not null references source_document(id),
  raw_ocds          jsonb
);
create index on tender (authority_id, published_at desc);
create index on tender (procurement_method) where exemption_reason is not null;
create table award (
  id                uuid primary key default uuid_generate_v4(),
  tender_id         uuid references tender(id),
  authority_id      uuid not null references authority(id),
  vendor_id         uuid references vendor(id),
  amount            numeric(18,2),
  awarded_at        date,
  bidders_count     integer,
  source_document_id uuid not null references source_document(id)
);
create index on award (vendor_id, awarded_at desc);
create table support_grant (
  id                uuid primary key default uuid_generate_v4(),
  authority_id      uuid not null references authority(id),
  vendor_id         uuid references vendor(id),        -- העמותה
  fiscal_year       smallint not null,
  criterion         text,                              -- תבחין
  requested_amount  numeric(18,2),
  approved_amount   numeric(18,2),
  paid_amount       numeric(18,2),
  committee_minutes_published boolean,
  source_document_id uuid not null references source_document(id)
);
create table donation (
  id                uuid primary key default uuid_generate_v4(),
  authority_id      uuid not null references authority(id),
  donor_name        text,
  amount            numeric(18,2),
  purpose           text,
  committee_decision_ref text,
  was_published     boolean,
  fiscal_year       smallint,
  source_document_id uuid not null references source_document(id)
);
create table grant_call (
  id                uuid primary key default uuid_generate_v4(),
  ministry          text not null,
  title             text not null,
  category          text,
  total_budget      numeric(18,2),
  matching_pct      numeric(5,2),
  opens_at          date,
  closes_at         date,
  eligibility       jsonb not null default '{}'::jsonb, -- קריטריוני סף מובנים
  source_document_id uuid references source_document(id)
);
create type grant_call_state as enum ('eligible','applied','won','missed','rejected');
create table grant_call_authority (
  id                uuid primary key default uuid_generate_v4(),
  grant_call_id     uuid not null references grant_call(id),
  authority_id      uuid not null references authority(id),
  state             grant_call_state not null,
  requested_amount  numeric(18,2),
  awarded_amount    numeric(18,2),
  missed_amount     numeric(18,2),                     -- אם state='missed'
  barrier           text,                              -- matching|no_staff|unaware|rejected
  source_document_id uuid references source_document(id),
  unique (grant_call_id, authority_id)
);
create index on grant_call_authority (authority_id, state);
-- ============================================================
-- ו. ישיבות מועצה ובעלי תפקידים
-- ============================================================
create table council_meeting (
  id                uuid primary key default uuid_generate_v4(),
  authority_id      uuid not null references authority(id),
  meeting_number    text,
  held_at           date not null,
  meeting_type      text,
  source_document_id uuid not null references source_document(id)
);
create type decision_state as enum
  ('decided','budgeted','contracted','executing','completed','stuck');
create table council_decision (
  id                uuid primary key default uuid_generate_v4(),
  meeting_id        uuid not null references council_meeting(id),
  authority_id      uuid not null references authority(id),
  item_number       text,
  text_he           text not null,
  state             decision_state not null default 'decided',
  state_changed_at  date,
  days_stuck        integer,
  linked_coa_code   integer references chart_of_accounts(code),
  linked_tabar_id   uuid references tabar(id),
  linked_tender_id  uuid references tender(id),
  page_number       integer
);
create index on council_decision (authority_id, state);
create table official (
  id                uuid primary key default uuid_generate_v4(),
  authority_id      uuid not null references authority(id),
  full_name         text not null,
  role              text not null,
  committees        text[] default '{}',
  term_start        date,
  term_end          date,
  -- פרטי קשר רשמיים שפורסמו בלבד. אסור טלפון אישי או מייל פרטי.
  official_email    text,
  official_phone    text,
  contact_source_document_id uuid references source_document(id),
  source_document_id uuid not null references source_document(id)
);
create table council_vote (
  decision_id       uuid not null references council_decision(id),
  official_id       uuid not null references official(id),
  position          text not null,                    -- for|against|abstain|absent
  primary key (decision_id, official_id)
);
-- ============================================================
-- ז. גופי סמך
-- ============================================================
create type satellite_kind as enum (
  'economic_company','water_corporation','religious_council',
  'community_center','municipal_association','other'
);
create table satellite_entity (
  id                uuid primary key default uuid_generate_v4(),
  authority_id      uuid not null references authority(id),
  kind              satellite_kind not null,
  name              text not null,
  registration_id   text,
  ownership_pct     numeric(5,2),
  website_url       text,
  -- דגל חשוב: האם בכלל קיימים נתונים כספיים פומביים
  has_public_financials boolean not null default false,
  data_gap_reason   text,     -- למשל: 'נתונים במערכת פנימית של המשרד לשירותי דת'
  source_document_id uuid references source_document(id)
);
-- ============================================================
-- ח. נתוני אוכלוסייה וזכויות
-- ============================================================
create table demographic_fact (
  id                uuid primary key default uuid_generate_v4(),
  authority_id      uuid not null references authority(id),
  year              smallint not null,
  metric            text not null,          -- population|pct_children|avg_wage|
                                            -- disability_rate|unemployment|...
  value             numeric(18,4) not null,
  national_value    numeric(18,4),
  source_document_id uuid not null references source_document(id),
  value_status      value_status not null default 'reported'
);
create index on demographic_fact (authority_id, year, metric);
create table benefit_uptake (
  id                uuid primary key default uuid_generate_v4(),
  authority_id      uuid not null references authority(id),
  year              smallint not null,
  benefit_type      text not null,
  recipients        integer,
  avg_amount        numeric(18,2),
  expected_recipients integer,              -- מודל — תמיד estimated
  underuse_pct      numeric(6,2),
  value_status      value_status not null default 'reported',
  source_document_id uuid not null references source_document(id)
);
-- ============================================================
-- ט. מדדים נגזרים ודגלי אזהרה
-- ============================================================
create table metric_value (
  id                uuid primary key default uuid_generate_v4(),
  authority_id      uuid not null references authority(id),
  fiscal_year       smallint not null,
  metric_key        text not null,          -- 'expense_per_pupil' | 'collection_rate' | ...
  value             numeric(18,4),
  peer_median       numeric(18,4),
  peer_p25          numeric(18,4),
  peer_p75          numeric(18,4),
  national_median   numeric(18,4),
  delta_vs_peer_pct numeric(8,2),
  formula           text not null,          -- מוצג למשתמש
  computed_at       timestamptz not null default now(),
  unique (authority_id, fiscal_year, metric_key)
);
create type alert_severity as enum ('info','notice','high');
create table alert (
  id                uuid primary key default uuid_generate_v4(),
  authority_id      uuid not null references authority(id),
  fiscal_year       smallint,
  rule_key          text not null,          -- 'low_expense_per_pupil' | ...
  severity          alert_severity not null,
  -- ניסוח עובדתי בלבד. אסורות מילים מפלילות. ראה 05_GUARDRAILS.md
  statement_he      text not null,
  measured_value    numeric(18,4),
  reference_value   numeric(18,4),
  delta_pct         numeric(8,2),
  methodology_url   text not null default '/methodology',
  evidence          jsonb not null,         -- מזהי fact_financial / source_document
  -- זכות תגובה
  notified_at       timestamptz,
  response_text     text,
  response_published_at timestamptz,
  is_public         boolean not null default false,
  computed_at       timestamptz not null default now()
);
create index on alert (authority_id, severity) where is_public;
-- דגל high לא מוצג בפומבי לפני 14 יום מהודעה
create or replace function enforce_alert_publication() returns trigger as $$
begin
  if new.severity = 'high' and new.is_public = true then
    if new.notified_at is null or new.notified_at > now() - interval '14 days' then
      raise exception 'high-severity alert cannot be public before 14 days from notification';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;
create trigger trg_alert_publication
  before insert or update on alert
  for each row execute function enforce_alert_publication();
-- ============================================================
-- י. תור אימות אנושי
-- ============================================================
create table review_queue (
  id                uuid primary key default uuid_generate_v4(),
  entity_table      text not null,
  entity_id         uuid not null,
  reason            text not null,          -- low_confidence|validation_failed|
                                            -- outlier|cross_check_mismatch
  payload           jsonb,
  status            text not null default 'pending',  -- pending|approved|rejected|fixed
  assigned_to       uuid,
  resolved_by       uuid,
  resolved_at       timestamptz,
  note              text,
  created_at        timestamptz not null default now()
);
create index on review_queue (status, created_at);
-- לוג תיקונים פומבי — מוצג ב-/quality
create table correction_log (
  id                uuid primary key default uuid_generate_v4(),
  entity_table      text not null,
  entity_id         uuid not null,
  old_value         text,
  new_value         text,
  reason            text not null,
  reported_by       text,                   -- 'public'|'staff'|'authority'
  corrected_at      timestamptz not null default now(),
  is_public         boolean not null default true
);
-- ============================================================
-- יא. משתמשים, לקוחות, התראות
-- ============================================================
create type user_role as enum (
  'resident','activist','council_member','journalist',
  'municipality_admin','staff','superadmin'
);
create table app_user (
  id                uuid primary key,       -- = auth.users.id
  email             text not null,
  display_name      text,
  role              user_role not null default 'resident',
  authority_id      uuid references authority(id),  -- ל-municipality_admin
  created_at        timestamptz default now()
);
create table subscription (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid references app_user(id),
  authority_id      uuid references authority(id),
  plan              text not null,
  status            text not null default 'active',
  started_at        date not null default current_date,
  renews_at         date,
  amount_ils        numeric(12,2)
);
create table watch (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references app_user(id),
  target_type       text not null,          -- authority|vendor|coa_code|tabar|
                                            -- tender_category|keyword|grant_call_category
  target_ref        text not null,
  channel           text not null default 'email',  -- email|whatsapp|webhook|rss
  created_at        timestamptz default now()
);
-- ============================================================
-- יב. מנוע הדוחות והסוכן
-- ============================================================
create table report_cache (
  query_hash        text primary key,
  query             jsonb not null,
  result            jsonb not null,
  computed_at       timestamptz not null default now(),
  invalidated_at    timestamptz
);
create table doc_chunk (
  id                uuid primary key default uuid_generate_v4(),
  source_document_id uuid not null references source_document(id),
  authority_id      uuid references authority(id),
  page_number       integer,
  section_label     text,
  content           text not null,
  embedding         vector(1536)
);
create index on doc_chunk using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index on doc_chunk using gin (content gin_trgm_ops);
create table agent_log (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid references app_user(id),
  question          text not null,
  route             text,                   -- sql|rag|tools|mixed
  generated_sql     text,
  context_ids       uuid[],
  answer            text,
  validation_passed boolean,
  retries           smallint default 0,
  latency_ms        integer,
  created_at        timestamptz default now()
);
create table term_normalization (
  id                uuid primary key default uuid_generate_v4(),
  canonical         text not null,          -- 'תב"ר'
  variants          text[] not null,        -- {'תבר','תב״ר','תקציב בלתי רגיל'}
  plain_he          text not null,          -- הסבר בשפה פשוטה
  do_not_confuse_with text[]                -- {'תב"ע'}
);
-- ============================================================
-- יג. RLS
-- ============================================================
alter table app_user        enable row level security;
alter table subscription    enable row level security;
alter table watch           enable row level security;
alter table review_queue    enable row level security;
alter table agent_log       enable row level security;
alter table alert           enable row level security;
-- נתונים ציבוריים: קריאה לכולם
create policy public_read_alert on alert
  for select using (is_public = true);
-- משתמש רואה רק את עצמו
create policy own_user on app_user
  for select using (id = auth.uid());
create policy own_watch on watch
  for all using (user_id = auth.uid());
create policy own_subscription on subscription
  for select using (user_id = auth.uid());
-- צוות בלבד: תור אימות
create policy staff_review on review_queue
  for all using (
    exists (select 1 from app_user u
            where u.id = auth.uid() and u.role in ('staff','superadmin'))
  );
-- municipality_admin: יכול להגיב על דגל, לא להסתיר אותו.
create policy muni_respond_alert on alert
  for update using (
    exists (select 1 from app_user u
            where u.id = auth.uid()
              and u.role = 'municipality_admin'
              and u.authority_id = alert.authority_id)
  )
  with check (is_public = (select a.is_public from alert a where a.id = alert.id));
-- ============================================================
-- יד. Views לשימוש הסוכן — קריאה בלבד, בלי provenance גולמי
-- ============================================================
create view v_authority_year_summary as
select
  a.symbol, a.name_he, f.fiscal_year,
  sum(f.value) filter (where c.flow = 'receipt' and f.measure = 'actual') as total_income,
  sum(f.value) filter (where c.flow = 'payment' and f.measure = 'actual') as total_expense,
  a.population,
  count(distinct f.source_document_id) as source_doc_count
from fact_financial f
join authority a on a.id = f.authority_id
left join chart_of_accounts c on c.code = f.coa_code
where f.superseded_by is null
group by a.symbol, a.name_he, f.fiscal_year, a.population;
create view v_topic_spending as
select
  a.symbol, a.name_he, f.fiscal_year, c.topic,
  sum(f.value) filter (where f.measure = 'actual')  as actual,
  sum(f.value) filter (where f.measure = 'budget')  as budget,
  a.population
from fact_financial f
join authority a on a.id = f.authority_id
join chart_of_accounts c on c.code = f.coa_code
where f.superseded_by is null and c.topic is not null
group by a.symbol, a.name_he, f.fiscal_year, c.topic, a.population;
