-- ============================================================
-- 0006 — Fix muni_respond_alert to remove RLS recursion.
--
-- The canonical WITH CHECK compared is_public to a self-subquery on `alert`.
-- Once alert has any SELECT policy (0005), that self-reference triggers
-- "infinite recursion detected in policy for relation alert".
--
-- Fix: WITH CHECK now only asserts the row still belongs to the admin's
-- authority (references app_user, not alert → no recursion). Field-level
-- immutability (is_public / severity / statement) is enforced deterministically
-- by the 0004 BEFORE UPDATE trigger, which is the correct mechanism (it can
-- reference OLD vs NEW; RLS WITH CHECK cannot).
-- ============================================================

drop policy if exists muni_respond_alert on kesef.alert;
create policy muni_respond_alert on kesef.alert
  for update
  using (
    exists (
      select 1 from kesef.app_user u
      where u.id = auth.uid()
        and u.role = 'municipality_admin'
        and u.authority_id = kesef.alert.authority_id
    )
  )
  with check (
    exists (
      select 1 from kesef.app_user u
      where u.id = auth.uid()
        and u.role = 'municipality_admin'
        and u.authority_id = kesef.alert.authority_id
    )
  );
