-- ===========================================================================
-- A document template can be deactivated (30 Sept 2026).
--
-- When a document is no longer used - a building stops asking for its access
-- card form, a schedule is retired - admin takes the whole template out of
-- use. It is deactivated, not deleted: residents' documents made from it are
-- signed records, and a deactivated template can be brought back. Null means
-- in use. A deactivated template is left out of the document pack and out of
-- generating.
--
-- Safe to run again.
-- ===========================================================================

alter table public.document_templates
  add column if not exists deactivated_at timestamptz;

alter table public.document_templates
  add column if not exists deactivation_reason text not null default '';
