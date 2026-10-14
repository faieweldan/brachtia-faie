-- ===========================================================================
-- Migrating existing residents: keep their original papers, and a record of
-- every row the importer touched.
--
-- Safe to run twice. Adds columns and one table - touches no unit, room or bed.
-- ===========================================================================

-- The invoice and TA these residents already have. Stored as the original link,
-- never regenerated: the paper the resident signed and paid against is the record.
alter table public.invoices
  add column if not exists legacy_copy_url text;

alter table public.agreement_documents
  add column if not exists legacy_url text;

-- Who confirmed an import, and when. A batch now exists only after the admin
-- has seen the preview and pressed confirm.
alter table public.import_batches
  add column if not exists source_sheet text not null default '',
  add column if not exists confirmed_by text,
  add column if not exists confirmed_at timestamptz;

-- One line per spreadsheet row: what happened to it and why.
create table if not exists public.import_rows (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.import_batches(id) on delete cascade,
  source_row    integer not null,
  resident_key  text not null default '',        -- the StudentID / QuickBooks ID, never a name
  result        text not null
                check (result in ('created', 'updated', 'failed', 'not_imported')),
  reason        text not null default '',
  resident_id   uuid,
  tenancy_id    uuid,
  invoice_id    uuid,
  agreement_id  uuid,
  created_at    timestamptz not null default now()
);

create index if not exists import_rows_batch_idx on public.import_rows (batch_id);

-- Only the server (service role) writes or reads this; nobody signed in as a
-- resident should see another resident's import line.
alter table public.import_rows enable row level security;

-- The same resident cannot hold the same bed from the same day twice. This is
-- what makes uploading the same workbook again harmless.
create unique index if not exists tenancies_resident_bed_start_uniq
  on public.tenancies (resident_id, bed_id, start_date)
  where bed_id is not null;
