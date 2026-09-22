-- Paying once a year.
--
-- The master list uses ANNUALLY and FULLY as separate answers, so they are not the
-- same thing: annually is a payment every twelve months, full term is the whole
-- tenancy paid up front. A two-year tenancy billed annually is two invoices; billed
-- full term it is one.
--
-- rental_schedules.frequency is the only column with a CHECK on it - pay_schedule,
-- payment_frequency and payment_term are all plain text - so this is the only place
-- the new value has to be allowed.

alter table public.rental_schedules
  drop constraint if exists rental_schedules_frequency_check;

alter table public.rental_schedules
  add constraint rental_schedules_frequency_check
  check (frequency in ('monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual', 'full'));
