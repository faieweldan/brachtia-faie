-- The number every resident carries from the master list is QuickBooks' id for
-- them, not something this system invented. Calling it "legacy" hid that, and
-- hid the fact that it is the key finance uses to find the same person.
--
-- The column is renamed, not replaced: same values, same unique constraint.

alter table public.residents rename column legacy_id to quickbooks_id;
