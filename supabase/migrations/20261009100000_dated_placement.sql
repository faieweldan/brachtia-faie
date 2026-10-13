-- ===========================================================================
-- Dated placement (Dani, 9-10 Oct 2026). Replaces 20261008100000_upcoming_placement,
-- which added beds.next_enquiry_id - safe on a database that ran it or not.
--
-- Who owns what - each placement lives in exactly one place:
--   beds.resident_id       the person in the bed now - or, once the last one has
--                          checked out, the first assigned (Booked until check-in)
--   placement_holds        an unpaid booking's room and dates. A bed can have
--                          several, one after another, as long as their dates do
--                          not overlap. One per booking.
--   tenancies.bed_id       a paid placement, with its dates. Several can follow
--                          one another on one bed.
--   beds.enquiry_id        no longer written: its holds move to placement_holds
--
-- Upcoming / Current / Former are never stored: they follow from these.
--
-- Every placement write is one of these functions, one transaction each, with
-- the units involved locked in a fixed order and every rule checked again
-- after the lock:
--   place_stay                reserve a bed for a booking or resident, or move them
--   confirm_paid_placement    booking fee paid: the booking's hold becomes its
--                             tenancy's bed_id, and the hold is removed
--   release_after_checkout    the checked-out resident leaves; the next paid stay
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
-- 2b. A resident moved in the browser before this existed: their bed changed,
--     their tenancy did not. The bed they are the resident of is where they
--     are; their latest tenancy is made to say so, and the bed takes the
--     tenancy's dates where it has none.
-- ---------------------------------------------------------------------------
update public.tenancies t set bed_id = b.id::text, updated_at = now()
  from public.beds b
 where b.resident_id = t.resident_id
   and b.status <> 'vacant'
   and t.id = (select t2.id from public.tenancies t2 where t2.resident_id = t.resident_id
                order by t2.start_date desc nulls last, t2.created_at desc limit 1)
   and t.bed_id is distinct from b.id::text;

update public.beds b
   set tenancy_start = coalesce(b.tenancy_start, t.start_date),
       tenancy_end   = coalesce(b.tenancy_end, t.end_date)
  from public.tenancies t
 where t.bed_id = b.id::text and t.resident_id = b.resident_id
   and (b.tenancy_start is null or b.tenancy_end is null);

