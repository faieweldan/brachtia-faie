-- ROLLBACK of supabase/migrations/20261014100000_one_placement.sql (Phase 2, 14 Oct 2026).
--
-- Puts place_stay, unit_claims and sync_room_shapes back as 20261009100000 and
-- 20261011110000 left them, and removes what Phase 2 added. Run ONLY together
-- with reverting the Phase 2 code (branch phase2-placement): that code needs
-- the new functions. One transaction; safe to run twice. placement_moves (the
-- history of room changes) is kept.
--
-- This folder is not supabase/migrations on purpose: nothing runs it by itself.

begin;

-- rooms held for Update Tenancy changes: the old code cannot see them
delete from public.placement_holds where enquiry_id is null;

alter table public.placement_holds drop constraint if exists placement_holds_no_overlap;
alter table public.placement_holds drop constraint if exists placement_holds_resident_dates;
alter table public.placement_holds drop constraint if exists placement_holds_owner;
alter table public.placement_holds alter column enquiry_id set not null;
drop index if exists public.placement_holds_resident_idx;
alter table public.placement_holds drop column if exists resident_id;

drop function if exists public.place_stay(uuid, uuid, uuid, boolean, timestamptz, text, date, date, boolean);
create or replace function public.place_stay(
  p_enquiry uuid, p_resident uuid, p_bed uuid, p_whole boolean default false,
  p_hold_until timestamptz default null, p_by text default ''
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_e      record;
  v_res    record;
  v_t      record;
  v_bed    record;
  v_start  date;
  v_end    date;
  v_err    text;
  v_keep   text;
  v_old    record;
  v_units  uuid[];
  v_now    boolean := false;
begin
  -- always selected, so v_e has its fields (all null) when there is no booking
  select * into v_e from public.enquiries where id = p_enquiry;
  if p_enquiry is not null and v_e.id is null then
    return jsonb_build_object('ok', false, 'error', 'Booking not found.');
  end if;
  select r.* into v_res from public.residents r
   where r.id = p_resident
      or (p_enquiry is not null and (r.id::text = nullif(v_e.resident_id, '') or r.enquiry_id = p_enquiry))
   order by (r.id = p_resident) desc nulls last limit 1;
  if p_enquiry is null and v_res.id is null then return jsonb_build_object('ok', false, 'error', 'Resident not found.'); end if;

  select * into v_t from public.tenancies t
   where (p_enquiry is not null and t.enquiry_id = p_enquiry)
      or (p_enquiry is null and t.resident_id = v_res.id)
   order by t.start_date desc nulls last, t.created_at desc limit 1;
  v_start := coalesce(v_t.start_date, v_e.move_in,
                      case when v_res.move_in ~ '^\d{4}-\d{2}-\d{2}$' then v_res.move_in::date end);
  v_end   := coalesce(v_t.end_date, v_e.move_out);

  if not exists (select 1 from public.beds where id = p_bed) then
    return jsonb_build_object('ok', false, 'error', 'That bed no longer exists.');
  end if;
  -- the units it leaves and the one it goes to, locked in one fixed order
  select array_agg(distinct rm.unit_id) into v_units
    from public.beds b join public.rooms rm on rm.id = b.room_id
   where b.id = p_bed
      or (v_res.id is not null and b.resident_id = v_res.id)
      or (v_t.bed_id is not null and b.id::text = v_t.bed_id)
      or b.id in (select h.bed_id from public.placement_holds h where h.enquiry_id = p_enquiry);
  perform public.lock_units(v_units);

  v_err := public.placement_conflict(p_bed, p_enquiry, v_res.id, v_start, v_end,
                                     coalesce(nullif(v_res.gender, ''), v_e.gender), p_whole);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'conflict', true,
      'error', 'This room is not free for these dates.', 'detail', v_err);
  end if;

  if v_t.id is null and v_res.id is null then
    -- unpaid: the hold is the whole placement
    insert into public.placement_holds (enquiry_id, bed_id, start_date, end_date, hold_until, created_by)
    values (p_enquiry, p_bed, v_e.move_in, v_e.move_out, p_hold_until, coalesce(p_by, ''))
    on conflict (enquiry_id) do update
      set bed_id = excluded.bed_id, start_date = excluded.start_date, end_date = excluded.end_date,
          hold_until = excluded.hold_until, created_by = excluded.created_by, created_at = now();
  else
    -- what they leave: the bed they are the resident of (its status goes with them)
    for v_old in select b.* from public.beds b where b.id <> p_bed and v_res.id is not null and b.resident_id = v_res.id loop
      v_keep := v_old.status;
      perform public.empty_bed(v_old.id);
      -- the next paid stay on the bed they left takes it
      perform public.seat_if_first(v_old.id, t.id)
         from public.tenancies t join public.residents r on r.id = t.resident_id
        where t.bed_id = v_old.id::text and t.resident_id <> v_res.id
          and coalesce(t.end_date, 'infinity'::date) >= current_date and lower(coalesce(r.status, '')) <> 'inactive'
        order by t.start_date nulls last limit 1;
    end loop;
    delete from public.placement_holds where enquiry_id = p_enquiry;
    if v_t.id is not null then
      update public.tenancies set bed_id = p_bed::text, updated_at = now() where id = v_t.id;
      v_now := public.seat_if_first(p_bed, v_t.id, v_keep);
    else
      -- a resident with no tenancy on record (an older resident): straight onto the bed, if it is free
      select * into v_bed from public.beds where id = p_bed;
      if v_bed.resident_id is null or v_bed.resident_id = v_res.id then
        update public.beds set resident_id = v_res.id, resident_name = v_res.full_name,
          status = case when v_keep in ('active', 'notice') then v_keep else 'booked' end,
          gender = nullif(v_res.gender, ''), university = nullif(v_res.university, ''), nationality = nullif(v_res.nationality, ''),
          tenancy_start = v_start, tenancy_end = v_end
         where id = p_bed;
        v_now := true;
      end if;
    end if;
  end if;

  if p_whole then
    select * into v_bed from public.beds where id = p_bed;
    update public.beds s set status = 'held', hold_for = 'Sold as single', hold_until = null
     where s.room_id = v_bed.room_id and s.id <> p_bed and s.status = 'vacant' and s.resident_id is null;
  end if;

  return jsonb_build_object('ok', true, 'placed', case when v_now then 'now' else 'later' end);
