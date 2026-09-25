-- ===========================================================================
-- Guesses staff have already waved away.
--
-- duplicate_of holds two different statements. The website writes one when an
-- enquiry arrives - "this looks like a repeat of that" - and staff write the
-- other when they close an enquiry as a duplicate. A guess and a decision.
--
-- Dismissing a pair on the bookings list wrote "not the same person" into
-- enquiry_not_duplicates and never touched duplicate_of, so the chip went and
-- the booking's own page carried on pointing at the other one. Staff dismissed
-- it and it stayed.
--
-- The guesses already dismissed are cleared here, so nobody has to say it a
-- second time. dismissDuplicate now clears the column as it writes the pair, so
-- this is the one-off for what came before it.
--
-- A booking CLOSED as a duplicate is left alone, whatever the pair says. That
-- is a decision a person made, and this has no business overruling it - it is
-- undone by reopening the booking, which clears the column properly.
--
-- Safe to run again.
-- ===========================================================================

update public.enquiries e
   set duplicate_of = null,
       updated_at = now()
 where e.duplicate_of is not null
   -- not a booking closed as a duplicate: that one is a decision, not a guess
   and not (e.status = 'closed' and e.close_reason = 'Duplicate')
   and exists (
     select 1
       from public.enquiry_not_duplicates nd
      where (nd.a_id = e.id and nd.b_id = e.duplicate_of)
         or (nd.b_id = e.id and nd.a_id = e.duplicate_of)
   );
