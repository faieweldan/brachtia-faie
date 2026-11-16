-- A planned leaving date frees the room for the next resident (Dani, 16 Nov 2026).
--
-- Louis, B-06-02 Room A, tenancy to 31 Dec 2026, leaves on 17 Dec. The next
-- resident needs the room from 18 Dec and their invoice now. Until he hands
-- the keys back, the room was his to 31 Dec, so nobody could be booked in.
--
--   tenancies.leaving_on   the day the resident says they leave, set when the
--                          checkout is started (and changed on it until the
--                          room is handed back). The tenancy keeps its end
--                          date: the agreement's term does not change.
--
-- Two dates, two meanings - planned vs done:
--   leaving_on     planned. Their claim on the room ends that day, so the room
--                  can be booked from the day after. Nothing else moves.
--   moved_out_on   done. Staff confirm the keys came back (move_out): the bed
--                  goes to the next resident, rent after the day is dropped.
--
--   1. placement_claims: the bed's resident (and a paid stay to come) claims
--      the room to the earlier of the end date and the leaving date. Every
--      clash check reads placement_claims. The same rule is occupiedUntil in
--      src/lib/placement.ts.
--   2. set_leaving_on: sets or clears it under the unit's lock; days given
--      back are checked against everybody else first.
--
-- Needs 20261026100000_moved_out.sql. Safe to run again.
-- Rollback: supabase/rollback/20261116100000_leaving_on.down.sql

begin;

alter table public.tenancies add column if not exists leaving_on date;

create or replace function public.placement_claims(p_units uuid[] default null)
returns table (bed_id uuid, room_id uuid, unit_id uuid, enquiry_id uuid, resident_id uuid,
               who text, gender text, starts date, ends date, source text)
language sql stable
set search_path = public
as $$
  -- the bed's resident: in it now, or first assigned - on their own tenancy's dates
  -- when it names this bed (the bed's copy only for a resident with no tenancy),
  -- to the day they leave when that is earlier (least() skips a null)
  select b.id, b.room_id, rm.unit_id, null::uuid, b.resident_id,
         coalesce(nullif(b.resident_name, ''), r.full_name, 'someone'),
         coalesce(nullif(r.gender, ''), b.gender, ''),
         coalesce(t.start_date, b.tenancy_start), least(coalesce(t.end_date, b.tenancy_end), t.leaving_on), 'resident'
    from public.beds b
    join public.rooms rm on rm.id = b.room_id
    left join public.residents r on r.id = b.resident_id
    left join lateral (
      select t2.start_date, t2.end_date, t2.leaving_on from public.tenancies t2
       where t2.resident_id = b.resident_id and t2.bed_id = b.id::text
       order by t2.start_date desc nulls last, t2.created_at desc limit 1
    ) t on true
   where (p_units is null or rm.unit_id = any(p_units))
     and b.resident_id is not null and b.status <> 'vacant'
  union all
  -- a booking's unpaid hold
  select h.bed_id, b.room_id, rm.unit_id, h.enquiry_id, null::uuid,
         coalesce(nullif(e.full_name, ''), 'someone'), coalesce(e.gender, ''),
         coalesce(h.start_date, e.move_in), coalesce(h.end_date, e.move_out), 'hold'
    from public.placement_holds h
    join public.beds b on b.id = h.bed_id
    join public.rooms rm on rm.id = b.room_id
    join public.enquiries e on e.id = h.enquiry_id
   where (p_units is null or rm.unit_id = any(p_units))
  union all
  -- a resident's room held for an Update Tenancy change
  select h.bed_id, b.room_id, rm.unit_id, null::uuid, h.resident_id,
         coalesce(nullif(r.full_name, ''), 'someone'), coalesce(r.gender, ''),
         h.start_date, h.end_date, 'move'
    from public.placement_holds h
    join public.beds b on b.id = h.bed_id
    join public.rooms rm on rm.id = b.room_id
    join public.residents r on r.id = h.resident_id
   where h.enquiry_id is null
     and (p_units is null or rm.unit_id = any(p_units))
  union all
  -- a hand-made hold with nobody behind it: taken until released
  select b.id, b.room_id, rm.unit_id, null::uuid, null::uuid,
         coalesce(nullif(b.hold_for, ''), 'a hold'), '', null::date, null::date, 'manual'
    from public.beds b
    join public.rooms rm on rm.id = b.room_id
   where (p_units is null or rm.unit_id = any(p_units))
     and b.status = 'held' and b.resident_id is null
     and coalesce(b.hold_for, '') <> 'Sold as single'
  union all
  -- a paid stay placed on a bed somebody else is the resident of: still to come
  -- (not one whose resident has already moved out of it)
  select b.id, b.room_id, rm.unit_id, t.enquiry_id, r.id, r.full_name, coalesce(r.gender, ''),
         t.start_date, least(t.end_date, t.leaving_on), 'tenancy'
    from public.tenancies t
    join public.beds b on b.id::text = t.bed_id
    join public.rooms rm on rm.id = b.room_id
    join public.residents r on r.id = t.resident_id
   where (p_units is null or rm.unit_id = any(p_units))
     and t.moved_out_on is null
     and coalesce(t.end_date, 'infinity'::date) >= current_date
     and lower(coalesce(r.status, '')) <> 'inactive'
     and b.resident_id is distinct from r.id
     and not exists (select 1 from public.beds o where o.resident_id = r.id and o.status <> 'vacant');
$$;

-- ---------------------------------------------------------------------------
-- Set (or clear, p_on null) the leaving date, as extend_stay does a longer
-- stay: under the unit's lock, and days given back to them (a later date, or
-- none) are checked against everybody else first - someone may already be
-- booked into them.
-- ---------------------------------------------------------------------------
create or replace function public.set_leaving_on(p_resident uuid, p_on date)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_t      record;
  v_bed    record;
  v_before date;
  v_after  date;
  v_on     date;
  v_err    text;
