-- ============================================================
-- 0004 — Deterministic "response-only" guard on kesef.alert.
--
-- The canonical muni_respond_alert RLS policy keeps is_public unchanged, but
-- via a self-subquery whose effect is silent (0 rows) rather than an explicit
-- error. This trigger makes the guarantee deterministic and demonstrable:
-- a municipality_admin (or any non-staff end user) may edit only the response
-- fields; changing is_public / severity / statement raises a clear error.
-- staff/superadmin and service-role (no JWT) callers are unaffected.
-- Defense-in-depth alongside the RLS policy.
-- ============================================================

create or replace function kesef.enforce_alert_response_only()
returns trigger as $$
declare
  acting_role text;
begin
  -- No end-user JWT → service-role / ETL / staff tooling. Allow.
  if auth.uid() is null then
    return new;
  end if;

  select role::text into acting_role from kesef.app_user where id = auth.uid();

  if acting_role in ('staff', 'superadmin') then
    return new;
  end if;

  if new.is_public      is distinct from old.is_public
     or new.severity        is distinct from old.severity
     or new.statement_he    is distinct from old.statement_he
     or new.measured_value  is distinct from old.measured_value
     or new.reference_value is distinct from old.reference_value then
    raise exception
      'רק צוות רשאי לשנות פרסום, חומרה או ניסוח של דגל; רשות מנויה רשאית להגיב בלבד';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = kesef, public, auth;

drop trigger if exists trg_alert_response_only on kesef.alert;
create trigger trg_alert_response_only
  before update on kesef.alert
  for each row execute function kesef.enforce_alert_response_only();
