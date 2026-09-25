-- ===========================================================================
-- Bookings a student's own link pulled back behind their money.
--
-- The viewing link stayed live after a student paid. Pressing "Request booking
-- invoice" on it set the stage again with nothing to stop it, so a booking
-- whose fee was banked - and whose resident had already been made from it -
-- landed back at Invoice requested. "View resident" then disappeared off a
-- booking that was holding their money.
--
-- The way in is closed (studentMayMoveStage, 2026-09-26). This puts back the
-- ones it already moved.
--
-- It only moves a booking FORWARD, to the stage its own invoice and payments
-- say it is at. A booking with no invoice is not this bug and is left alone,
-- and so is a closed one - closing is a decision somebody made.
--
-- These three lines are the same test syncBookingStage makes in TypeScript.
-- Stating a rule twice is how the two drift, so this is written as a one-off
-- repair of past rows rather than as anything the app will read: the rule lives
-- in booking-lifecycle.ts, and this file is history once it has run.
--
-- stage_changed_at is not rewritten. The stage is being corrected, not entered
-- again, and moving it would hide how long these have really been sitting.
--
-- Safe to run again: a booking already at the right stage matches nothing.
-- ===========================================================================

with paid as (
  select i.enquiry_id,
         coalesce(sum(p.amount), 0) as total
    from public.invoices i
    left join public.payments p on p.invoice_id = i.id
   where i.enquiry_id is not null
     and i.status not in ('void', 'scheduled')
   group by i.enquiry_id
)
update public.enquiries e
   set status = case
                  -- the booking fee in full, the same 500 as BOOKING_FEE
                  when paid.total + 0.005 >= 500 then 'booked'
                  when paid.total > 0            then 'awaiting_payment'
                  else                                'awaiting_fee'
                end,
       updated_at = now()
  from paid
 where paid.enquiry_id = e.id
   -- only the ones sitting behind their own invoice
   and e.status in ('open', 'room_reserved', 'viewing_scheduled', 'invoice_requested');
