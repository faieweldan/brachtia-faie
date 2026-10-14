-- Resident labels (Dani, 13 Oct 2026): like WhatsApp's chat labels.
--
-- Admin makes a label - a name and a colour - and puts it on any resident to
-- filter the list by it. Labels are typed by admin and mean nothing to the
-- system: no rule reads them, and they repeat no fact stored elsewhere.
-- One list, shared by every admin. A resident can have several.
--
-- Server only, like placement_holds: the app reads and writes these through
-- its admin server functions with the service role. Safe to run twice.

create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- one of the colour keys in src/lib/labels.ts
  color text not null default 'slate',
  created_at timestamptz not null default now()
);
-- two labels may not share a name, whatever the capitals
create unique index if not exists labels_name_key on public.labels (lower(name));

create table if not exists public.resident_labels (
  resident_id uuid not null references public.residents(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (resident_id, label_id)
);
create index if not exists resident_labels_label_idx on public.resident_labels (label_id);

alter table public.labels enable row level security;
alter table public.resident_labels enable row level security;
revoke all on public.labels, public.resident_labels from anon, authenticated;
grant all on public.labels, public.resident_labels to service_role;
