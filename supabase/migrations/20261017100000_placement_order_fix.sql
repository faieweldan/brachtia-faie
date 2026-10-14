-- ===========================================================================
-- Two corrections to 20261014100000_one_placement.sql (17 Oct 2026), found by
-- its database tests once it ran on test-bratchia. Nothing else changes.
--
--   place_stay        A resident moving out of a bed (an Update Tenancy room
--                     change): the next paid resident booked on the bed they
--                     left was not seated. The next one was looked for while
--                     the mover's tenancy still pointed at the old bed, so
--                     seat_if_first saw the mover's own earlier stay there and
--                     refused. The mover's tenancy now moves first, then the
--                     next stay on each bed they left takes it. Same unit
--                     lock, same transaction; the move is still recorded in
--                     placement_moves as before.
--   sync_room_shapes  Cleared its temporary list with a DELETE without WHERE,
--                     which Supabase refuses on API calls ("DELETE requires a
--                     WHERE clause"), so saving a unit failed. It is emptied
--                     with TRUNCATE instead.
--
-- Same names and arguments, so who may call them does not change; the grants
-- are set again anyway. Needs 20261014100000_one_placement.sql. One
-- transaction; safe to run again.
-- Undo: supabase/rollback/20261017100000_placement_order_fix.down.sql
-- ===========================================================================

begin;

do $$
begin
  if to_regprocedure('public.place_stay(uuid, uuid, uuid, boolean, timestamptz, text, date, date, boolean)') is null
     or to_regprocedure('public.seat_if_first(uuid, uuid, text)') is null
     or to_regprocedure('public.sync_room_shapes(uuid)') is null then
    raise exception 'placement_order_fix needs 20261014100000_one_placement.sql first. Nothing was changed.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. place_stay: the mover's tenancy moves before the bed they left is offered
--    to the next paid stay on it.
-- ---------------------------------------------------------------------------
create or replace function public.place_stay(
  p_enquiry uuid, p_resident uuid, p_bed uuid, p_whole boolean default false,
  p_hold_until timestamptz default null, p_by text default '',
  p_start date default null, p_end date default null, p_later boolean default false
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
  v_left   uuid[];
  v_gone   uuid;
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
  if p_later and v_res.id is null then
    return jsonb_build_object('ok', false, 'error', 'Only a resident''s room can be held for a later date.');
  end if;
  if p_later and (p_start is null or p_end is null) then
    return jsonb_build_object('ok', false, 'error', 'A room held for a change needs its start and end dates.');
  end if;

  select * into v_t from public.tenancies t
   where (p_enquiry is not null and t.enquiry_id = p_enquiry)
      or (p_enquiry is null and t.resident_id = v_res.id)
   order by t.start_date desc nulls last, t.created_at desc limit 1;
  v_start := coalesce(p_start, v_t.start_date, v_e.move_in,
                      case when v_res.move_in ~ '^\d{4}-\d{2}-\d{2}$' then v_res.move_in::date end);
  v_end   := coalesce(p_end, v_t.end_date, v_e.move_out);
  if v_start is not null and v_end is not null and v_end < v_start then
    return jsonb_build_object('ok', false, 'error', 'The stay ends before it starts.');
  end if;

  if not exists (select 1 from public.beds where id = p_bed) then
    return jsonb_build_object('ok', false, 'error', 'That bed no longer exists.');
  end if;
  -- every unit involved - where they go, where they are, what they hold - locked in one fixed order
  select array_agg(distinct rm.unit_id) into v_units
    from public.beds b join public.rooms rm on rm.id = b.room_id
   where b.id = p_bed
      or (v_res.id is not null and b.resident_id = v_res.id)
      or (v_t.bed_id is not null and b.id::text = v_t.bed_id)
      or b.id in (select h.bed_id from public.placement_holds h
                   where h.enquiry_id = p_enquiry or (v_res.id is not null and h.resident_id = v_res.id and h.enquiry_id is null));
  perform public.lock_units(v_units);

  v_err := public.placement_conflict(p_bed, p_enquiry, v_res.id, v_start, v_end,
                                     coalesce(nullif(v_res.gender, ''), v_e.gender), p_whole);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'conflict', true,
      'error', 'This room is not free for these dates.', 'detail', v_err);
  end if;

  if p_later then
    -- held for the resident from p_start; the bed row and their tenancy are not touched
    insert into public.placement_holds (enquiry_id, resident_id, bed_id, start_date, end_date, hold_until, created_by)
    values (null, v_res.id, p_bed, v_start, v_end, p_hold_until, coalesce(p_by, ''));
  elsif v_t.id is null and v_res.id is null then
    -- unpaid: the hold is the whole placement
    insert into public.placement_holds (enquiry_id, bed_id, start_date, end_date, hold_until, created_by)
    values (p_enquiry, p_bed, coalesce(p_start, v_e.move_in), coalesce(p_end, v_e.move_out), p_hold_until, coalesce(p_by, ''))
    on conflict (enquiry_id) do update
      set bed_id = excluded.bed_id, start_date = excluded.start_date, end_date = excluded.end_date,
          hold_until = excluded.hold_until, created_by = excluded.created_by, created_at = now();
  else
    -- what they leave: the bed they are the resident of (its status goes with them)
    select array_agg(b.id) into v_left from public.beds b
     where b.id <> p_bed and v_res.id is not null and b.resident_id = v_res.id;
    for v_old in select b.* from public.beds b where b.id <> p_bed and v_res.id is not null and b.resident_id = v_res.id loop
      v_keep := v_old.status;
      perform public.empty_bed(v_old.id);
    end loop;
    delete from public.placement_holds where enquiry_id = p_enquiry;
    -- a resident's own holds on where they go and where they leave are done with
    if v_res.id is not null then
      delete from public.placement_holds h
       where h.enquiry_id is null and h.resident_id = v_res.id
         and (h.bed_id = p_bed or h.bed_id = any(coalesce(v_left, '{}'::uuid[]))
              or (v_t.bed_id is not null and h.bed_id::text = v_t.bed_id));
    end if;
    -- the room they leave, kept as history
    if coalesce(v_t.bed_id, '') <> p_bed::text and (v_t.bed_id is not null or v_left is not null) then
      insert into public.placement_moves (resident_id, tenancy_id, enquiry_id, from_bed_id, to_bed_id, moved_on, created_by)
      values (v_res.id, v_t.id, coalesce(p_enquiry, v_t.enquiry_id),
              coalesce(case when v_t.bed_id ~* '^[0-9a-f-]{36}$' then v_t.bed_id::uuid end, v_left[1]),
              p_bed, coalesce(p_start, current_date), coalesce(p_by, ''));
    end if;
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
    -- the next paid stay on each bed they left takes it - only now, once their
    -- tenancy points at the new bed, so seat_if_first no longer counts their
    -- own earlier stay there as one waiting before the next resident's
    foreach v_gone in array coalesce(v_left, '{}'::uuid[]) loop
      perform public.seat_if_first(v_gone, t.id)
         from public.tenancies t join public.residents r on r.id = t.resident_id
        where t.bed_id = v_gone::text and t.resident_id <> v_res.id
          and coalesce(t.end_date, 'infinity'::date) >= current_date and lower(coalesce(r.status, '')) <> 'inactive'
        order by t.start_date nulls last limit 1;
    end loop;
  end if;

  if p_whole then
    select * into v_bed from public.beds where id = p_bed;
    update public.beds s set status = 'held', hold_for = 'Sold as single', hold_until = null
     where s.room_id = v_bed.room_id and s.id <> p_bed and s.status = 'vacant' and s.resident_id is null;
  end if;

  return jsonb_build_object('ok', true, 'placed', case when v_now then 'now' else 'later' end);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. sync_room_shapes: its temporary list emptied with TRUNCATE.
-- ---------------------------------------------------------------------------
create or replace function public.sync_room_shapes(p_unit uuid default null)
returns integer
language plpgsql
set search_path = public
as $$
declare v_n integer;
begin
  perform public.lock_units(case when p_unit is null then (select array_agg(id) from public.units) else array[p_unit] end);
  create temporary table if not exists _reshape (room_id uuid, occ text) on commit drop;
  -- emptied for a second call in the same transaction; TRUNCATE, not a DELETE
  -- without WHERE, which Supabase refuses on API calls (safe-update protection).
  -- The table is this session's own temporary one, so the lock it takes holds
  -- nobody else up, and it is undone with the transaction like any other step.
  truncate _reshape;

  insert into _reshape
  select rm.id, case when rt.occupancies ? 'twin' then 'twin' else 'single' end
    from public.rooms rm
    join public.room_types rt on rt.code = rm.room_type_code
   where (p_unit is null or rm.unit_id = p_unit)
     and lower(rm.letter) <> 'unit'
     and rm.occupancy <> case when rt.occupancies ? 'twin' then 'twin' else 'single' end
     and not exists (select 1 from public.beds b where b.room_id = rm.id and public.bed_in_use(b.id));
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

-- 3. Only the server (service role) may call these - as before.
do $$
declare f text;
begin
  foreach f in array array[
    'public.place_stay(uuid, uuid, uuid, boolean, timestamptz, text, date, date, boolean)',
    'public.sync_room_shapes(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;
