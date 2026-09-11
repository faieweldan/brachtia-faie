-- ===========================================================================
-- The declaration, and the act of signing it.
--
-- A signature is an event, in the same sense a payment is: it records that
-- something happened at a moment in time, and it is never edited. Changing the
-- terms does not change what somebody agreed to last March - it creates a new
-- version, and anyone still on the old one can be seen.
--
-- The wording is kept in a table of its own, with a hash, so an accidental edit
-- to a version people have already signed can be detected instead of quietly
-- rewriting history.
-- ===========================================================================

create table if not exists public.declaration_versions (
  id             uuid primary key default gen_random_uuid(),
  version        text not null unique,        -- 'v1'
  body           text not null,               -- the exact words shown
  body_sha256    text not null,               -- what the server checks against
  effective_from date not null default current_date,
  created_at     timestamptz not null default now()
);

create table if not exists public.resident_declarations (
  id              uuid primary key default gen_random_uuid(),
  resident_id     uuid not null references public.residents(id) on delete cascade,
  version_id      uuid not null references public.declaration_versions(id) on delete restrict,

  -- who signed, in their own words
  signed_name     text not null,
  signed_id_number text not null default '',

  -- which of the cost terms were ticked, and whether the text was read to the end
  agreed_terms    jsonb not null default '{}'::jsonb,
  scrolled_to_end boolean not null default false,

  -- the evidence. none of this is displayed; all of it is what makes the
  -- signature worth something if it is ever questioned
  signed_at       timestamptz not null default now(),
  signed_ip       text not null default '',
  signed_user_agent text not null default '',
  profile_link_id uuid references public.profile_links(id) on delete set null,

  created_at      timestamptz not null default now(),

  -- signing the same version twice is a double click, not a second signature
  unique (resident_id, version_id)
);

create index if not exists resident_declarations_resident_idx
  on public.resident_declarations (resident_id);

alter table public.declaration_versions  enable row level security;
alter table public.resident_declarations enable row level security;
grant all on public.declaration_versions  to service_role;
grant all on public.resident_declarations to service_role;

do $$
begin
  if not exists (select 1 from pg_policies
                 where tablename = 'declaration_versions' and policyname = 'admins read declarations') then
    create policy "admins read declarations" on public.declaration_versions for select to authenticated
      using (exists (select 1 from public.user_roles ur
                     where ur.user_id = auth.uid() and ur.role = 'admin'));
  end if;
  if not exists (select 1 from pg_policies
                 where tablename = 'resident_declarations' and policyname = 'admins read signatures') then
    create policy "admins read signatures" on public.resident_declarations for select to authenticated
      using (exists (select 1 from public.user_roles ur
                     where ur.user_id = auth.uid() and ur.role = 'admin'));
  end if;
end $$;
