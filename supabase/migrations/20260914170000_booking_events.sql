-- ===========================================================================
-- Who did what on a booking.
--
-- Every step on a booking - reserving its room, booking or cancelling a viewing,
-- issuing, editing or cancelling an invoice, recording money, releasing the
-- bed, closing it - is done by the booking's assigned staff member, and leaves
-- one row here with their name. A row cannot be saved without a name.
--
-- Only the server writes and reads it (service role), so no policies are added.
--
-- Safe to run again: everything is created only if it is not there yet.
-- ===========================================================================

create table if not exists public.booking_events (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries(id) on delete cascade,
  kind text not null,
  ref text not null default '',
  summary text not null default '',
  staff text not null check (btrim(staff) <> ''),
  created_at timestamptz not null default now()
);

create index if not exists booking_events_enquiry_idx
  on public.booking_events (enquiry_id, created_at desc);

alter table public.booking_events enable row level security;

-- a table made by SQL is not open to the server until granted: without this every
-- audit row fails with "permission denied" and no names are saved
grant all on public.booking_events to service_role;
