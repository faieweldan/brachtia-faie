-- ===========================================================================
-- A document template can belong to one residence (30 Sept 2026).
--
-- Some documents differ by building - The Arc's access card form is The Arc's
-- own. residence_id null means the template is for every residence; set, it
-- is for that one only. A resident's document pack uses their residence's
-- template when there is one, and the all-residences one otherwise.
--
-- A residence that is removed leaves its templates for every residence
-- rather than taking them with it. Safe to run again.
-- ===========================================================================

alter table public.document_templates
  add column if not exists residence_id uuid references public.residences(id) on delete set null;

create index if not exists document_templates_doc_key_idx
  on public.document_templates (doc_key, residence_id);
