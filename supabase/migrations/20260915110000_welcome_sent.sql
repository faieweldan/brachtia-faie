-- ===========================================================================
-- When the welcome message went to the student.
--
-- Once the booking fee is in and admin has created the resident, staff send the
-- welcome message with the Resident Form link. Copying it, or opening it in
-- WhatsApp, stamps the booking - until then its Next Action asks for it.
--
-- Safe to run again.
-- ===========================================================================

alter table public.enquiries
  add column if not exists welcome_sent_at timestamptz;
