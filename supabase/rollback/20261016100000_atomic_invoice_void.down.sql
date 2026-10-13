-- ===========================================================================
-- Undo 20261016100000_atomic_invoice_void.sql - only together with reverting
-- the code of that commit. Not in supabase/migrations, so nothing runs it by
-- itself. It removes the three functions only: no invoice, payment or credit
-- is changed, and invoices already voided stay void.
-- ===========================================================================

begin;

drop function if exists public.void_invoice_if_unpaid(uuid, numeric);
drop function if exists public.void_unpaid_booking_invoices(uuid);
drop function if exists public.void_invoice_to_credit(uuid, uuid, text, text, text, text, boolean);

commit;
