-- ===========================================================================
-- What the student was actually given, kept.
--
-- A quote lived in one box on the booking and every "Update quote" painted
-- over it, so a student holding a PDF could not be answered: the figures they
-- were quoted no longer existed anywhere. An invoice edited after it was
-- raised lost its previous content the same way.
--
-- A version is frozen when the document is downloaded or sent - the moment it
-- can leave the building. Editing freely creates nothing, so the numbering
-- counts documents the student could have seen, not keystrokes.
--
-- The live invoice row is NOT copied forward. Payments point at an invoice, so
-- a new row per version would strand the money on the old one - the exact
-- problem a cancelled invoice already has. The invoice stays put and its
-- previous content is set aside here instead.
--
-- Safe to run again.
-- ===========================================================================

create table if not exists public.quote_versions (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries(id) on delete cascade,
  version integer not null check (version > 0),
  -- the booking reference as it read on the document, without the /2
  reference text not null default '',
  -- the whole quote_snapshot as the PDF was built from it
  snapshot jsonb not null default '{}'::jsonb,
  total_upfront numeric not null default 0,
  monthly_rent numeric not null default 0,
  -- "downloaded" or "sent": how it left
  issued_as text not null default 'downloaded',
  created_at timestamptz not null default now(),
  created_by text not null default '',
  unique (enquiry_id, version)
);

create table if not exists public.invoice_versions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  version integer not null check (version > 0),
  -- the invoice number as it read on the document, without the /2
  number text not null default '',
  -- the whole invoice as the PDF was built from it, its line items included
  document jsonb not null default '{}'::jsonb,
  total numeric not null default 0,
  issued_as text not null default 'downloaded',
  created_at timestamptz not null default now(),
  created_by text not null default '',
  unique (invoice_id, version)
);

-- the version list is read newest-last, per document
create index if not exists quote_versions_enquiry_idx
  on public.quote_versions (enquiry_id, version);
create index if not exists invoice_versions_invoice_idx
  on public.invoice_versions (invoice_id, version);

alter table public.quote_versions enable row level security;
alter table public.invoice_versions enable row level security;
grant all on public.quote_versions to service_role;
grant all on public.invoice_versions to service_role;
