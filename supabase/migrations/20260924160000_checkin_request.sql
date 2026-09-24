-- ===========================================================================
-- When the student says they will arrive.
--
-- Asked for at the end of the application, not booked: a slot the student
-- picked is a request until Brachtia has a key and a person ready for it. Admin
-- turns it into a real appointment, so this says what was asked for and when,
-- and nothing here holds a room or a time against anybody else.
--
-- Nothing chosen is a real answer too. A student who does not know their flight
-- yet says so, submits, and comes back to the same link - so "not scheduled"
-- has to be visible to admin rather than looking like an unfinished form.
--
-- Safe to run again.
-- ===========================================================================

alter table public.residents
  add column if not exists checkin_on date,
  add column if not exists checkin_slot text not null default '',
  -- they asked to be reminded instead of picking a day
  add column if not exists checkin_remind boolean not null default false,
  add column if not exists checkin_asked_at timestamptz;
