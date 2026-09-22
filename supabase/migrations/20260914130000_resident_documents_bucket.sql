-- The private bucket for residents' files: passport / IC copies, offer letters,
-- and payment proofs.
--
-- It was made by hand on Lovable Cloud and never written down as a migration,
-- so any other project built from these files - test-bratchia included - had no
-- bucket, and every upload failed with "Bucket not found".
--
-- Private on purpose: these are identity documents and bank slips. Nothing reads
-- them except the server, with the service role, which needs no policy. A file is
-- only ever shown through a short-lived signed link.
--
-- Safe to run again, and safe on Lovable Cloud, where the bucket already exists.

insert into storage.buckets (id, name, public)
values ('resident-documents', 'resident-documents', false)
on conflict (id) do nothing;
