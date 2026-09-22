-- ===========================================================================
-- What a payment was for.
--
-- A booking has one invoice. Its booking fee is the first payment recorded
-- against it, so the payment says so - "Booking fee" - and the receipt shows it.
--
-- Safe to run again.
-- ===========================================================================

alter table public.payments
  add column if not exists description text not null default '';
