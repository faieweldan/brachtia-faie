-- ===========================================================================
-- Where a working applicant works, asked on the enquiry.
--
-- The enquiry form asks Student or Employed, and an employed applicant is now
-- asked for their company and what they do. Only `current_status` was added to
-- enquiries before this (2026-09-21); the two answers under it had nowhere to
-- go, so they were collected and dropped.
--
-- Empty is a real answer for company: somebody self-employed or freelancing has
-- no organisation to name, and the form lets them say so rather than inventing
-- one. Occupation is asked either way - "Freelance designer" says more than a
-- blank company ever would.
--
-- Safe to run again.
-- ===========================================================================

alter table public.enquiries
  add column if not exists company    text not null default '',
  add column if not exists occupation text not null default '';

comment on column public.enquiries.company is
  'Where they work, as given on the enquiry. Empty when self-employed or freelance.';
comment on column public.enquiries.occupation is
  'Their job title, as given on the enquiry. Asked of every employed applicant.';
