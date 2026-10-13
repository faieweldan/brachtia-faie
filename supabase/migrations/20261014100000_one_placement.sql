-- ===========================================================================
-- One placement system (Phase 2, 14 Oct 2026). Needs 20261009100000_dated_placement,
-- 20261011100000_sold_as_single_release and 20261013100000_room_function_grants.
--
-- Before this, Update Tenancy held a room its own way (beds.status = 'held' with a
-- text label, and a list in a storage file), so the booking room picker and
-- place_stay could not see it, and two residents could claim one bed for the same
-- dates. Now every claim on a bed lives in one of these, with its dates:
--   beds.resident_id      the person in the bed now (their tenancy has the dates)
--   placement_holds       an unpaid booking's room (enquiry_id), or a resident's
--                         room held for an Update Tenancy change (resident_id)
--   tenancies.bed_id      a paid stay, now or to come; kept after a move as history
--
-- New:
--   placement_holds.resident_id   a hold for a resident, beside a booking's
--   placement_holds_no_overlap    two holds on one bed can never overlap in dates
--   placement_claims(units)       every claim, with dates - the ONE list that the
--                                 database rule and every screen read
--   unit_claims(unit)             now reads placement_claims (same columns as before)
--   place_stay(... p_start, p_end, p_later)
--                                 p_later: hold the bed for a resident from p_start
--                                 (Update Tenancy) instead of moving them now
--   release_hold(enquiry, resident, bed)
--                                 let go of one booking's or one resident's hold
--   release_hand_hold(bed)        Homes Release on a bed held by hand, nobody behind it
--   resident_placements(residents)
--                                 where each resident is - the ONE lookup every
--                                 screen and document reads
--
-- Safe to run twice. Nothing here moves, removes or rewrites a placement.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. A hold for a resident (Update Tenancy), beside a booking's hold
-- ---------------------------------------------------------------------------
alter table public.placement_holds
  add column if not exists resident_id uuid references public.residents(id) on delete cascade;
alter table public.placement_holds alter column enquiry_id drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'placement_holds_owner') then
    alter table public.placement_holds
      add constraint placement_holds_owner check (enquiry_id is not null or resident_id is not null);
  end if;
end $$;
create index if not exists placement_holds_resident_idx on public.placement_holds (resident_id);

-- where a stay moved from and to: the tenancy names only its bed now, so a move
-- would otherwise lose the room they were in (statements, history)
create table if not exists public.placement_moves (
  id           uuid primary key default gen_random_uuid(),
  resident_id  uuid references public.residents(id) on delete cascade,
  tenancy_id   uuid references public.tenancies(id) on delete cascade,
  enquiry_id   uuid references public.enquiries(id) on delete set null,
  from_bed_id  uuid references public.beds(id) on delete set null,
  to_bed_id    uuid references public.beds(id) on delete set null,
  moved_on     date not null default current_date,
  created_by   text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists placement_moves_resident_idx on public.placement_moves (resident_id, moved_on);
alter table public.placement_moves enable row level security;
grant all on public.placement_moves to service_role;

-- a stay's dates as a range; no date = forever, and dates the wrong way round are
-- read the right way round rather than failing
create or replace function public.stay_range(p_start date, p_end date)
returns daterange
language sql immutable
set search_path = public
as $$
  select case when p_start is not null and p_end is not null and p_end < p_start
              then daterange(p_end, p_start, '[]')
              else daterange(p_start, p_end, '[]') end
$$;

-- two holds on one bed never overlap - checked by the database itself, whatever wrote them
create extension if not exists btree_gist with schema extensions;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'placement_holds_no_overlap') then
    if exists (
      select 1 from public.placement_holds a
        join public.placement_holds b on b.bed_id = a.bed_id and b.id > a.id
       where public.stay_range(a.start_date, a.end_date) && public.stay_range(b.start_date, b.end_date)
    ) then
      raise notice 'placement_holds_no_overlap NOT added: two holds on one bed overlap. Release one, then run this file again.';
    else
      execute 'alter table public.placement_holds add constraint placement_holds_no_overlap
                 exclude using gist (bed_id with =, public.stay_range(start_date, end_date) with &&)';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Every claim on the units' beds, with dates. No start = from forever, no
