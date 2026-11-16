-- Undo 20261116100000_leaving_on.sql: placement_claims goes back to the
-- tenancy's end date only (as 20261026100000_moved_out.sql made it), and the
-- leaving_on column and set_leaving_on are dropped - every planned leaving
-- date is lost.
-- Safe to run twice.

begin;

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

revoke execute on function public.placement_claims(uuid[]) from public, anon, authenticated;
grant execute on function public.placement_claims(uuid[]) to service_role;

drop function if exists public.set_leaving_on(uuid, date);
alter table public.tenancies drop column if exists leaving_on;

commit;

notify pgrst, 'reload schema';
