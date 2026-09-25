-- Bookings the old behaviour filed as Awaiting payment without an invoice.
--
-- Pressing "Request booking invoice" on the viewing link set the booking to
-- awaiting_fee - the stage that means the invoice has gone out. So the bookings
-- list told staff to collect a booking fee against an invoice nobody had
-- raised, and Generate invoice never appeared for these bookings at all.
--
-- They move to the stage that is actually true of them: the student asked, and
-- it has not been raised yet.
--
-- Deliberately narrow. Only bookings carrying viewing_skipped_at are ones a
-- student put there through their own link, which is the case this bug created.
-- A booking a staff member moved to Awaiting payment by hand is their decision
-- and is left alone. Nothing with a live invoice is touched, whatever its stage:
-- an invoice exists, so Awaiting payment is correct.
--
-- stage_changed_at is not rewritten. The stage is being corrected, not entered
-- again, and moving the timestamp would restart the SLA clock and hide how long
-- these have really been waiting - which is the thing staff most need to see.

update public.enquiries e
   set status = 'invoice_requested',
       updated_at = now()
 where e.status = 'awaiting_fee'
   and e.viewing_skipped_at is not null
   and not exists (
     select 1
       from public.invoices i
      where i.enquiry_id = e.id
        and i.status not in ('void', 'scheduled')
   );
