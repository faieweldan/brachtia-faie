-- ===========================================================================
-- The check-in task list.
--
-- A check-in is more than a time in a calendar: keys, an access card, the
-- inventory walk-through. Staff tick those off on the appointment, and the
-- ticks have to outlive the page - who ticked what, and when, is what settles
-- "was the access card ever handed over" months later.
--
-- One object per appointment, keyed by task:
--   { "keys": { "done": true, "by": "Syazwani", "at": "2026-09-30T02:14:00Z" } }
-- The list of tasks lives in the app, so adding one needs no change here.
--
-- Safe to run again.
-- ===========================================================================

alter table public.appointments
  add column if not exists checkin_tasks jsonb not null default '{}'::jsonb;

comment on column public.appointments.checkin_tasks is
  'Check-in tasks ticked off, by task key: { done, by, at }. Empty for other appointment types.';
