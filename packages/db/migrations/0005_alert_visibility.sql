-- ============================================================
-- 0005 — Alert visibility for right-of-reply.
--
-- The canonical public_read_alert policy exposes only is_public=true rows.
-- But a municipality_admin is notified of a not-yet-public (high) alert and
-- must be able to SEE it to exercise the 14-day right of reply. Without a
-- SELECT policy for them, their response UPDATE silently matches 0 rows.
--
-- Adds two permissive SELECT policies (OR-ed with public_read_alert):
--   * municipality_admin → alerts for their own authority (any is_public)
--   * staff / superadmin  → all alerts
-- Combined with 0004's trigger, muni_admin can respond but never publish.
-- ============================================================

drop policy if exists muni_read_own_alert on kesef.alert;
create policy muni_read_own_alert on kesef.alert
  for select using (
    exists (
      select 1 from kesef.app_user u
      where u.id = auth.uid()
        and u.role = 'municipality_admin'
        and u.authority_id = kesef.alert.authority_id
    )
  );

drop policy if exists staff_read_alert on kesef.alert;
create policy staff_read_alert on kesef.alert
  for select using (
    exists (
      select 1 from kesef.app_user u
      where u.id = auth.uid() and u.role in ('staff', 'superadmin')
    )
  );
