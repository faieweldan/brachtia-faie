-- ===========================================================================
-- Studying or working, on a viewing too.
--
-- The enquiry form asks this (2026-09-21) and the application form asks it, but
-- the viewing form did not - it went straight to University and Intake, so a
-- working applicant booking a viewing was asked for a university they do not
-- have and had nowhere to say where they work.
--
-- Same three answers as enquiries carry, so the two forms agree and a viewing
-- can be read the same way round as the enquiry it belongs to.
--
-- All plain text with empty defaults and no CHECK: a status this app does not
-- know yet must never refuse a booking.
--
-- Safe to run again.
-- ===========================================================================

alter table public.appointments
  add column if not exists current_status text not null default '',
  add column if not exists company text not null default '',
  add column if not exists occupation text not null default '';

comment on column public.appointments.current_status is
  'Student, or Employed / Self-Employed - decides whether study or employment details were asked.';