begin
  select * into v_t from public.tenancies where resident_id = p_resident
   order by start_date desc nulls last, created_at desc limit 1;
  if v_t.id is null then return jsonb_build_object('ok', false, 'error', 'This resident has no tenancy.'); end if;
  if v_t.moved_out_on is not null then
    return jsonb_build_object('ok', false, 'error', 'The room has been handed back already.');
  end if;
  if p_on is not null and v_t.start_date is not null and p_on < v_t.start_date then
    return jsonb_build_object('ok', false, 'error', 'The leaving date is before the tenancy starts.');
  end if;
  if p_on is not null and v_t.end_date is not null and p_on > v_t.end_date then
    return jsonb_build_object('ok', false, 'error',
      format('The leaving date is after the tenancy ends (%s). A later end is an Update Tenancy extension.', to_char(v_t.end_date, 'DD Mon YYYY')));
  end if;
  -- the end date itself is no early leaving: nothing to keep
  v_on := case when p_on = v_t.end_date then null else p_on end;

  select b.id, rm.unit_id into v_bed from public.beds b join public.rooms rm on rm.id = b.room_id
   where b.id::text = v_t.bed_id;
  if v_bed.id is not null then perform public.lock_units(array[v_bed.unit_id]); end if;

  -- their last day before and after: days given back are checked first
  v_before := least(v_t.end_date, v_t.leaving_on);
  v_after  := least(v_t.end_date, v_on);
  if v_bed.id is not null and v_before is not null and (v_after is null or v_after > v_before) then
    v_err := public.placement_conflict(v_bed.id, null, p_resident, v_before + 1, v_after,
                                       (select gender from public.residents where id = p_resident),
                                       coalesce(v_t.let_whole, false));
    if v_err is not null then
      return jsonb_build_object('ok', false, 'error',
        format('The room is taken from %s: %s Change that booking first.', to_char(v_before + 1, 'DD Mon YYYY'), v_err));
    end if;
  end if;
  update public.tenancies set leaving_on = v_on, updated_at = now() where id = v_t.id;
  return jsonb_build_object('ok', true, 'leavingOn', v_on);
end;
$$;

-- server only, as before
revoke execute on function public.placement_claims(uuid[]) from public, anon, authenticated;
grant execute on function public.placement_claims(uuid[]) to service_role;
revoke execute on function public.set_leaving_on(uuid, date) from public, anon, authenticated;
grant execute on function public.set_leaving_on(uuid, date) to service_role;

commit;

notify pgrst, 'reload schema';
