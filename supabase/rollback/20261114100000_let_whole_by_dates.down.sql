-- Undo 20261114100000_let_whole_by_dates.sql: placement_conflict reads the
-- room's undated "Sold as single" mark again (as 20261009100000 made it), and
-- claim_let_whole is removed. No table was changed, so nothing else to undo.
-- Safe to run twice.

begin;

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

drop function if exists public.claim_let_whole(text, uuid, uuid, uuid, uuid, date);

commit;
