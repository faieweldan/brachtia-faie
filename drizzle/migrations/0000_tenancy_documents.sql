create sequence if not exists public.agreement_no_seq;

create table if not exists public.tenancy_agreements (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id) on delete cascade,
  tenancy_id uuid references public.tenancies(id) on delete set null,
  agreement_no text not null,
  kind text not null default 'initial',
  created_at timestamptz not null default now()
);

create table if not exists public.agreement_documents (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.tenancy_agreements(id) on delete cascade,
  doc_type text not null,
  version integer not null default 1,
  status text not null default 'generated',
  effective_date date,
  period_start date,
  period_end date,
  merge_values jsonb not null default '{}'::jsonb,
  supersedes uuid references public.agreement_documents(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.access_card_forms (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id) on delete cascade,
  reason text not null default 'Initial Tenancy',
  card_no text not null default '',
  status text not null default 'generated',
  form_date date not null default (now() at time zone 'Asia/Kuala_Lumpur')::date,
  created_at timestamptz not null default now()
);

grant all on public.tenancy_agreements to service_role;
grant all on public.agreement_documents to service_role;
grant all on public.access_card_forms to service_role;
grant usage, select on sequence public.agreement_no_seq to service_role;

alter table public.tenancy_agreements enable row level security;
alter table public.agreement_documents enable row level security;
alter table public.access_card_forms enable row level security;