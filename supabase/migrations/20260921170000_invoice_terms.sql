-- ===========================================================================
-- Terms on the invoice, and what is due next.
--
-- The terms are the same six clauses every time, so they are not stored per
-- invoice - they live in the app (INVOICE_TERMS in src/lib/invoice-terms.ts)
-- and this only records whether they were printed. Storing the wording would
-- mean six paragraphs copied onto every row, and a correction to a typo that
-- reaches nothing already issued.
--
-- What IS per invoice is the next payment: its date and its amount. Admin
-- states them when the terms are added, because an invoice that ends "pay again
-- by..." with no date is the reason the follow-up call happens.
--
-- All optional. An invoice raised without them is exactly what it was before.
--
-- Safe to run again.
-- ===========================================================================

alter table public.invoices
  add column if not exists show_terms boolean not null default false,
  add column if not exists next_payment_date date,
  add column if not exists next_payment_amount numeric;

comment on column public.invoices.show_terms is
  'Whether the standard terms and the next-payment line are printed on this invoice.';
comment on column public.invoices.next_payment_date is
  'When the next payment falls due. Printed under the terms; null when none was stated.';
comment on column public.invoices.next_payment_amount is
  'What the next payment comes to. Printed under the terms; null when none was stated.';