--    end = to forever. p_units null = every unit.
--    source: resident (in the bed now), hold (a booking not paid), move (a
--    resident's Update Tenancy room), manual (held by hand), tenancy (a paid stay
--    to come on a bed somebody else is in)
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
  select b.id, b.room_id, rm.unit_id, t.enquiry_id, r.id, r.full_name, coalesce(r.gender, ''),
         t.start_date, t.end_date, 'tenancy'
    from public.tenancies t
    join public.beds b on b.id::text = t.bed_id
    join public.rooms rm on rm.id = b.room_id
    join public.residents r on r.id = t.resident_id
   where (p_units is null or rm.unit_id = any(p_units))
     and coalesce(t.end_date, 'infinity'::date) >= current_date
     and lower(coalesce(r.status, '')) <> 'inactive'
     and b.resident_id is distinct from r.id
     and not exists (select 1 from public.beds o where o.resident_id = r.id and o.status <> 'vacant');
$$;

-- the rule's own list (placement_conflict reads it) - the same claims, one unit
create or replace function public.unit_claims(p_unit uuid)
returns table (bed_id uuid, room_id uuid, enquiry_id uuid, resident_id uuid, who text, gender text, starts date, ends date)
language sql stable
set search_path = public
as $$
  select c.bed_id, c.room_id, c.enquiry_id, c.resident_id, c.who, c.gender, c.starts, c.ends
    from public.placement_claims(array[p_unit]) c
$$;

-- ---------------------------------------------------------------------------
-- 3. Let go of one hold: a booking's (p_enquiry), or a resident's (p_resident,
--    optionally only the one on p_bed). Nobody else's hold, and no bed row.
-- ---------------------------------------------------------------------------
create or replace function public.release_hold(p_enquiry uuid, p_resident uuid, p_bed uuid default null)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_units uuid[];
  v_n     integer;
begin
  if p_enquiry is null and p_resident is null then return 0; end if;
  select array_agg(distinct rm.unit_id) into v_units
    from public.placement_holds h join public.beds b on b.id = h.bed_id join public.rooms rm on rm.id = b.room_id
   where (p_enquiry is not null and h.enquiry_id = p_enquiry)
      or (p_enquiry is null and h.enquiry_id is null and h.resident_id = p_resident and (p_bed is null or h.bed_id = p_bed));
  perform public.lock_units(v_units);
  delete from public.placement_holds h
   where (p_enquiry is not null and h.enquiry_id = p_enquiry)
      or (p_enquiry is null and h.enquiry_id is null and h.resident_id = p_resident and (p_bed is null or h.bed_id = p_bed));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Homes Release on a bed held by hand (no resident, no booking behind it). A bed
