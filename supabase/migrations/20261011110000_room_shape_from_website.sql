-- A room's shape comes from its room type in Website (Dani, 11 Oct 2026).
--
-- Twin if the room type is sold as twin at all, else single - the same rule as
-- shapeFromWebsite in src/lib/room-offer.ts. The room's own occupancy column
-- used to be set by hand in Homes and by the master-list import, and drifted
-- from Website: rooms of a type sold single and twin were saved as single, so
-- the room picker could never offer them as a twin, nor a twin as a single.
--
-- sync_room_shapes puts every room that nobody is in back in line with Website.
-- A room with a person, a booking hold, a placement hold or a tenancy on any of
-- its beds is left as it is, and catches up the next time it is synced.
-- The app calls it after a room type, a residence or a unit is saved.
-- Needs 20261009100000_dated_placement.sql (placement_holds).

create or replace function public.sync_room_shapes(p_unit uuid default null)
returns integer
language plpgsql
set search_path = public
as $$
declare v_n integer;
begin
  create temporary table if not exists _reshape (room_id uuid, occ text) on commit drop;
  delete from _reshape;

  insert into _reshape
  select rm.id, case when rt.occupancies ? 'twin' then 'twin' else 'single' end
    from public.rooms rm
    join public.room_types rt on rt.code = rm.room_type_code
   where (p_unit is null or rm.unit_id = p_unit)
     and lower(rm.letter) <> 'unit'
     and rm.occupancy <> case when rt.occupancies ? 'twin' then 'twin' else 'single' end
     and not exists (
       select 1 from public.beds b
        where b.room_id = rm.id
          and (b.resident_id is not null or b.enquiry_id is not null or b.status <> 'vacant'
               or exists (select 1 from public.placement_holds h where h.bed_id = b.id)
               or exists (select 1 from public.tenancies t where t.bed_id = b.id::text)));
  get diagnostics v_n = row_count;

  -- single -> twin: the bed becomes Twin 1, and Twin 2 is added
  update public.beds b set label = 'Twin 1'
    from _reshape r where r.room_id = b.room_id and r.occ = 'twin';
  insert into public.beds (room_id, label, status)
  select r.room_id, 'Twin 2', 'vacant' from _reshape r
   where r.occ = 'twin' and (select count(*) from public.beds b where b.room_id = r.room_id) < 2;

  -- twin -> single: one bed is kept as Single
  delete from public.beds b
   using _reshape r
   where r.room_id = b.room_id and r.occ = 'single'
     and b.id <> (select b2.id from public.beds b2 where b2.room_id = r.room_id order by b2.label limit 1);
  update public.beds b set label = 'Single'
    from _reshape r where r.room_id = b.room_id and r.occ = 'single';

  update public.rooms rm set occupancy = r.occ, updated_at = now()
    from _reshape r where r.room_id = rm.id;

  return v_n;
end;
$$;

revoke all on function public.sync_room_shapes(uuid) from public, anon, authenticated;
