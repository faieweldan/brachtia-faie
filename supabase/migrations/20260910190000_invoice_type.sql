-- ===========================================================================
-- What kind of invoice this is.
--
-- The resident's Payments tab groups money into four things a person actually
-- thinks about - what they paid to move in, their rent, one-off charges, and
-- what happens at check-out. An invoice has to say which it is.
--
-- Existing invoices are the initial payment: until now the only invoice raised
-- was the one from a booking.
-- ===========================================================================

alter table public.invoices
  add column if not exists invoice_type text not null default 'initial'
  check (invoice_type in ('initial', 'rental', 'charge', 'checkout'));

-- the period a rental invoice covers, so the schedule can be listed
alter table public.invoices
  add column if not exists period_start date,
  add column if not exists period_end   date;

create index if not exists invoices_resident_idx on public.invoices (resident_id);
