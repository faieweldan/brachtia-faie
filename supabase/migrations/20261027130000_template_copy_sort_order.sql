-- A residence's own copy of a document template was saved with sort_order 100,
-- so Settings -> Templates listed it out of order (Solstice's General Terms,
-- Schedule A and B on 27 Oct 2026). It takes the sort_order of the first
-- template with the same doc_key, as createTemplate now does. Safe to run again.
update public.document_templates t
set sort_order = s.sort_order
from (
  select doc_key, min(sort_order) as sort_order
  from public.document_templates
  where doc_key <> '' and sort_order < 100
  group by doc_key
) s
where t.doc_key = s.doc_key and t.sort_order = 100;
