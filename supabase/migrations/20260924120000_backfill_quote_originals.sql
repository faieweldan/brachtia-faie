-- ===========================================================================
-- Give every booking that already has a quote its original.
--
-- Versions are recorded from now on wherever a quote is saved, but bookings
-- taken before that have only the one snapshot they were last left with. It is
-- entered as version 1 - the original - so the next admin change reads as /1
-- rather than looking like the first quote that ever existed.
--
-- It is not literally what the student first asked for on bookings that were
-- already edited; that quote was painted over before any of this existed and
-- cannot be recovered. It is the earliest one still in the system, which is
-- the honest baseline.
--
-- Only bookings with a real priced quote. Safe to run again: a booking that
-- already has a version is skipped.
-- ===========================================================================

insert into public.quote_versions
  (enquiry_id, version, reference, snapshot, total_upfront, monthly_rent, issued_as)
select
  e.id,
  1,
  coalesce(e.reference, ''),
  e.quote_snapshot,
  coalesce((e.quote_snapshot -> 'quote' ->> 'totalUpfront')::numeric, 0),
  coalesce((e.quote_snapshot -> 'quote' ->> 'monthlyAfter')::numeric, 0),
  'backfilled'
from public.enquiries e
where e.quote_snapshot ? 'quote'
  and e.quote_snapshot ? 'property'
  and not exists (
    select 1 from public.quote_versions v where v.enquiry_id = e.id
  );
