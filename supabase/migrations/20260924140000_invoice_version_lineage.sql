-- ===========================================================================
-- Invoice versions that survive a cancel and reissue.
--
-- Cancelling an invoice and raising it again makes a NEW invoice row, pointed
-- at the one it replaces. Numbering versions per row would start the count
-- over at that point, so an invoice cancelled once would show two separate
-- histories of one document, each calling itself the original.
--
-- Versions are numbered against the first invoice in the lineage instead - the
-- root - so a booking's invoice reads as one story however many times it was
-- reissued.
--
-- Schema only. The backfill that fills these rows is the migration after this
-- one, and has to be: Postgres checks a whole script before running any of it,
-- so an INSERT naming root_invoice_id in the same run as the ALTER that adds
-- it is refused for a column that does not exist yet.
--
-- Safe to run again.
-- ===========================================================================

alter table public.invoice_versions
  add column if not exists root_invoice_id uuid
  references public.invoices(id) on delete cascade;
