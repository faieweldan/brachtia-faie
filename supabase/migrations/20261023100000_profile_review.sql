-- A submitted profile waits for admin review before the TA is made (Dani, 15 Oct 2026).
--
-- Pending review = submitted_at set, reviewed_at empty. Submitting again clears
-- reviewed_at, so changed answers are looked at again. Creating the document
-- pack only warns - it is not blocked.
--
-- Run after 20261022100000_credit_note_lines.sql.

alter table public.profile_links
  add column if not exists reviewed_at timestamptz;
