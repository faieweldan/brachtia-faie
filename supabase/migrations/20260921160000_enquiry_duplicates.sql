-- ===========================================================================
-- The same enquiry, sent twice.
--
-- Students re-submit: they are not sure it went through, or a parent sends one
-- on their behalf from the same phone. None of that is wrong, and none of it is
-- blocked - a genuine enquiry is never refused because a number was seen before.
--
-- Instead the second one is kept, marked, and pointed at the first, so staff
-- answer one person once rather than three times.
--
--   duplicate_of  the earlier enquiry this one looks like. Null when it is the
--                 first, or when nothing matched inside the window.
--   idempotency_key  one submission, whatever the browser does. A double-click,
--                 a retried request or a refreshed tab sends the same key, and
--                 the unique index means the second insert cannot make a second
--                 row. Null is allowed and never collides, so an older row and
--                 anything submitted without a key are both unaffected.
--
-- "Potential duplicate" is deliberately not a status: status drives the booking
-- pipeline, and a duplicate is still an open enquiry that needs answering.
--
-- Safe to run again.
-- ===========================================================================

alter table public.enquiries
  add column if not exists duplicate_of uuid
    references public.enquiries(id) on delete set null,
  add column if not exists idempotency_key text;

-- the guard itself: two rows cannot share a key. Partial, so the many rows with
-- no key at all are not forced to be unique against each other
create unique index if not exists enquiries_idempotency_key_uniq
  on public.enquiries (idempotency_key)
  where idempotency_key is not null;

-- how the duplicate is looked for: the same email or phone inside a day. Lower()
-- because "A@b.com" and "a@b.com" are one address, and the index has to match
-- the way the query asks or it will not be used
create index if not exists enquiries_email_recent_idx
  on public.enquiries (lower(email), created_at desc)
  where email <> '';

create index if not exists enquiries_phone_recent_idx
  on public.enquiries (phone, created_at desc)
  where phone <> '';

-- staff open a duplicate and want its siblings
create index if not exists enquiries_duplicate_of_idx
  on public.enquiries (duplicate_of)
  where duplicate_of is not null;

comment on column public.enquiries.duplicate_of is
  'The earlier enquiry this one appears to repeat. Set at submit; never blocks the insert.';
comment on column public.enquiries.idempotency_key is
  'One key per submission attempt. The unique index turns a double-click into one row.';
