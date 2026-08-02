-- ============================================================
-- 0007 — Officials contact-provenance guard (Build task 40; SPEC part ז).
--
-- Published official contact details may be stored ONLY with a source document.
-- The SPEC asks for a unit test; we additionally enforce it at the database
-- level so it can never be violated, even by a direct write.
-- ============================================================

alter table kesef.official
  drop constraint if exists official_contact_needs_source;

alter table kesef.official
  add constraint official_contact_needs_source
  check (
    (official_phone is null and official_email is null)
    or contact_source_document_id is not null
  );
