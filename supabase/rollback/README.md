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

## 20261015100000_atomic_payments.sql - payments and account credit in one step (15 Oct 2026)

- File: `supabase/migrations/20261015100000_atomic_payments.sql`. One transaction:
  it stops with an error, and keeps nothing, unless every step is in place.
- Needs first: nothing new. It can run before or after 20261014100000.
- Run it **before** the code of this commit is deployed: the new code reads
  account credit from the database only, and fails (it never falls back to the
  old Storage files) until the migration is in.
- If it stops with "payment(s) have more than one receipt": the message gives
  the query that lists them. Decide with Brachtia which receipt stands; nothing
  is deleted by the migration.
- Old account credit: each resident's `account-credit/<id>.json` is read into
  `account_credit_entries` the first time their credit is used or shown, once
  (`account_credit_imports` records it). The files are not changed or removed.
- Check afterwards: `select count(*) from public.account_credit_imports;` grows as
  residents are opened; `select * from public.account_credit_entries where source = 'legacy_json';`
  matches the old files.
- Undo: `supabase/rollback/20261015100000_atomic_payments.down.sql`, only together
  with reverting this commit's code. It keeps the ledger and the request keys.

| Database | Status |
| --- | --- |
| test-bratchia (Dani) | not run yet |
| Lovable Cloud (Lav) | not run - only after the code is approved and pushed there |
