create type public.app_role as enum ('admin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "own roles readable" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create table public.residences (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  location text not null default '',
  tagline text not null default '',
  summary text not null default '',
  description jsonb not null default '[]'::jsonb,
  hero_image text not null default '',
  gallery jsonb not null default '[]'::jsonb,
  building_facilities jsonb not null default '[]'::jsonb,
  included_in_stay jsonb not null default '[]'::jsonb,
  utilities_note text not null default '',
  inside_apartment jsonb not null default '[]'::jsonb,
  apartment_footnote text,
  coords jsonb not null default '{"lat":0,"lng":0}'::jsonb,
  nearby_universities jsonb not null default '[]'::jsonb,
  points_of_interest jsonb not null default '[]'::jsonb,
  terms jsonb not null default '[]'::jsonb,
  contract_terms jsonb not null default '["long"]'::jsonb,
  single_bed_options jsonb not null default '[]'::jsonb,
  payment_cycle text not null default '',
  fee_config jsonb not null default '{}'::jsonb,
  pricing jsonb not null default '{"long":[],"short":[]}'::jsonb,
  waze_url text not null default '',
  published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.residences to anon;
grant select, insert, update, delete on public.residences to authenticated;
grant all on public.residences to service_role;
alter table public.residences enable row level security;
create policy "published residences are public" on public.residences for select to anon using (published);
create policy "authenticated can read residences" on public.residences for select to authenticated using (true);
create policy "admins manage residences" on public.residences for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.room_types (
  id uuid primary key default gen_random_uuid(),
  residence_id uuid not null references public.residences(id) on delete cascade,
  code text not null,
  tag text not null default '',
  room_code text not null default '',
  name text not null,
  unit_type text not null default '',
  description text not null default '',
  size_sqft integer,
  size_label text,
  bathroom text not null default 'shared',
  has_view boolean not null default false,
  view_type text,
  public_visible boolean not null default true,
  image text not null default '',
  gallery jsonb not null default '[]'::jsonb,
  features jsonb not null default '[]'::jsonb,
  occupancies jsonb not null default '["single"]'::jsonb,
  rent jsonb not null default '{"long":{"single":null,"twin":null},"short":{"single":null,"twin":null}}'::jsonb,
  available_from date,
  status text not null default 'available',
  spots_left integer,
  beds jsonb not null default '{}'::jsonb,
  furnishing jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (residence_id, code)
);
grant select on public.room_types to anon;
grant select, insert, update, delete on public.room_types to authenticated;
grant all on public.room_types to service_role;
alter table public.room_types enable row level security;
create policy "room types are public" on public.room_types for select to anon using (true);
create policy "authenticated can read room types" on public.room_types for select to authenticated using (true);
create policy "admins manage room types" on public.room_types for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.appointment_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  duration_minutes integer not null default 30,
  color text not null default '#0f5132',
  bookable_online boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.appointment_types to anon;
grant select, insert, update, delete on public.appointment_types to authenticated;
grant all on public.appointment_types to service_role;
alter table public.appointment_types enable row level security;
create policy "appointment types are public" on public.appointment_types for select to anon using (true);
create policy "authenticated read appointment types" on public.appointment_types for select to authenticated using (true);
create policy "admins manage appointment types" on public.appointment_types for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  residence_id uuid references public.residences(id) on delete cascade,
  mode text not null default 'any',
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null default '10:00',
  end_time time not null default '18:00',
  slot_minutes integer not null default 30,
  buffer_minutes integer not null default 0,
  capacity integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.availability_rules to authenticated;
grant all on public.availability_rules to service_role;
alter table public.availability_rules enable row level security;
create policy "admins manage availability" on public.availability_rules for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.blocked_dates (
  id uuid primary key default gen_random_uuid(),
  residence_id uuid references public.residences(id) on delete cascade,
  blocked_on date not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.blocked_dates to authenticated;
grant all on public.blocked_dates to service_role;
alter table public.blocked_dates enable row level security;
create policy "admins manage blocked dates" on public.blocked_dates for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  type_slug text not null default 'viewing-in-person',
  residence_id uuid references public.residences(id) on delete set null,
  residence_slug text not null default '',
  residence_name text not null default '',
  mode text not null default 'in_person',
  starts_at timestamptz not null,
  duration_minutes integer not null default 30,
  status text not null default 'pending',
  full_name text not null default '',
  email text not null default '',
  phone text not null default '',
  university text not null default '',
  notes text not null default '',
  admin_notes text not null default '',
  source text not null default 'website',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index appointments_starts_at_idx on public.appointments (starts_at);
grant select, insert, update, delete on public.appointments to authenticated;
grant all on public.appointments to service_role;
alter table public.appointments enable row level security;
create policy "admins manage appointments" on public.appointments for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  residence_slug text not null default '',
  residence_name text not null default '',
  room_code text not null default '',
  room_name text not null default '',
  occupancy text not null default 'single',
  move_in date,
  move_out date,
  term text not null default 'long',
  payment_term text not null default 'bimonthly',
  monthly_rent numeric not null default 0,
  first_payment numeric not null default 0,
  addons jsonb not null default '[]'::jsonb,
  full_name text not null default '',
  email text not null default '',
  phone text not null default '',
  nationality text not null default '',
  university text not null default '',
  intake text not null default '',
  gender text not null default '',
  message text not null default '',
  status text not null default 'new',
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index enquiries_created_at_idx on public.enquiries (created_at desc);
grant select, insert, update, delete on public.enquiries to authenticated;
grant all on public.enquiries to service_role;
alter table public.enquiries enable row level security;
create policy "admins manage enquiries" on public.enquiries for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

insert into public.appointment_types (slug,name,duration_minutes,color,bookable_online,sort_order) values
 ('viewing-in-person','Viewing (in person)',30,'#0f5132',true,0),
 ('viewing-virtual','Virtual tour',30,'#2563eb',true,1),
 ('check-in','Check-in',60,'#b45309',false,2),
 ('check-out','Check-out',60,'#7c3aed',false,3);

insert into public.availability_rules (mode,weekday,start_time,end_time,slot_minutes,capacity)
select 'any', d, '10:00', '18:00', 30, 1 from generate_series(1,6) as d;