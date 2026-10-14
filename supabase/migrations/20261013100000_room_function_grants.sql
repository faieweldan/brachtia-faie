-- The server may run the room functions of 11 Oct 2026 (13 Oct 2026).
--
-- 20261011100000 and 20261011110000 closed free_sold_single,
-- placement_hold_left and sync_room_shapes to public, anon and authenticated,
-- but never opened them to service_role - the role the app's server uses.
-- So every booking that moved or released a hold failed at commit with
-- "permission denied for function free_sold_single" (the placement_holds
-- trigger calls it), and nothing was picked; saving a room type, residence or
-- unit failed the same way on sync_room_shapes.
--
-- Same rule as 20261009100000_dated_placement.sql: server only.
-- Safe to run twice.

do $$
declare f text;
begin
  foreach f in array array[
    'public.free_sold_single(uuid)',
    'public.placement_hold_left()',
    'public.sync_room_shapes(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
