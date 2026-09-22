-- ===========================================================================
-- The student who did not want a viewing.
--
-- A viewing is offered, not required, and the booking link now lets a student
-- go straight to the booking. Without this column that student and one who
-- simply has not answered look identical on the booking page - both say "No
-- viewing scheduled yet" - so staff cannot tell whether to chase them.
--
-- Stamped when they choose it, and never cleared: it is a record of what they
-- said, not a setting. Changing their mind later is a viewing being booked,
-- which the appointment itself already records.
--
-- Safe to run again.
-- ===========================================================================

alter table public.enquiries
  add column if not exists viewing_skipped_at timestamptz;

comment on column public.enquiries.viewing_skipped_at is
  'When the student chose to proceed without a viewing, from their booking link. Null if they never said.';
