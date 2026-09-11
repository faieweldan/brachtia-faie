-- ===========================================================================
-- Homes: physical inventory tables
--
-- Mirrors the Unit / UnitRoom / Bed types in src/lib/ops-store.ts so that
-- rewriting saveUnit() is a mechanical mapping rather than a redesign.
--
-- Adds only. Nothing existing is modified; residences and room_types are
-- referenced, never changed.
--
-- NOTE: these tables were created by hand in the Supabase dashboard on the
-- test-bratchia project before this file existed. This file is the record of
-- that change and the script to reproduce it on any other project (Lovable).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- units   e.g. U001 / A-07-01
-- ---------------------------------------------------------------------------
create table public.units (
  id                uuid primary key default gen_random_uuid(),
  residence_id      uuid not null references public.residences(id) on delete restrict,

  code              text not null,              -- U001
  unit_no           text not null,              -- A-07-01
  block             text not null default '',
  floor             text not null default '',
  unit_type         text not null default '',   -- 3-bedroom / 4-bedroom
  gender            text not null default '',   -- Male / Female / '' = any

  whole_unit        boolean not null default false,
  whole_unit_rent   numeric not null default 0,

  notes             text not null default '',
  import_batch_id   uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- re-running an import updates the unit instead of duplicating it
  unique (residence_id, unit_no)
);

create index units_residence_idx on public.units (residence_id);


-- ---------------------------------------------------------------------------
-- rooms   Room A / B / C / D inside a unit
-- ---------------------------------------------------------------------------
create table public.rooms (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units(id) on delete cascade,

  letter          text not null,                    -- A
  room_type_code  text not null default '',         -- matches room_types.room_code
  occupancy       text not null default 'single'
                  check (occupancy in ('single','twin')),

  -- copied from the room type at import time so historical rent is not lost
  -- when website pricing changes. the room type stays the source for new lets.
  rent            numeric not null default 0,

  sort_order      integer not null default 0,
  import_batch_id uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (unit_id, letter)
);

create index rooms_unit_idx on public.rooms (unit_id);


-- ---------------------------------------------------------------------------
-- beds   the unit of inventory
--
-- The resident_* / tenancy_* columns below mirror what ops-store.Bed holds
-- today. They are denormalised on purpose so the current UI keeps working.
-- Once the tenancies table exists these become derived and should be dropped.
-- ---------------------------------------------------------------------------
create table public.beds (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references public.rooms(id) on delete cascade,

  label           text not null,                    -- Single / Twin 1 / Twin 2
  status          text not null default 'vacant'
                  check (status in ('vacant','held','booked','active','notice')),

  -- hold: the only status a human sets directly
  hold_for        text,
  hold_until      timestamptz,
  enquiry_id      uuid references public.enquiries(id) on delete set null,

  -- placement snapshot (temporary - see note above)
  resident_id     text,
  resident_name   text,
  student_id      text,
  university      text,
  nationality     text,
  gender          text,
  tenancy_start   date,
  tenancy_end     date,
  rent            numeric,

  sort_order      integer not null default 0,
  import_batch_id uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (room_id, label)
);

create index beds_room_idx    on public.beds (room_id);
create index beds_status_idx  on public.beds (status);
create index beds_enquiry_idx on public.beds (enquiry_id);


-- ---------------------------------------------------------------------------
-- import_batches   makes a bad import undoable in one statement
-- ---------------------------------------------------------------------------
create table public.import_batches (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,                       -- units | residents | tenancies
  filename     text not null default '',
  row_count    integer not null default 0,
  error_count  integer not null default 0,
  status       text not null default 'committed',
  created_at   timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger units_touch before update on public.units
  for each row execute function public.touch_updated_at();
create trigger rooms_touch before update on public.rooms
  for each row execute function public.touch_updated_at();
create trigger beds_touch  before update on public.beds
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------------
-- RLS - same admin-only pattern as the rest of this schema.
-- Server functions use the service role key, which bypasses RLS.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['units','rooms','beds','import_batches']
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      create policy "admins manage %1$s" on public.%1$I for all to authenticated
      using (exists (select 1 from public.user_roles ur
                     where ur.user_id = auth.uid() and ur.role = 'admin'))
      with check (exists (select 1 from public.user_roles ur
                          where ur.user_id = auth.uid() and ur.role = 'admin'))
    $f$, t);
  end loop;
end $$;
