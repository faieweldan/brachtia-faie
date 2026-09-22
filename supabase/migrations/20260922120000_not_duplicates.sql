-- ===========================================================================
-- "These two are not the same person."
--
-- The bookings list now marks every enquiry that shares an email, a phone or a
-- name with another one. Name matching is deliberately loose, so it will pair
-- two unrelated students who happen to share one - and without somewhere to
-- record that, staff would dismiss the same false match every morning.
--
-- One row per pair, not per direction: a_id < b_id is enforced, so "A is not B"
-- and "B is not A" are the same row and cannot disagree with each other. The
-- primary key makes dismissing twice harmless.
--
-- Deleting either enquiry takes the row with it - there is nothing left to say.
--
-- Safe to run again.
-- ===========================================================================

create table if not exists public.enquiry_not_duplicates (
  a_id uuid not null references public.enquiries(id) on delete cascade,
  b_id uuid not null references public.enquiries(id) on delete cascade,
  -- who decided, for the same reason every other action carries a name
  staff text not null default '',
  created_at timestamptz not null default now(),
  primary key (a_id, b_id),
  -- one row per pair, whichever way round staff happened to be looking
  constraint enquiry_not_duplicates_ordered check (a_id < b_id)
);

-- the list asks "is this pair dismissed" for every marked row on every render
create index if not exists enquiry_not_duplicates_b_idx
  on public.enquiry_not_duplicates (b_id);

grant select, insert, update, delete on public.enquiry_not_duplicates to authenticated;
grant all on public.enquiry_not_duplicates to service_role;

alter table public.enquiry_not_duplicates enable row level security;

create policy "admins manage not-duplicates" on public.enquiry_not_duplicates
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

comment on table public.enquiry_not_duplicates is
  'Pairs of enquiries staff have said are different people. Stored once per pair, a_id < b_id.';
