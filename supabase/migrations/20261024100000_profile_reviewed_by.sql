-- Who reviewed the submitted profile (Dani, 16 Oct 2026): a name from the
-- staff list, kept with reviewed_at. Submitting again clears both.
--
-- Run after 20261023100000_profile_review.sql.

alter table public.profile_links
  add column if not exists reviewed_by text;
