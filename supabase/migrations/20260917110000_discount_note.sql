-- ===========================================================================
-- Why a rent discount was given.
--
-- The invoice carries the discount as a line of its own - the rent at its list
-- price, then what came off it - and this is the line's own words: "Early bird",
-- "Sponsor", "Staff rate". So the invoice explains itself to the student, and to
-- finance months later, instead of showing a figure nobody can account for.
--
-- Safe to run again.
-- ===========================================================================

alter table public.invoices
  add column if not exists discount_note text not null default '';
