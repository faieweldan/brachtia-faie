-- ===========================================================================
-- profile_links
--
-- A link a student opens to fill in their own profile. There is no login, so
-- the token IS the credential: it is long, random, expiring and revocable, and
-- the server only ever lets it read or write the profile fields of the one
-- resident it belongs to.
-- ===========================================================================

create table public.profile_links (
  id           uuid primary key default gen_random_uuid(),
  resident_id  uuid not null references public.residents(id) on delete cascade,

  token        text not null unique,
  expires_at   timestamptz not null default (now() + interval '30 days'),
  revoked_at   timestamptz,
  opened_at    timestamptz,
  submitted_at timestamptz,

  created_at   timestamptz not null default now()
);

create index profile_links_resident_idx on public.profile_links (resident_id);
create index profile_links_token_idx    on public.profile_links (token);

-- No public policy: the token is checked by a server function holding the
-- service role, never by the browser. Nothing anonymous may read this table.
alter table public.profile_links enable row level security;
grant all on public.profile_links to service_role;

create policy "admins manage profile links" on public.profile_links for all to authenticated
  using (exists (select 1 from public.user_roles ur
                 where ur.user_id = auth.uid() and ur.role = 'admin'))
  with check (exists (select 1 from public.user_roles ur
                      where ur.user_id = auth.uid() and ur.role = 'admin'));