-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- 3. Unpaid holds, with dates. Existing ones move here from beds.enquiry_id.
-- ---------------------------------------------------------------------------
create table if not exists public.placement_holds (
  id          uuid primary key default gen_random_uuid(),
  enquiry_id  uuid not null unique references public.enquiries(id) on delete cascade,
  bed_id      uuid not null references public.beds(id) on delete cascade,
  start_date  date,
  end_date    date,
  hold_until  timestamptz,
  created_by  text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists placement_holds_bed_idx on public.placement_holds (bed_id);
alter table public.placement_holds enable row level security;
grant all on public.placement_holds to service_role;

-- a booking not paid yet: its hold, with the booking's dates
insert into public.placement_holds (enquiry_id, bed_id, start_date, end_date, hold_until)
select distinct on (b.enquiry_id) b.enquiry_id, b.id, e.move_in, e.move_out, b.hold_until
  from public.beds b
  join public.enquiries e on e.id = b.enquiry_id
 where not exists (select 1 from public.tenancies t where t.enquiry_id = b.enquiry_id)
   and (b.resident_id is null or b.status in ('held', 'booked', 'active', 'notice'))
 order by b.enquiry_id, b.updated_at desc
on conflict (enquiry_id) do nothing;

-- a paid one: its tenancy names the bed, if it did not already
update public.tenancies t set bed_id = b.id::text, updated_at = now()
  from public.beds b
 where b.enquiry_id = t.enquiry_id and t.bed_id is null;

-- an empty bed that only held a booking is empty again; the hold says the rest
update public.beds
   set status = 'vacant', hold_for = null, hold_until = null, resident_name = null,
       student_id = null, university = null, nationality = null, gender = null,
       tenancy_start = null, tenancy_end = null
 where enquiry_id is not null and resident_id is null and status = 'held'
   and coalesce(hold_for, '') <> 'Sold as single';
update public.beds set enquiry_id = null where enquiry_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Everyone with a claim on a unit, with dates. No start = from forever,
--    no end = to forever.
-- ---------------------------------------------------------------------------
drop function if exists public.unit_claims(uuid);
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

-- ---------------------------------------------------------------------------
-- 5. What stops a stay taking a bed, or null. Same rules as placementConflict
--    in src/lib/placement.ts. Only dates that overlap ever stop it.
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
  -- read as json: a database without the unit-deactivation column still answers
  if to_jsonb(v_unit) ->> 'deactivated_at' is not null then return 'This unit is out of service.'; end if;
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
     and not exists (select 1 from public.beds o where o.room_id = v_room and o.id <> s.id and o.resident_id is not null)
     and not exists (select 1 from public.placement_holds h join public.beds o on o.id = h.bed_id
                      where o.room_id = v_room and o.id <> s.id);
end;
$$;

-- make a paid stay the bed's own resident when nobody is and no earlier paid stay is waiting
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
  if exists (select 1 from public.beds where id = p_bed and resident_id is not null and resident_id <> v_t.resident_id) then
    return false;
  end if;
  if exists (select 1 from public.tenancies o join public.residents r on r.id = o.resident_id
              where o.bed_id = p_bed::text and o.id <> p_tenancy
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
-- 6. Reserve a bed for a stay, or move the stay. A booking (p_enquiry), a
--    resident with no booking (p_resident), or both.
--      unpaid  its hold is created or moved - nothing on any bed row changes
--      paid    its tenancy's bed_id moves; it becomes the bed's resident only
--              if nobody is and no earlier paid stay is waiting
-- ---------------------------------------------------------------------------
drop function if exists public.place_stay(uuid, uuid, uuid, boolean, timestamptz);
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

-- ---------------------------------------------------------------------------
-- 7. Booking fee paid: the hold becomes the tenancy's bed_id and is removed.
--    The bed takes them as its resident only when nobody is and no earlier
--    paid stay is waiting.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_paid_placement(p_enquiry uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_t    record;
  v_h    record;
  v_unit uuid;
  v_now  boolean := false;
begin
  select * into v_t from public.tenancies where enquiry_id = p_enquiry;
  if v_t.id is null then return jsonb_build_object('ok', false, 'error', 'No tenancy for this booking yet.'); end if;
  select * into v_h from public.placement_holds where enquiry_id = p_enquiry;
  if v_h.id is null then
    -- no hold (placed before holds existed, or already converted): seat on its bed if it can be
    if v_t.bed_id is not null then v_now := public.seat_if_first(v_t.bed_id::uuid, v_t.id); end if;
    return jsonb_build_object('ok', true, 'moved', false, 'seated', v_now);
  end if;
  select rm.unit_id into v_unit from public.beds b join public.rooms rm on rm.id = b.room_id where b.id = v_h.bed_id;
  perform public.lock_units(array[v_unit]);
  update public.tenancies set bed_id = v_h.bed_id::text, updated_at = now() where id = v_t.id;
  delete from public.placement_holds where id = v_h.id;
  v_now := public.seat_if_first(v_h.bed_id, v_t.id);
  return jsonb_build_object('ok', true, 'moved', true, 'seated', v_now);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. A checked-out resident leaves. The next paid stay on that bed becomes
--    its resident - Booked, never Occupied. Unpaid holds stay holds. Their own
--    tenancy keeps the bed, so their statement still says where they lived.
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
-- 9. Checked in: Booked -> Active. Refused while the bed is still somebody else's.
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
    'public.seat_if_first(uuid, uuid, text)',
    'public.place_stay(uuid, uuid, uuid, boolean, timestamptz, text)',
    'public.confirm_paid_placement(uuid)',
    'public.release_after_checkout(uuid)',
    'public.activate_at_checkin(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
