-- ===========================================================================
-- Where an invoice's resident works.
--
-- An invoice carried `university` and nothing else, so it could only ever say
-- who a student was. An employed resident's invoice had that row silently
-- missing - the quotation named their employer, and the invoice that followed
-- said nothing about them at all.
--
-- The invoice keeps its own copy rather than reading the resident, for the same
-- reason it copies their name and room: an issued invoice is a record of what
-- was sent, and it must not change afterwards because somebody moved job.
--
-- Empty is a real answer for company - self-employed or freelance has no
-- organisation to name - so occupation stands on its own.
--
-- Safe to run again.
-- ===========================================================================

alter table public.invoices
  add column if not exists company    text not null default '',
  add column if not exists occupation text not null default '';

comment on column public.invoices.company is
  'Where they work, as it stood when this invoice was issued. Empty when self-employed.';
comment on column public.invoices.occupation is
  'Their job title, as it stood when this invoice was issued.';