-- somebody is in, or a booking or resident holds, is never touched here.
create or replace function public.release_hand_hold(p_bed uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_bed record;
begin
  select b.*, rm.unit_id into v_bed from public.beds b join public.rooms rm on rm.id = b.room_id where b.id = p_bed;
  if v_bed.id is null then return jsonb_build_object('ok', false, 'error', 'That bed no longer exists.'); end if;
  perform public.lock_units(array[v_bed.unit_id]);
  select * into v_bed from public.beds where id = p_bed;
  if v_bed.resident_id is not null then
    return jsonb_build_object('ok', false, 'error', 'Somebody is in this bed. To move them, Reserve another bed and pick them there.');
  end if;
  if v_bed.status <> 'held' or coalesce(v_bed.hold_for, '') = 'Sold as single' then
    return jsonb_build_object('ok', true, 'released', false);
  end if;
  update public.beds set status = 'vacant', hold_for = null, hold_until = null, enquiry_id = null where id = p_bed;
  perform public.free_sold_single(v_bed.room_id);
  return jsonb_build_object('ok', true, 'released', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. place_stay, extended. Reserve a bed for a stay, or move the stay:
--      unpaid booking      its hold is created or moved - no bed row changes
--      paid / resident     its tenancy's bed_id moves (the old bed keeps the
--                          history in the tenancy); they become the bed's
--                          resident only if nobody is and no earlier paid stay
--                          is waiting; their status (Occupied) goes with them
--      p_later (resident)  the bed is HELD for them from p_start to p_end (an
--                          Update Tenancy change) - nothing moves yet
--    p_start / p_end: the dates to check and hold; default the stay's own.
--    Every rule is checked again after the units are locked, so two admins
--    cannot both have the bed.
-- ---------------------------------------------------------------------------
drop function if exists public.place_stay(uuid, uuid, uuid, boolean, timestamptz, text);
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
      -- the next paid stay on the bed they left takes it
      perform public.seat_if_first(v_old.id, t.id)
         from public.tenancies t join public.residents r on r.id = t.resident_id
        where t.bed_id = v_old.id::text and t.resident_id <> v_res.id
          and coalesce(t.end_date, 'infinity'::date) >= current_date and lower(coalesce(r.status, '')) <> 'inactive'
        order by t.start_date nulls last limit 1;
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
-- 5. Where each resident is - the one answer every screen and document gives.
--      now   the bed they are the resident of; else their latest tenancy's bed
--            (still to come, or where they last lived); else their booking's hold
--      next  a room held for them for an Update Tenancy change, if any
--    via: seated (in it / first assigned) | tenancy | hold
-- ---------------------------------------------------------------------------
create or replace function public.resident_placements(p_residents uuid[] default null)
returns table (resident_id uuid, bed_id uuid, via text, enquiry_id uuid, starts date, ends date,
               next_bed_id uuid, next_start date, next_end date)
language sql stable
set search_path = public
as $$
  with r as (
    select x.id, x.enquiry_id, x.move_in from public.residents x
     where p_residents is null or x.id = any(p_residents)
  ),
  seated as (
    select distinct on (b.resident_id) b.resident_id, b.id, b.tenancy_start, b.tenancy_end
      from public.beds b join r on r.id = b.resident_id
     where b.status <> 'vacant'
     order by b.resident_id, b.updated_at desc
  ),
  latest as (
    select distinct on (t.resident_id) t.resident_id, t.enquiry_id, t.start_date, t.end_date,
           case when t.bed_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then t.bed_id::uuid end as bed_id
      from public.tenancies t join r on r.id = t.resident_id
     order by t.resident_id, t.start_date desc nulls last, t.created_at desc
  ),
  on_bed as (
    -- their tenancy on the seated bed, for its dates
    select distinct on (t.resident_id) t.resident_id, t.start_date, t.end_date
      from public.tenancies t join seated s on s.resident_id = t.resident_id and t.bed_id = s.id::text
     order by t.resident_id, t.start_date desc nulls last, t.created_at desc
  ),
  booking as (
    select distinct on (r.id) r.id as resident_id, h.bed_id, h.enquiry_id,
           coalesce(h.start_date, e.move_in) as start_date, coalesce(h.end_date, e.move_out) as end_date
      from r
      join public.enquiries e on e.id = r.enquiry_id or e.resident_id = r.id::text
      join public.placement_holds h on h.enquiry_id = e.id
     order by r.id, h.created_at desc
  ),
  moving as (
    select distinct on (h.resident_id) h.resident_id, h.bed_id, h.start_date, h.end_date
      from public.placement_holds h join r on r.id = h.resident_id
     where h.enquiry_id is null
     order by h.resident_id, h.start_date desc nulls last
  )
  select r.id,
         coalesce(s.id, l.bed_id, bk.bed_id),
         case when s.id is not null then 'seated' when l.bed_id is not null then 'tenancy'
              when bk.bed_id is not null then 'hold' end,
         coalesce(l.enquiry_id, bk.enquiry_id, r.enquiry_id),
         case when s.id is not null then coalesce(ob.start_date, s.tenancy_start)
              when l.bed_id is not null then l.start_date else bk.start_date end,
         case when s.id is not null then coalesce(ob.end_date, s.tenancy_end)
              when l.bed_id is not null then l.end_date else bk.end_date end,
         case when m.bed_id is distinct from coalesce(s.id, l.bed_id) then m.bed_id end,
         case when m.bed_id is distinct from coalesce(s.id, l.bed_id) then m.start_date end,
         case when m.bed_id is distinct from coalesce(s.id, l.bed_id) then m.end_date end
    from r
    left join seated s on s.resident_id = r.id
    left join on_bed ob on ob.resident_id = r.id
    left join latest l on l.resident_id = r.id
    left join booking bk on bk.resident_id = r.id
    left join moving m on m.resident_id = r.id
   where coalesce(s.id, l.bed_id, bk.bed_id) is not null;
$$;

-- ---------------------------------------------------------------------------
-- 6. Server only: a new function is open to everyone until it is closed
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.stay_range(date, date)',
    'public.placement_claims(uuid[])',
    'public.unit_claims(uuid)',
    'public.release_hold(uuid, uuid, uuid)',
    'public.release_hand_hold(uuid)',
    'public.place_stay(uuid, uuid, uuid, boolean, timestamptz, text, date, date, boolean)',
    'public.resident_placements(uuid[])'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
