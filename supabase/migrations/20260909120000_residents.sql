-- ===========================================================================
-- residents
--
-- Mirrors the Resident type in src/lib/ops-store.ts, plus the extra columns the
-- legacy master-list import carries (legacy_id, sponsor, status).
--
-- Identity:
--   id         internal uuid, used for every foreign key
--   legacy_id  Brachtia's own resident number, e.g. '00256'. This is the
--              StudentID column in the master sheet and the "Resident ID" in
--              the import spec. It is what a re-upload matches on, so editing
--              one student and re-uploading updates them instead of adding a
--              second copy. Not the university's student number - that is
--              student_id below.
--
-- Placement (which bed) is NOT stored here. beds.resident_id holds the legacy
-- id and is the single source of that link, so the two can never disagree.
-- ===========================================================================

create table public.residents (
  id                 uuid primary key default gen_random_uuid(),
  legacy_id          text unique,          -- '00256'; null for residents created in-app

  -- personal
  full_name          text not null default '',
  email              text not null default '',
  mobile             text not null default '',
  dob                text not null default '',
  nationality        text not null default '',
  id_number          text not null default '',   -- passport / NRIC
  gender             text not null default '',
  marital_status     text not null default '',
  race               text not null default '',
  religion           text not null default '',

  -- academic
  university         text not null default '',
  level_of_study     text not null default '',
  course             text not null default '',
  student_id         text not null default '',   -- the university's number
  graduation_year    text not null default '',
  sponsor            text not null default '',

  -- housing
  occupancy          text not null default '',
  move_in            text not null default '',
  lease_months       text not null default '',
  medical_condition  text not null default '',   -- '' | 'yes' | 'no'
  medical_detail     text not null default '',

  -- emergency contact
  ec_name            text not null default '',
  ec_relationship    text not null default '',
  ec_mobile          text not null default '',
  ec_email           text not null default '',
  ec_address         text not null default '',
  ec_postcode        text not null default '',
  ec_state           text not null default '',
  ec_country         text not null default '',

  -- payment
  pay_method         text not null default '',
  pay_schedule       text not null default '',
  payer_name         text not null default '',
  payer_relationship text not null default '',
  payer_mobile       text not null default '',
  payer_email        text not null default '',

  -- misc
  status             text not null default '',   -- from the master list
  portal_invited     boolean not null default false,
  docs               jsonb not null default '[]'::jsonb,

  enquiry_id         uuid references public.enquiries(id) on delete set null,
  import_batch_id    uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index residents_legacy_idx on public.residents (legacy_id);
create index residents_name_idx   on public.residents (full_name);
create index residents_email_idx  on public.residents (email);

create trigger residents_touch before update on public.residents
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS - same admin-only pattern as the rest of this schema.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.residents to authenticated;
grant all on public.residents to service_role;
alter table public.residents enable row level security;

create policy "admins manage residents" on public.residents for all to authenticated
  using (exists (select 1 from public.user_roles ur
                 where ur.user_id = auth.uid() and ur.role = 'admin'))
  with check (exists (select 1 from public.user_roles ur
                      where ur.user_id = auth.uid() and ur.role = 'admin'));
