-- A paid booking keeps "sold as single" (Dani, 3 Nov 2026).
--
-- A booking's room is a placement_hold until it is paid. On payment,
-- confirm_paid_placement moves the hold onto the tenancy and deletes the hold.
-- It was written on 9 Oct, before let_whole existed (19 Oct), so it copied the
-- bed and dropped let_whole: the tenancy kept its default false. The other
-- bed's "Sold as single" mark stayed, so Room assignment read Single while the
-- tenancy agreement, which reads the tenancy first, printed Twin Sharing
-- (Krizia, A-25-05 Room B). See docs/MISTAKES-TO-AVOID.md: one fact, one place.
--
--   1. confirm_paid_placement copies let_whole with the bed
--   2. the tenancies already converted are filled in from today's marks
--
-- Safe to run again.

begin;

-- 1. The hold's let_whole goes onto the tenancy in the same step as its bed.
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
  update public.tenancies set bed_id = v_h.bed_id::text, let_whole = v_h.let_whole, updated_at = now() where id = v_t.id;
  delete from public.placement_holds where id = v_h.id;
  v_now := public.seat_if_first(v_h.bed_id, v_t.id);
  return jsonb_build_object('ok', true, 'moved', true, 'seated', v_now);
end;
$$;

revoke execute on function public.confirm_paid_placement(uuid) from public, anon, authenticated;
grant execute on function public.confirm_paid_placement(uuid) to service_role;

-- 2. Tenancies already converted: a twin room whose other bed is Sold as single.
update public.tenancies t set let_whole = true, updated_at = now()
  from public.beds b
 where t.bed_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and b.id = t.bed_id::uuid and not t.let_whole
   and exists (select 1 from public.beds o where o.room_id = b.room_id and o.id <> b.id and o.hold_for = 'Sold as single');

commit;
