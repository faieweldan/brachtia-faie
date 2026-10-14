-- ===========================================================================
-- Undo 20261015100000_atomic_payments.sql - only together with reverting the
-- code of that commit. Not in supabase/migrations, so nothing runs it by itself.
--
-- Money history is kept: the account_credit_entries and account_credit_imports
-- tables, and payments.request_key, stay where they are. Credit given after
-- the move lives only in account_credit_entries - the old code reads the
-- Storage files, so before going back, export it:
--   select * from public.account_credit_entries where source = 'app';
-- and decide with Brachtia how it is carried back. Running the migration
-- again afterwards is safe: it adds only what is missing.
-- ===========================================================================

begin;

drop function if exists public.apply_account_credit(uuid, uuid, boolean, date);
drop function if exists public.import_legacy_account_credit(uuid, jsonb);
drop function if exists public.grant_account_credit(uuid, jsonb);
drop function if exists public.reverse_account_credit(uuid, text[], text);
drop function if exists public.account_credit_position(uuid);
drop function if exists public.record_invoice_payment(uuid, numeric, date, text, text, text, text, text, text, boolean, boolean);

drop trigger if exists payments_amount_check on public.payments;
drop function if exists public.payments_amount_check();

drop index if exists public.receipts_payment_uidx;
drop index if exists public.payments_request_key_uidx;
drop index if exists public.payments_credit_resident_idx;

commit;
