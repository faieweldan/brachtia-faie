-- A twin room let whole as one single, to a booking not paid yet (11 Oct 2026).
--
-- place_stay(p_whole) holds one bed and marks the other "Sold as single". When
-- that hold went - the booking released, or moved to another room - nothing
-- took the mark off, so the room stayed half-blocked with nobody in it.
-- Releasing a resident's bed already does it (empty_bed); this does the same
-- for a hold.
--
-- Run at commit, not at the delete: confirm_paid_placement deletes the hold
-- first and seats the resident after, and the mark must stay for them.
-- Needs 20261009100000_dated_placement.sql.

create or replace function public.free_sold_single(p_room uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  update public.beds s set status = 'vacant', hold_for = null, hold_until = null
   where s.room_id = p_room and s.hold_for = 'Sold as single'
     -- nobody in the room's other beds
     and not exists (select 1 from public.beds o where o.room_id = p_room and o.id <> s.id and o.resident_id is not null)
     -- no booking holding them
     and not exists (select 1 from public.placement_holds h join public.beds o on o.id = h.bed_id
                      where o.room_id = p_room and o.id <> s.id)
     -- and no paid stay still to come onto them
     and not exists (select 1 from public.tenancies t join public.beds o on o.id::text = t.bed_id
                      where o.room_id = p_room and o.id <> s.id
                        and coalesce(t.end_date, 'infinity'::date) >= current_date);
end;
$$;

create or replace function public.placement_hold_left()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_room uuid;
begin
  select room_id into v_room from public.beds where id = old.bed_id;
  if v_room is not null then perform public.free_sold_single(v_room); end if;
  return null;
end;
$$;

drop trigger if exists placement_hold_left on public.placement_holds;
create constraint trigger placement_hold_left
  after delete or update of bed_id on public.placement_holds
  deferrable initially deferred
  for each row execute function public.placement_hold_left();

revoke all on function public.free_sold_single(uuid) from public, anon, authenticated;
revoke all on function public.placement_hold_left() from public, anon, authenticated;
