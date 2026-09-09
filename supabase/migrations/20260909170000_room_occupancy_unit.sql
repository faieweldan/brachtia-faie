-- ===========================================================================
-- A room is not "a single" or "a twin". It is a physical room that can be SOLD
-- three ways - as a single, or as Twin 1 + Twin 2 - and a whole unit can be
-- sold as one letting on top of that. Selling one way blocks the others.
--
-- The master list already records a whole-unit letting as Room "Unit", Bed
-- "Unit", so rooms.occupancy needs to accept that third value.
--
-- rooms.occupancy is now only a display default. The bed rows are the truth:
-- every ordinary room carries Single, Twin 1 and Twin 2.
-- ===========================================================================

alter table public.rooms drop constraint if exists rooms_occupancy_check;

alter table public.rooms
  add constraint rooms_occupancy_check
  check (occupancy in ('single', 'twin', 'unit'));