end;
$$;

create or replace function public.unit_claims(p_unit uuid)
returns table (bed_id uuid, room_id uuid, enquiry_id uuid, resident_id uuid, who text, gender text, starts date, ends date)
language sql stable
set search_path = public
as $$
  -- the bed's resident (in it now, or first assigned)
  select b.id, b.room_id, null::uuid, b.resident_id,
         coalesce(nullif(b.resident_name, ''), r.full_name, 'someone'),
         coalesce(nullif(r.gender, ''), b.gender, ''),
         b.tenancy_start, b.tenancy_end
    from public.beds b
    join public.rooms rm on rm.id = b.room_id
    left join public.residents r on r.id = b.resident_id
   where rm.unit_id = p_unit and b.resident_id is not null and b.status <> 'vacant'
  union all
  -- an unpaid hold
  select h.bed_id, b.room_id, h.enquiry_id, null::uuid,
         coalesce(nullif(e.full_name, ''), 'someone'), coalesce(e.gender, ''),
         coalesce(h.start_date, e.move_in), coalesce(h.end_date, e.move_out)
    from public.placement_holds h
    join public.beds b on b.id = h.bed_id
    join public.rooms rm on rm.id = b.room_id
    join public.enquiries e on e.id = h.enquiry_id
   where rm.unit_id = p_unit
  union all
  -- a hand-made hold with nobody behind it: taken until released
  select b.id, b.room_id, null::uuid, null::uuid, coalesce(nullif(b.hold_for, ''), 'a hold'), '', null::date, null::date
    from public.beds b
    join public.rooms rm on rm.id = b.room_id
   where rm.unit_id = p_unit and b.status = 'held' and b.resident_id is null
     and coalesce(b.hold_for, '') <> 'Sold as single'
  union all
  -- a paid stay placed on a bed somebody else is the resident of: still to come
  select b.id, b.room_id, t.enquiry_id, r.id, r.full_name, coalesce(r.gender, ''), t.start_date, t.end_date
    from public.tenancies t
    join public.beds b on b.id::text = t.bed_id
    join public.rooms rm on rm.id = b.room_id
    join public.residents r on r.id = t.resident_id
   where rm.unit_id = p_unit
     and coalesce(t.end_date, 'infinity'::date) >= current_date
     and lower(coalesce(r.status, '')) <> 'inactive'
     and b.resident_id is distinct from r.id
     and not exists (select 1 from public.beds o where o.resident_id = r.id and o.status <> 'vacant');
$$;

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

drop function if exists public.placement_guard_report();
drop function if exists public.delete_unit_if_unused(uuid);
drop function if exists public.drop_unused_rooms_beds(uuid, jsonb);
drop function if exists public.extend_stay(uuid, uuid, date);
drop function if exists public.move_stay_dates(uuid, date, date, text, numeric, text);
drop function if exists public.bed_in_use(uuid);
drop function if exists public.resident_placements(uuid[]);
drop function if exists public.release_hand_hold(uuid);
drop function if exists public.release_hold(uuid, uuid, uuid);
drop function if exists public.placement_claims(uuid[]);
drop function if exists public.stay_range(date, date);

do $$
declare f text;
begin
  foreach f in array array[
    'public.place_stay(uuid, uuid, uuid, boolean, timestamptz, text)',
    'public.unit_claims(uuid)',
    'public.sync_room_shapes(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;
