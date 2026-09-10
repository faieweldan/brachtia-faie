-- beds.resident_id was text holding the master list's legacy number ('00256').
-- Nothing stopped it pointing at a resident who does not exist, so a bad import
-- or a corrected legacy number showed up as a blank name on the page instead of
-- a failed write. This makes it a real uuid link that Postgres enforces.
--
-- The legacy number is not lost - it stays on residents.legacy_id, searchable
-- and displayed. Only the link changes.

-- 1. legacy numbers -> the resident's uuid
update public.beds b
   set resident_id = r.id::text
  from public.residents r
 where r.legacy_id = b.resident_id;

-- 2. anything left that is not a uuid of a real resident was already dangling
update public.beds
   set resident_id = null
 where resident_id is not null
   and resident_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

update public.beds b
   set resident_id = null
 where b.resident_id is not null
   and not exists (select 1 from public.residents r where r.id = b.resident_id::uuid);

-- 3. the column becomes a checked link
alter table public.beds
  alter column resident_id type uuid using resident_id::uuid;

alter table public.beds
  add constraint beds_resident_id_fkey
  foreign key (resident_id) references public.residents(id) on delete set null;

create index if not exists beds_resident_id_idx on public.beds (resident_id);
