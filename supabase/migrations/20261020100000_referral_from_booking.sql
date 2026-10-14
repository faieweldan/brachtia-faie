-- "How did you hear about us?" - one answer (Dani, 14 Oct 2026).
--
-- The booking form asks it (enquiries.heard_about); the resident keeps it
-- (residents.referral_source). They were joined only by a copy made when the
-- resident was created, so a resident created before that copy existed was
-- left blank while their booking had the answer (UAT Faris). The app now reads
-- and writes the resident's answer once there is a resident; this fills in the
-- residents still blank from their booking - only answers on the form's list.
--
-- Safe to run more than once: it only fills blanks.

begin;

update public.residents r
   set referral_source = e.heard_about
  from public.enquiries e
 where coalesce(r.referral_source, '') = ''
   and coalesce(e.heard_about, '') in ('University', 'Google Search', 'Friend', 'Agent', 'Social Media', 'Other')
   and (e.id::text = r.enquiry_id::text or e.resident_id = r.id::text);

commit;
