-- ===========================================================================
-- Dated placement (Dani, 9 Oct 2026). Replaces 20261008100000_upcoming_placement,
-- which added beds.next_enquiry_id - safe on a database that ran it or not.
--
-- Who owns what:
--   beds.resident_id    the person in the bed now - or, once the last one has
--                       checked out, the first assigned (Booked until check-in)
--   beds.enquiry_id     an unpaid hold only - on an empty bed, or on a bed
--                       somebody still lives in, for after they leave. Kept on
--                       a bed whose resident is that same booking's resident
--   tenancies.bed_id    a paid placement, with its dates - several can follow
--                       one another on one bed, so there is no "next" column
--
-- Upcoming / Current / Former are never stored: they follow from these.
--
-- Every placement write is one of these functions, one transaction each, with
-- the units involved locked in a fixed order and every rule checked again
-- after the lock:
--   place_stay                reserve a bed for a booking or resident, or move them
--   confirm_paid_placement    booking fee paid: a hold on somebody else's bed
--                             becomes the tenancy's bed_id
--   release_after_checkout    the checked-out resident leaves; the next stay
--                             on that bed becomes its resident (Booked)
--   activate_at_checkin       the assigned resident arrives: Booked -> Active
--
-- Safe to run twice.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Undo next_enquiry_id, if 20261008100000 ran: a paid booking keeps its bed
--    through its tenancy; an unpaid one goes back to beds.enquiry_id.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'beds' and column_name = 'next_enquiry_id') then
    execute $q$
      update public.tenancies t set bed_id = b.id::text, updated_at = now()
        from public.beds b
       where b.next_enquiry_id = t.enquiry_id and t.bed_id is null
    $q$;
    execute $q$
      update public.beds b set enquiry_id = b.next_enquiry_id
       where b.next_enquiry_id is not null and b.enquiry_id is null
         and not exists (select 1 from public.tenancies t where t.enquiry_id = b.next_enquiry_id)
    $q$;
    alter table public.beds drop column next_enquiry_id;
  end if;
  alter table public.beds drop column if exists next_hold_for;
end $$;

drop function if exists public.place_booking(uuid, uuid, boolean, timestamptz);
drop function if exists public.placement_conflict(uuid, uuid, uuid, date, date, text, boolean);
drop function if exists public.unit_claims(uuid);
drop function if exists public.release_after_checkout(uuid);
drop function if exists public.activate_at_checkin(uuid);

