-- Who recorded each payment (Dani, 1 Oct 2026): the staff member picked in
-- the Record payment box, shown as "by Syazwani" beside the payment, so
-- accounts can see who uploaded which proof. Safe to run twice.
alter table public.payments
  add column if not exists recorded_by text not null default '';
