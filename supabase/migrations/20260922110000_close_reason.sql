-- ===========================================================================
-- Why a booking was closed, as a field rather than a sentence.
--
-- The reason was being appended to admin_notes as "Closed: Lost to competitor"
-- and read back by parsing the last line. That was fine while it was only ever
-- displayed - it is not fine now that one of the reasons, Duplicate, decides
-- whether a booking is shown in the list at all. An admin typing "Closed:
-- Duplicate" into their own notes would have hidden a real booking.
--
-- The duplicate itself is linked with duplicate_of, which already exists: set
-- automatically at submit as a hint, and overwritten by the admin when they
-- close one against the booking they are keeping. The admin's answer wins,
-- because they are the one who looked.
--
-- Nothing is ever deleted. A closed duplicate keeps its enquiry, its reference
-- and its history - it simply stops competing for attention in the list.
--
-- Safe to run again.
-- ===========================================================================

alter table public.enquiries
  add column if not exists close_reason text not null default '';

-- the list asks for "closed as a duplicate" on every render
create index if not exists enquiries_close_reason_idx
  on public.enquiries (close_reason)
  where close_reason <> '';

comment on column public.enquiries.close_reason is
  'Why the booking was closed. "Duplicate" also hides it from the list and links it to the booking being kept, via duplicate_of.';
