-- A closed booking holds no bed (Dani, 26 Oct 2026). Closing now releases the
-- booking's hold in advanceEnquiryStage; this lets go of the beds held by
-- bookings closed before that, through the same release_hold (under the unit's
-- lock). A closed booking with a payment is left for an admin to look at.
do $$
declare
  v_enquiry uuid;
begin
  for v_enquiry in
    select distinct h.enquiry_id
      from public.placement_holds h
      join public.enquiries e on e.id = h.enquiry_id
     where e.status = 'closed'
       and not exists (select 1 from public.payments p where p.enquiry_id = h.enquiry_id)
  loop
    perform public.release_hold(v_enquiry, null, null);
  end loop;
end $$;
