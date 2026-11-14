-- A room let whole is whole only for that stay's dates (Dani, 14 Nov 2026).
--
-- B-09-01 Room A: Shadab has it as a single to 21 Nov 2026 (Twin 1, with
-- Twin 2 marked "Sold as single"). Anas has Twin 2 from 23 Nov. His brother
-- Ahmed asked for Twin 1 from 23 Nov and was refused: "Anas has it".
--
-- placement_conflict read the room's "Sold as single" mark. The mark has no
-- dates, so it read "this room is whole, always", and any stay in the room
-- blocked the other bed - even a stay that starts after the single one ends.
-- Every other check here (same bed, whole unit, gender, taking a room whole)
-- already went by dates.
--
-- Now each stay answers for itself, from its own record (let_whole, since
-- 20261019100000): a stay blocks the other bed only when IT has the room let
-- whole, and only for its own dates. Only a resident with no tenancy on their
-- bed falls back to the mark - the old way, kept for them.
--
--   1. claim_let_whole: does this stay have the room whole?
--   2. placement_conflict uses it in place of the mark
--   3. a check that every room the mark protects today is still protected
--      for the stay that owns it. If not, the whole script is undone and the
--      rooms are named - nothing changes.
--
-- Nothing here writes to a table. The same rule is placementConflict in
-- src/lib/placement.ts. Safe to run again.

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'placement_holds' and column_name = 'let_whole')
     or not exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'tenancies' and column_name = 'let_whole') then
    raise exception 'This needs 20261019100000_let_whole.sql first. Nothing was changed.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Does this stay (one row of placement_claims) have the room let whole?
-- ---------------------------------------------------------------------------
create or replace function public.claim_let_whole(
  p_source text, p_bed uuid, p_room uuid, p_enquiry uuid, p_resident uuid, p_starts date
) returns boolean
language sql stable
set search_path = public
as $$
  select case p_source
    -- the bed's own resident: their latest tenancy on the bed - the one
    -- placement_claims takes their dates from. No tenancy: the mark on the
    -- room's other bed, as before.
    when 'resident' then coalesce(
      (select t.let_whole from public.tenancies t
        where t.resident_id = p_resident and t.bed_id = p_bed::text
        order by t.start_date desc nulls last, t.created_at desc limit 1),
      exists (select 1 from public.beds o
               where o.room_id = p_room and o.id <> p_bed and o.hold_for = 'Sold as single'))
    -- a booking's unpaid hold
    when 'hold' then coalesce(
      (select bool_or(h.let_whole) from public.placement_holds h
        where h.enquiry_id = p_enquiry and h.bed_id = p_bed), false)
    -- a resident's room held for an Update Tenancy change
    when 'move' then coalesce(
      (select bool_or(h.let_whole) from public.placement_holds h
        where h.enquiry_id is null and h.resident_id = p_resident and h.bed_id = p_bed), false)
    -- a paid stay still to come on a bed somebody else is in
    when 'tenancy' then coalesce(
      (select bool_or(t.let_whole) from public.tenancies t
        where t.resident_id = p_resident and t.bed_id = p_bed::text
          and t.start_date is not distinct from p_starts), false)
    -- a hand-made hold is one bed
    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- 2. placement_conflict: as in 20261009100000_dated_placement.sql, except the
--    room is whole only through a stay that overlaps and has it whole.
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

  for v_c in
    select c.*, rm.letter
      from public.placement_claims(array[v_bed.unit_id]) c
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
       or (v_c.room_id = v_bed.room_id
           and (p_whole or public.claim_let_whole(v_c.source, v_c.bed_id, v_c.room_id,
                                                  v_c.enquiry_id, v_c.resident_id, v_c.starts))) then
      return format('%s has it %s - %s.', v_c.who,
        coalesce(to_char(v_c.starts, 'DD Mon YYYY'), '…'), coalesce(to_char(v_c.ends, 'DD Mon YYYY'), '…'));
    end if;
  end loop;
  return null;
end;
$$;

-- server only, like every placement function
revoke execute on function public.claim_let_whole(text, uuid, uuid, uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.claim_let_whole(text, uuid, uuid, uuid, uuid, date) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Every room with a "Sold as single" mark and somebody on its OTHER bed
--    (in it now, or booked) must have at least one of those stays count as
--    whole. Otherwise that room's single would lose its protection - stop,
--    undo everything and name the rooms.
-- ---------------------------------------------------------------------------
do $$
declare v_rooms text;
begin
  select string_agg(distinct u.unit_no || ' Room ' || rm.letter, ', ') into v_rooms
    from public.beds m
    join public.rooms rm on rm.id = m.room_id
    join public.units u on u.id = rm.unit_id
   where m.hold_for = 'Sold as single'
     and exists (select 1 from public.placement_claims(array[rm.unit_id]) c
                  where c.room_id = m.room_id and c.bed_id <> m.id)
     and not exists (select 1 from public.placement_claims(array[rm.unit_id]) c
                      where c.room_id = m.room_id and c.bed_id <> m.id
                        and public.claim_let_whole(c.source, c.bed_id, c.room_id,
                                                   c.enquiry_id, c.resident_id, c.starts));
  if v_rooms is not null then
    raise exception 'Sold as single with no stay that has the room whole: %. Nothing was changed - send this message to Claude.', v_rooms;
  end if;
end $$;

commit;
