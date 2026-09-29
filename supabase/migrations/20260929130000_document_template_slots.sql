-- ===========================================================================
-- The six document templates, each with the doc_key the app finds it by.
--
-- Create Document Pack looks up each tab's template by doc_key
-- (tenancy_agreement, schedule_a ...), never by name. On Lovable Cloud these
-- six rows were created directly, with no migration file, so a database built
-- from this repo had none - and a template made with New template got a blank
-- doc_key and connected to no tab. Copied from Lovable Cloud on 29 Sept 2026.
--
-- Only adds a slot whose doc_key is missing, so it changes nothing on Lovable
-- Cloud and is safe to run again. Uploading each document stays in
-- Settings -> Templates.
-- ===========================================================================

insert into public.document_templates (name, category, doc_key, sort_order)
select v.name, v.category, v.doc_key, v.sort_order
from (values
  ('Tenancy Agreement', 'Agreement', 'tenancy_agreement', 1),
  ('Schedule A – Particulars', 'Agreement', 'schedule_a', 2),
  ('Schedule B – House Rules & Additional Charges', 'Agreement', 'schedule_b', 3),
  ('Schedule C – Inventory & Condition Record', 'Agreement', 'schedule_c', 4),
  ('Access Card Form', 'Agreement', 'access_card_form', 5),
  ('Checkout Statement', 'Agreement', 'checkout_statement', 6)
) as v(name, category, doc_key, sort_order)
where not exists (select 1 from public.document_templates d where d.doc_key = v.doc_key);
