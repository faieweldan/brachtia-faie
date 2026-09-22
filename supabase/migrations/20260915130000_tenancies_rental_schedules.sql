-- ===========================================================================
-- A resident's stay, and the rent schedule that belongs to it.
--
-- tenancies: one row per stay - who, which booking and bed, and its dates. A
-- resident who renews or moves room has another row. Made when admin creates
-- the resident from a paid booking; residents from before are filled in below.
-- Rent and payment schedule are not kept here: the resident's own fields stay
-- the one source for those.
--
-- rental_schedules: the rent terms admin confirmed for one tenancy, kept as a
-- snapshot for financial history. Rent periods are worked out from it and listed
-- as Scheduled; each becomes an invoice only when admin issues it. No row here
-- means "Setup required". final_amount is the shortened last period's amount as
-- admin confirmed it.
--
-- invoices.tenancy_id: the tenancy a rent invoice was issued for. Editing a
-- schedule never touches an invoice already issued.
--
-- Only the server reads and writes these (service role), so no policies.
-- Safe to run again.
-- ===========================================================================

create table if not exists public.tenancies (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id) on delete cascade,
  enquiry_id uuid references public.enquiries(id) on delete set null,
  bed_id text,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- an earlier draft of this file kept rent and schedule on the tenancy as well
alter table public.tenancies drop column if exists monthly_rent;
alter table public.tenancies drop column if exists payment_frequency;

create index if not exists tenancies_resident_idx on public.tenancies (resident_id, start_date desc);
create unique index if not exists tenancies_enquiry_uniq
  on public.tenancies (enquiry_id) where enquiry_id is not null;

create table if not exists public.rental_schedules (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null unique references public.tenancies(id) on delete cascade,
  monthly_rent numeric not null check (monthly_rent > 0),
  frequency text not null
    check (frequency in ('monthly', 'bimonthly', 'quarterly', 'semiannual', 'full')),
  first_period_start date not null,
  first_period_end date not null,
  first_due_date date not null,
  tenancy_end date not null,
  final_amount numeric,
  confirmed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (first_period_end >= first_period_start),
  check (tenancy_end >= first_period_end)
);

alter table public.invoices
  add column if not exists tenancy_id uuid references public.tenancies(id) on delete set null;

alter table public.tenancies enable row level security;
alter table public.rental_schedules enable row level security;
grant all on public.tenancies to service_role;
grant all on public.rental_schedules to service_role;

-- residents already made from a booking get their tenancy
insert into public.tenancies (resident_id, enquiry_id, start_date, end_date)
select r.id, e.id, e.move_in, e.move_out
from public.enquiries e
join public.residents r on r.id::text = e.resident_id::text
where not exists (select 1 from public.tenancies t where t.enquiry_id = e.id);
