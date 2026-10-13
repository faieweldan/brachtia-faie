# Database changes waiting to be run, and how to undo them

`docs/PENDING-ON-LOVABLE.md` is the full list, but `docs/` is not in Git. The
changes on this branch are recorded here too, so they travel with the code.

## 20261014100000_one_placement.sql - one room-placement system (14 Oct 2026)

- File: `supabase/migrations/20261014100000_one_placement.sql`. One transaction:
  it stops with an error, and keeps nothing, unless every guard is in place.
- Needs first: 20261009100000 (dated placement), 20261011100000, 20261013100000.
- If it stops with "placement_holds_no_overlap cannot be added": two holds on one
  bed overlap. Release one of them, then run the file again.
- Check afterwards: `select public.placement_guard_report();` - every value true,
  `overlapping_holds` 0.
- Undo: `supabase/rollback/20261014100000_one_placement.down.sql`, only together
  with reverting the Phase 2 code.

| Database | Status |
| --- | --- |
| test-bratchia (Dani) | not run yet |
| Lovable Cloud (Lav) | not run - only after the code is approved and pushed there |
