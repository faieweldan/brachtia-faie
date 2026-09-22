-- ===========================================================================
-- Brachtia is not only for students.
--
-- A working person enquiring today is asked for a university and an intake they
-- do not have, and the application form then asks them again. So both forms ask
-- one question first - Student, or Employed / Self-Employed - and show the
-- Academic or the Employment section accordingly.
--
-- The enquiry records what they said so the application can be pre-filled with
-- it; the application is the final answer and overwrites it.
--
-- All plain text with empty defaults, like every other column on these tables:
-- no CHECK, so a status this app does not know yet cannot refuse a row. The
-- app's own list (STATUS_OPTIONS in reference-data) is what is offered.
--
-- Safe to run again.
-- ===========================================================================

alter table public.enquiries
  add column if not exists current_status text not null default '';

alter table public.residents
  add column if not exists current_status  text not null default '',
  -- where they work, when they are not studying
  add column if not exists company         text not null default '',
  add column if not exists occupation      text not null default '',
  add column if not exists industry        text not null default '',
  add column if not exists employment_type text not null default '';

comment on column public.enquiries.current_status is
  'Student or employed, as answered on the enquiry form. Pre-fills the application; the application wins.';
comment on column public.residents.current_status is
  'Student or employed, as answered on the application form. The final answer.';
