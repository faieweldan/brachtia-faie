-- Undo 20261026100000_moved_out.sql: the three functions as they were before,
-- and move_out gone. tenancies.moved_out_on is kept (dropping it would lose who
-- moved out when); nothing reads it once the code is reverted too.
drop function if exists public.move_out(uuid, date);

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
