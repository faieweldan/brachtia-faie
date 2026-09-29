-- ===========================================================================
-- template_versions.mappings: which value fills each {{placeholder}}.
--
-- The column exists on Lovable Cloud (the generated types have it) but no
-- migration file ever created it, so a database built from this repo - such as
-- test-bratchia - had no such column. Saving mappings then failed, and reading a
-- version for activation failed too, which showed as "Only a draft can be
-- activated". Recorded here so every database has it.
--
-- Safe to run again, and a no-op on Lovable Cloud.
-- ===========================================================================

alter table public.template_versions
  add column if not exists mappings jsonb not null default '{}'::jsonb;
