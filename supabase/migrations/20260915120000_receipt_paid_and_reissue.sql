-- ===========================================================================
-- Two records the payment brief asks for.
--
-- A receipt says how much had been paid on its invoice once this payment was
-- in (Paid to Date), not only what was left.
--
-- An invoice issued again after one was cancelled points at the one it
-- replaces, so the history reads: cancelled, then replaced by.
--
-- Safe to run again.
-- ===========================================================================

alter table public.receipts
  add column if not exists paid_to_date numeric;

alter table public.invoices
  add column if not exists replaces_invoice_id uuid
  references public.invoices(id) on delete set null;
