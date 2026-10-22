-- Moved out before the checkout is settled (Dani, 22 Oct 2026).
--
-- Leaving the room and settling the money are two steps. A resident who has
-- left (early termination: Adnaan, ST1-09-04, medical failed) can owe money for
-- weeks while the next student needs the room tomorrow. Before this, the bed
-- was freed only once the checkout statement was signed and paid.
--
--   tenancies.moved_out_on   the day they handed the room back. One fact, on
--                            the stay that ended. The tenancy keeps its dates
--                            and bed, so the statement and documents still say
--                            where they lived and for what term.
--
-- A moved-out stay claims no bed any more:
--   placement_claims       its 'tenancy' claim (a paid stay to come) is gone
--   seat_if_first          it is never seated again, and never waits ahead
--                          of the next resident
--   release_after_checkout it is never handed the bed back
--   move_out               new: the day is saved, the bed goes to whoever has
--                          it next (or is emptied), and rent billed for periods
--                          after the day is dropped - in one transaction
--
-- Needs 20261009100000_dated_placement.sql and 20261014100000_one_placement.sql.
-- Safe to run twice. Rollback: supabase/rollback/20261026100000_moved_out.down.sql

alter table public.tenancies add column if not exists moved_out_on date;

-- ---------------------------------------------------------------------------
-- 1. Every claim on a bed - as 20261014100000, and a moved-out stay has none.
-- ---------------------------------------------------------------------------
create or replace function public.placement_claims(p_units uuid[] default null)
returns table (bed_id uuid, room_id uuid, unit_id uuid, enquiry_id uuid, resident_id uuid,
               who text, gender text, starts date, ends date, source text)
language sql stable
set search_path = public
as $$
  -- the bed's resident: in it now, or first assigned - on their own tenancy's dates
  -- when it names this bed (the bed's copy only for a resident with no tenancy)
  select b.id, b.room_id, rm.unit_id, null::uuid, b.resident_id,
         coalesce(nullif(b.resident_name, ''), r.full_name, 'someone'),
         coalesce(nullif(r.gender, ''), b.gender, ''),
         coalesce(t.start_date, b.tenancy_start), coalesce(t.end_date, b.tenancy_end), 'resident'
    from public.beds b
    join public.rooms rm on rm.id = b.room_id
    left join public.residents r on r.id = b.resident_id
    left join lateral (
      select t2.start_date, t2.end_date from public.tenancies t2
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
         t.start_date, t.end_date, 'tenancy'
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
-- 2. Seat a paid stay - as 20261009100000; a moved-out stay is never seated,
--    and never counts as one waiting ahead of the next resident.
-- ---------------------------------------------------------------------------
create or replace function public.seat_if_first(p_bed uuid, p_tenancy uuid, p_keep text default null)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_t record;
  v_r record;
begin
  select * into v_t from public.tenancies where id = p_tenancy;
  if v_t.moved_out_on is not null then
    return false;
  end if;
  if exists (select 1 from public.beds where id = p_bed and resident_id is not null and resident_id <> v_t.resident_id) then
    return false;
  end if;
  if exists (select 1 from public.tenancies o join public.residents r on r.id = o.resident_id
              where o.bed_id = p_bed::text and o.id <> p_tenancy
                and o.moved_out_on is null
                and coalesce(o.end_date, 'infinity'::date) >= current_date
                and lower(coalesce(r.status, '')) <> 'inactive'
                and coalesce(o.start_date, '-infinity'::date) < coalesce(v_t.start_date, 'infinity'::date)) then
    return false;
  end if;
  select * into v_r from public.residents where id = v_t.resident_id;
  update public.beds set
    resident_id = v_r.id, resident_name = v_r.full_name, student_id = null,
    status = case when p_keep in ('active', 'notice') then p_keep else 'booked' end,
    hold_for = case when hold_for = 'Sold as single' then hold_for else null end, hold_until = null,
    gender = nullif(v_r.gender, ''), university = nullif(v_r.university, ''), nationality = nullif(v_r.nationality, ''),
    tenancy_start = v_t.start_date, tenancy_end = v_t.end_date,
    rent = (select i.monthly_rent from public.invoices i where i.enquiry_id = v_t.enquiry_id and i.status <> 'void'
             order by i.created_at desc limit 1)
   where id = p_bed;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. A resident leaves their bed - as 20261009100000; the next paid stay is
--    never one whose resident has moved out already.
-- ---------------------------------------------------------------------------
create or replace function public.release_after_checkout(p_resident uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_bed  record;
  v_t    record;
  v_out  jsonb := '[]'::jsonb;
  v_who  text;
begin
  for v_bed in
    select b.*, rm.unit_id from public.beds b join public.rooms rm on rm.id = b.room_id
     where b.resident_id = p_resident
  loop
    perform public.lock_units(array[v_bed.unit_id]);
    update public.tenancies set bed_id = v_bed.id::text, updated_at = now()
     where id = (select id from public.tenancies where resident_id = p_resident
                  order by start_date desc nulls last, created_at desc limit 1)
       and bed_id is null;
    perform public.empty_bed(v_bed.id);
    select t.* into v_t from public.tenancies t
      join public.residents r on r.id = t.resident_id
     where t.bed_id = v_bed.id::text and t.resident_id <> p_resident
       and t.moved_out_on is null
       and lower(coalesce(r.status, '')) <> 'inactive'
       and coalesce(t.end_date, 'infinity'::date) >= current_date
     order by t.start_date nulls last limit 1;
    v_who := null;
    if v_t.id is not null and public.seat_if_first(v_bed.id, v_t.id) then
      select full_name into v_who from public.residents where id = v_t.resident_id;
    end if;
    v_out := v_out || jsonb_build_object('bed', v_bed.id, 'next', v_who);
  end loop;
  return jsonb_build_object('ok', true, 'beds', v_out);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Moved out: the day is saved on their latest tenancy, the bed goes to
--    whoever has it next, and rent not yet billed for a period starting after
--    the day is dropped. The checkout statement stays open.
-- ---------------------------------------------------------------------------
create or replace function public.move_out(p_resident uuid, p_on date)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_t       record;
  v_dropped int;
  v_release jsonb;
begin
  if p_on is null then
    return jsonb_build_object('ok', false, 'error', 'Pick the day they moved out.');
  end if;
  select * into v_t from public.tenancies where resident_id = p_resident
   order by start_date desc nulls last, created_at desc limit 1
   for update;
  if v_t.id is null then
    return jsonb_build_object('ok', false, 'error', 'This resident has no tenancy to move out of.');
  end if;
  if v_t.start_date is not null and p_on < v_t.start_date then
    return jsonb_build_object('ok', false, 'error', 'The move-out day is before the tenancy starts.');
  end if;
  update public.tenancies set moved_out_on = p_on, updated_at = now() where id = v_t.id;
  -- rent for after they left: only invoices not billed yet (billed ones go on the statement)
  delete from public.invoices
   where tenancy_id = v_t.id and invoice_type = 'rental' and status = 'scheduled'
     and period_start > p_on;
  get diagnostics v_dropped = row_count;
  v_release := public.release_after_checkout(p_resident);
  return jsonb_build_object('ok', true, 'beds', v_release -> 'beds', 'rentDropped', v_dropped);
end;
$$;

-- server only: a new function is open to everyone until it is closed
do $$
declare f text;
begin
  foreach f in array array[
    'public.placement_claims(uuid[])',
    'public.seat_if_first(uuid, uuid, text)',
    'public.release_after_checkout(uuid)',
    'public.move_out(uuid, date)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