-- ---------------------------------------------------------------------------
-- 2. Repair: a booking hold written over a resident who still lives in the
--    bed (status set to held, the occupant's details overwritten). Only where
--    the booking starts after the occupant's stay ends.
--      paid   -> the booking's tenancy takes the bed; the hold is cleared
--      unpaid -> the hold stays as an unpaid hold on an occupied bed
--    Either way the occupant's status and details come back. Nothing else -
--    invoices, payments, receipts, tenancies, IDs - is touched.
-- ---------------------------------------------------------------------------
with broken as (
  select b.id as bed_id, b.enquiry_id, t.id as tenancy_id
    from public.beds b
    join public.enquiries e on e.id = b.enquiry_id
    left join public.tenancies t on t.enquiry_id = e.id
   where b.resident_id is not null
     and coalesce(nullif(e.resident_id, ''), '') <> b.resident_id::text
     and coalesce(t.resident_id, '00000000-0000-0000-0000-000000000000'::uuid) <> b.resident_id
     and b.tenancy_end is not null
     and coalesce(t.start_date, e.move_in) > b.tenancy_end
)
update public.tenancies t set bed_id = broken.bed_id::text, updated_at = now()
  from broken
 where t.id = broken.tenancy_id and t.bed_id is null;

update public.beds b
   set enquiry_id  = case when exists (select 1 from public.tenancies t where t.enquiry_id = b.enquiry_id) then null else b.enquiry_id end,
       hold_for    = null,
       hold_until  = case when exists (select 1 from public.tenancies t where t.enquiry_id = b.enquiry_id) then null else b.hold_until end,
       status      = case when b.status = 'held'
                          then case when coalesce(b.tenancy_start, current_date) <= current_date then 'active' else 'booked' end
                          else b.status end,
       gender      = coalesce(nullif(r.gender, ''), b.gender),
       university  = coalesce(nullif(r.university, ''), b.university),
       nationality = coalesce(nullif(r.nationality, ''), b.nationality)
  from public.enquiries e, public.residents r
 where e.id = b.enquiry_id
   and r.id = b.resident_id
   and coalesce(nullif(e.resident_id, ''), '') <> b.resident_id::text
   and not exists (select 1 from public.tenancies t where t.enquiry_id = e.id and t.resident_id = b.resident_id)
   and b.tenancy_end is not null
   and coalesce((select t.start_date from public.tenancies t where t.enquiry_id = e.id), e.move_in) > b.tenancy_end;

-- ---------------------------------------------------------------------------
-- 3. Everyone with a claim on a unit, with dates. No start = from forever,
--    no end = to forever.
-- ---------------------------------------------------------------------------
create or replace function public.unit_claims(p_unit uuid)
returns table (bed_id uuid, room_id uuid, enquiry_id uuid, resident_id uuid, who text, gender text, starts date, ends date)
language sql stable
set search_path = public
as $$
  -- the bed's resident (in it now, or first assigned)
  select b.id, b.room_id, b.enquiry_id, b.resident_id,
         coalesce(nullif(b.resident_name, ''), r.full_name, 'someone'),
         coalesce(nullif(r.gender, ''), b.gender, ''),
         b.tenancy_start, b.tenancy_end
    from public.beds b
    join public.rooms rm on rm.id = b.room_id
    left join public.residents r on r.id = b.resident_id
   where rm.unit_id = p_unit and b.resident_id is not null and b.status <> 'vacant'
  union all
  -- an unpaid hold: on an empty bed, or on a bed somebody else still lives in
  select b.id, b.room_id, e.id, null::uuid,
         coalesce(nullif(e.full_name, ''), b.hold_for, 'someone'),
         coalesce(e.gender, b.gender, ''),
         e.move_in, e.move_out
    from public.beds b
    join public.rooms rm on rm.id = b.room_id
    join public.enquiries e on e.id = b.enquiry_id
   where rm.unit_id = p_unit
     and b.resident_id is null
     and b.status <> 'vacant'
  union all
  select b.id, b.room_id, e.id, null::uuid,
         coalesce(nullif(e.full_name, ''), 'someone'),
         coalesce(e.gender, ''),
         e.move_in, e.move_out
    from public.beds b
    join public.rooms rm on rm.id = b.room_id
    join public.enquiries e on e.id = b.enquiry_id
   where rm.unit_id = p_unit
     and b.resident_id is not null
     and not exists (select 1 from public.residents r where r.id = b.resident_id
                       and (r.enquiry_id = e.id or r.id::text = e.resident_id))
  union all
  -- a hand-made hold with nobody behind it: taken until released
  select b.id, b.room_id, null::uuid, null::uuid, coalesce(nullif(b.hold_for, ''), 'a hold'), '', null::date, null::date
    from public.beds b
    join public.rooms rm on rm.id = b.room_id
   where rm.unit_id = p_unit and b.status = 'held' and b.resident_id is null and b.enquiry_id is null
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
     and not exists (select 1 from public.beds o where o.resident_id = r.id and o.status in ('active', 'notice'));
$$;

-- ---------------------------------------------------------------------------
-- 4. What stops a stay taking a bed, or null. Same rules as placementConflict
--    in src/lib/placement.ts.
-- ---------------------------------------------------------------------------
create or replace function public.placement_conflict(
  p_bed uuid, p_enquiry uuid, p_resident uuid, p_start date, p_end date, p_gender text, p_whole boolean
) returns text
language plpgsql stable
set search_path = public
as $$
declare
  v_bed  record;
  v_unit record;
  v_c    record;
  v_g    text := upper(left(coalesce(p_gender, ''), 1));
  v_sold boolean;
begin
  select b.*, rm.unit_id, rm.letter into v_bed
    from public.beds b join public.rooms rm on rm.id = b.room_id where b.id = p_bed;
  if not found then return 'That bed no longer exists.'; end if;
  select * into v_unit from public.units where id = v_bed.unit_id;
  if v_unit.deactivated_at is not null then return 'This unit is out of service.'; end if;
  if v_g in ('M', 'F') and upper(left(coalesce(v_unit.gender, ''), 1)) in ('M', 'F')
     and upper(left(v_unit.gender, 1)) <> v_g then
    return format('This unit is kept for %s residents.', v_unit.gender);
  end if;
  select exists (select 1 from public.beds s where s.room_id = v_bed.room_id and s.hold_for = 'Sold as single') into v_sold;

  for v_c in
    select c.*, rm.letter
      from public.unit_claims(v_bed.unit_id) c
      join public.rooms rm on rm.id = c.room_id
     where coalesce(c.starts, '-infinity'::date) <= coalesce(p_end, 'infinity'::date)
       and coalesce(c.ends, 'infinity'::date) >= coalesce(p_start, '-infinity'::date)
       and (p_enquiry is null or c.enquiry_id is distinct from p_enquiry)
       and (p_resident is null or c.resident_id is distinct from p_resident)
  loop
    if v_g in ('M', 'F') and upper(left(coalesce(v_c.gender, ''), 1)) in ('M', 'F')
       and upper(left(v_c.gender, 1)) <> v_g then
      return format('%s is in this unit %s - %s.', v_c.who,
        coalesce(to_char(v_c.starts, 'DD Mon YYYY'), '…'), coalesce(to_char(v_c.ends, 'DD Mon YYYY'), '…'));
    end if;
    if v_c.bed_id = p_bed or lower(v_bed.letter) = 'unit' or lower(v_c.letter) = 'unit'
       or (v_c.room_id = v_bed.room_id and (p_whole or v_sold)) then
      return format('%s has it %s - %s.', v_c.who,
        coalesce(to_char(v_c.starts, 'DD Mon YYYY'), '…'), coalesce(to_char(v_c.ends, 'DD Mon YYYY'), '…'));
    end if;
  end loop;
  return null;
end;
$$;

-- lock units in a fixed order, so two moves in opposite directions cannot deadlock
create or replace function public.lock_units(p_units uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare v_u uuid;
begin
  for v_u in select distinct u from unnest(p_units) u where u is not null order by u loop
    perform pg_advisory_xact_lock(hashtext('unit:' || v_u::text));
  end loop;
end;
$$;

-- empty a bed, and the other bed of a room it had whole once nobody is left in it
create or replace function public.empty_bed(p_bed uuid)
returns void
language plpgsql
set search_path = public
as $$
declare v_room uuid;
begin
  update public.beds set
    status = 'vacant', resident_id = null, resident_name = null, student_id = null, university = null,
    nationality = null, gender = null, hold_for = null, hold_until = null, enquiry_id = null,
    tenancy_start = null, tenancy_end = null, rent = null
   where id = p_bed returning room_id into v_room;
  update public.beds s set status = 'vacant', hold_for = null, hold_until = null
   where s.room_id = v_room and s.hold_for = 'Sold as single'
     and not exists (select 1 from public.beds o where o.room_id = v_room and o.id <> s.id
                      and (o.resident_id is not null or o.enquiry_id is not null));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Reserve a bed for a stay, or move the stay. A booking (p_enquiry), a
--    resident with no booking (p_resident), or both.
-- ---------------------------------------------------------------------------
create or replace function public.place_stay(
  p_enquiry uuid, p_resident uuid, p_bed uuid, p_whole boolean default false, p_hold_until timestamptz default null
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
  v_now    boolean;
  v_old    record;
  v_units  uuid[];
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

  -- the units it leaves and the one it goes to, locked in one fixed order
  select array_agg(distinct rm.unit_id) into v_units
    from public.beds b join public.rooms rm on rm.id = b.room_id
   where b.id = p_bed
      or (p_enquiry is not null and b.enquiry_id = p_enquiry)
      or (v_res.id is not null and b.resident_id = v_res.id)
      or (v_t.bed_id is not null and b.id::text = v_t.bed_id);
  if not exists (select 1 from public.beds where id = p_bed) then
    return jsonb_build_object('ok', false, 'error', 'That bed no longer exists.');
  end if;
  perform public.lock_units(v_units);

  v_err := public.placement_conflict(p_bed, p_enquiry, v_res.id, v_start, v_end,
                                     coalesce(nullif(v_res.gender, ''), v_e.gender), p_whole);
  if v_err is not null then
    return jsonb_build_object('ok', false, 'conflict', true,
      'error', 'This room was just reserved. Choose another room.', 'detail', v_err);
  end if;

  -- what they leave: their own bed is emptied; a hold of theirs on somebody else's bed only loses the hold
  for v_old in
    select b.* from public.beds b
     where b.id <> p_bed
       and ((p_enquiry is not null and b.enquiry_id = p_enquiry) or (v_res.id is not null and b.resident_id = v_res.id))
  loop
    if v_old.resident_id = v_res.id or v_old.resident_id is null then
      if v_old.resident_id = v_res.id then v_keep := v_old.status; end if;
      perform public.empty_bed(v_old.id);
    else
      update public.beds set enquiry_id = null, hold_until = null where id = v_old.id;
    end if;
  end loop;

  select * into v_bed from public.beds where id = p_bed;
  v_now := (v_bed.resident_id is null or v_bed.resident_id = v_res.id)
       and coalesce(v_bed.hold_for, '') <> 'Sold as single';

  if v_now then
    if v_bed.resident_id is null and v_bed.enquiry_id is not null and v_bed.enquiry_id is distinct from p_enquiry then
      return jsonb_build_object('ok', false, 'conflict', true,
        'error', 'This room was just reserved. Choose another room.', 'detail', 'Another booking holds this bed.');
    end if;
    update public.beds set
      enquiry_id    = p_enquiry,
      status        = case when v_keep in ('active', 'notice') then v_keep
                           when status in ('active', 'notice') and resident_id = v_res.id then status
                           when v_res.id is not null then 'booked' else 'held' end,
      resident_id   = v_res.id,
      resident_name = coalesce(v_res.full_name, v_e.full_name),
      hold_for      = case when v_res.id is null then v_e.full_name else null end,
      hold_until    = case when v_res.id is null then p_hold_until else null end,
      gender        = coalesce(nullif(v_res.gender, ''), nullif(v_e.gender, '')),
      university    = coalesce(nullif(v_res.university, ''), nullif(v_e.university, '')),
      nationality   = coalesce(nullif(v_res.nationality, ''), nullif(v_e.nationality, '')),
      tenancy_start = v_start,
      tenancy_end   = v_end,
      rent          = coalesce((select i.monthly_rent from public.invoices i
                                 where p_enquiry is not null and i.enquiry_id = p_enquiry and i.status <> 'void'
                                 order by i.created_at desc limit 1), rent)
     where id = p_bed;
  elsif v_res.id is null then
    -- unpaid, on a bed somebody still lives in: a hold for after they leave - one at a time
    if v_bed.enquiry_id is not null and v_bed.enquiry_id <> p_enquiry then
      return jsonb_build_object('ok', false, 'conflict', true,
        'error', 'This room was just reserved. Choose another room.', 'detail', 'Another booking holds this bed.');
    end if;
    update public.beds set enquiry_id = p_enquiry, hold_until = p_hold_until where id = p_bed;
  end if;
  -- paid, on a bed somebody still lives in: the tenancy below is the whole placement

  if p_whole then
    update public.beds s set status = 'held', hold_for = 'Sold as single', hold_until = null
     where s.room_id = v_bed.room_id and s.id <> p_bed and s.status = 'vacant'
       and s.resident_id is null and s.enquiry_id is null;
  end if;

  if v_t.id is not null then
    update public.tenancies set bed_id = p_bed::text, updated_at = now() where id = v_t.id;
  end if;

  return jsonb_build_object('ok', true, 'placed', case when v_now then 'now' else 'later' end);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Booking fee paid. A hold on a bed somebody else still lives in becomes
--    the tenancy's bed_id, and stops being an unpaid hold.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_paid_placement(p_enquiry uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_t   record;
  v_bed record;
begin
  select * into v_t from public.tenancies where enquiry_id = p_enquiry;
  if v_t.id is null then return jsonb_build_object('ok', false, 'error', 'No tenancy for this booking yet.'); end if;
  select b.*, rm.unit_id into v_bed from public.beds b join public.rooms rm on rm.id = b.room_id
   where b.enquiry_id = p_enquiry and b.resident_id is not null and b.resident_id <> v_t.resident_id
   limit 1;
  if v_bed.id is null then return jsonb_build_object('ok', true, 'moved', false); end if;
  perform public.lock_units(array[v_bed.unit_id]);
  update public.tenancies set bed_id = v_bed.id::text, updated_at = now() where id = v_t.id and bed_id is null;
  update public.beds set enquiry_id = null, hold_until = null where id = v_bed.id and enquiry_id = p_enquiry;
  return jsonb_build_object('ok', true, 'moved', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. A checked-out resident leaves. The stay that comes next on that bed - a
--    paid tenancy, or else an unpaid hold - becomes the bed's own, Booked or
--    Reserved, never Occupied. Their own tenancy keeps the bed, so their
--    statement still says where they lived.
-- ---------------------------------------------------------------------------
create or replace function public.release_after_checkout(p_resident uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_bed  record;
  v_t    record;
  v_r    record;
  v_e    record;
  v_out  jsonb := '[]'::jsonb;
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

    select t.* into v_t from public.tenancies t
      join public.residents r on r.id = t.resident_id
     where t.bed_id = v_bed.id::text and t.resident_id <> p_resident
       and lower(coalesce(r.status, '')) <> 'inactive'
       and coalesce(t.end_date, 'infinity'::date) >= current_date
     order by t.start_date nulls last limit 1;
    select * into v_e from public.enquiries where id = coalesce(v_t.enquiry_id, v_bed.enquiry_id);

    if v_t.id is not null then
      select * into v_r from public.residents where id = v_t.resident_id;
      update public.beds set
        resident_id = v_r.id, resident_name = v_r.full_name, student_id = null, status = 'booked',
        enquiry_id = v_t.enquiry_id, hold_for = null, hold_until = null,
        gender = nullif(v_r.gender, ''), university = nullif(v_r.university, ''), nationality = nullif(v_r.nationality, ''),
        tenancy_start = v_t.start_date, tenancy_end = v_t.end_date,
        rent = (select i.monthly_rent from public.invoices i where i.enquiry_id = v_t.enquiry_id and i.status <> 'void'
                 order by i.created_at desc limit 1)
       where id = v_bed.id;
      v_out := v_out || jsonb_build_object('bed', v_bed.id, 'next', v_r.full_name, 'as', 'booked');
    elsif v_bed.enquiry_id is not null and v_e.id is not null then
      update public.beds set
        resident_id = null, resident_name = null, student_id = null, status = 'held',
        hold_for = v_e.full_name, gender = nullif(v_e.gender, ''), university = nullif(v_e.university, ''),
        nationality = nullif(v_e.nationality, ''), tenancy_start = v_e.move_in, tenancy_end = v_e.move_out, rent = null
       where id = v_bed.id;
      v_out := v_out || jsonb_build_object('bed', v_bed.id, 'next', v_e.full_name, 'as', 'reserved');
    else
      perform public.empty_bed(v_bed.id);
      v_out := v_out || jsonb_build_object('bed', v_bed.id, 'next', null);
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'beds', v_out);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Checked in: Booked -> Active. Refused while the bed is still somebody else's.
-- ---------------------------------------------------------------------------
create or replace function public.activate_at_checkin(p_resident uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_n   int;
  v_who text;
begin
  update public.beds set status = 'active', hold_for = null, hold_until = null
   where resident_id = p_resident and status in ('held', 'booked');
  get diagnostics v_n = row_count;
  if v_n > 0 then return jsonb_build_object('ok', true, 'activated', v_n); end if;
  if exists (select 1 from public.beds where resident_id = p_resident and status in ('active', 'notice')) then
    return jsonb_build_object('ok', true, 'activated', 0);
  end if;
  select coalesce(b.resident_name, 'The current resident') into v_who
    from public.tenancies t join public.beds b on b.id::text = t.bed_id
   where t.resident_id = p_resident and b.resident_id is distinct from p_resident
   order by t.start_date desc nulls last limit 1;
  return jsonb_build_object('ok', false, 'error',
    case when v_who is not null
         then format('%s has not checked out of this room yet. Complete their checkout first.', v_who)
         else 'This resident has no room assigned.' end);
end;
$$;

-- server only: a new function is open to everyone until it is closed
do $$
declare f text;
begin
  foreach f in array array[
    'public.unit_claims(uuid)',
    'public.placement_conflict(uuid, uuid, uuid, date, date, text, boolean)',
    'public.lock_units(uuid[])',
    'public.empty_bed(uuid)',
    'public.place_stay(uuid, uuid, uuid, boolean, timestamptz)',
    'public.confirm_paid_placement(uuid)',
    'public.release_after_checkout(uuid)',
    'public.activate_at_checkin(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
