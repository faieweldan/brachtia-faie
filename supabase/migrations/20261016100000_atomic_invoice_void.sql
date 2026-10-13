-- ===========================================================================
-- An invoice is cancelled in one step with the money on it (16 Oct 2026).
--
-- Before, each cancellation read the payments, then marked the invoice void in
-- a second request - a payment saved in between left an invoice void with money
-- on it, or an Update Tenancy cancellation that moved less to credit than was
-- paid. Each way of cancelling now locks the invoice row first (FOR UPDATE, the
-- same lock record_invoice_payment takes), then checks the money, marks it void
-- and does what goes with it, all or nothing:
--
--   void_invoice_if_unpaid        Admin Cancel Invoice, an unpaid difference
--                                 invoice dropped by a room change, and the
--                                 initial invoice of a checkout cancellation
--   void_unpaid_booking_invoices  releasing a booking's room
--   void_invoice_to_credit        cancelling an Update Tenancy event: the money
--                                 paid on its IP or RP adjustment becomes account
--                                 credit - given once, in the same step
--
-- A payment and a cancellation at once: whichever locks the invoice first goes
-- first, and the other sees what it did - a payment never lands on a void
-- invoice (record_invoice_payment refuses it), and a cancellation never voids
-- money it did not see. Lock order where credit is involved is the same as
-- apply_account_credit: the resident's credit first, then the invoice.
--
-- Runs as its caller (security invoker); only the service role may call these.
-- Needs 20261015100000_atomic_payments.sql. One transaction; safe to run again.
-- Undo: supabase/rollback/20261016100000_atomic_invoice_void.down.sql
-- ===========================================================================

begin;

do $$
begin
  if to_regprocedure('public.record_invoice_payment(uuid, numeric, date, text, text, text, text, text, text, boolean, boolean)') is null
     or to_regclass('public.account_credit_entries') is null then
    raise exception 'atomic_invoice_void needs 20261015100000_atomic_payments.sql first. Nothing was changed.';
  end if;
end $$;

-- 1. Void one invoice, only if what is paid on it - read under the lock - is what
--    the caller expected: nothing (Admin Cancel Invoice, a room change's unpaid
--    difference invoice), or the amount a checkout statement was made from.
create or replace function public.void_invoice_if_unpaid(
  p_invoice uuid,
  p_expect_paid numeric default 0
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  inv public.invoices;
  v_paid numeric;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invoice_not_found');
  end if;
  if inv.status = 'void' then
    return jsonb_build_object('ok', false, 'error', 'already_void', 'number', inv.number);
  end if;
  select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = inv.id;
  if round(v_paid, 2) <> round(coalesce(p_expect_paid, 0), 2) or inv.status = 'paid' then
    return jsonb_build_object('ok', false, 'error', 'paid', 'paid', v_paid, 'number', inv.number);
  end if;
  update public.invoices set status = 'void', updated_at = now() where id = inv.id;
  return jsonb_build_object('ok', true, 'number', inv.number, 'enquiry_id', inv.enquiry_id,
                            'invoice_type', inv.invoice_type);
end $$;

-- 2. Release a booking's room: every live invoice of the booking voided - only if
--    no money has been recorded on the booking, checked once they are all locked.
create or replace function public.void_unpaid_booking_invoices(p_enquiry uuid)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
  v_numbers jsonb;
begin
  select coalesce(array_agg(id), '{}') into v_ids
    from (select id from public.invoices
           where enquiry_id = p_enquiry and status <> 'void'
           order by id
             for update) locked;
  if exists (select 1 from public.payments where enquiry_id = p_enquiry) then
    return jsonb_build_object('ok', false, 'voided', '[]'::jsonb);
  end if;
  -- only the invoices locked above: one made since is not this release's to cancel
  with v as (
    update public.invoices set status = 'void', updated_at = now()
     where id = any (v_ids)
    returning number
  )
  select coalesce(jsonb_agg(number), '[]'::jsonb) into v_numbers from v;
  return jsonb_build_object('ok', true, 'voided', v_numbers);
end $$;

-- 3. Cancel an Update Tenancy event's invoice (its IP, or its RP adjustment): the
--    invoice voided with the cancellation note, and the money paid on it - not
--    account credit, which is the resident's again by itself once the invoice is
--    void - given back as account credit, once (cancel:<event>:<invoice>).
--    Already void (a cancellation run again): nothing changes, nothing is given.
create or replace function public.void_invoice_to_credit(
  p_resident uuid,
  p_invoice uuid,
  -- "Cancelled: <reason> · Approved by <name> · <when>" - the money moved is added here
  p_note text,
  -- "IP" / "RP adjustment", and "<event> cancelled", for the credit's reason
  p_what text,
  p_tail text,
  p_event_id text,
  -- tests only: fail after the void, before the credit - neither may remain
  p_fail_before_credit boolean default false
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  inv public.invoices;
  v_cash numeric;
  v_note text;
begin
  -- the resident's credit first, then the invoice - apply_account_credit's order
  perform pg_advisory_xact_lock(hashtextextended('account_credit:' || p_resident::text, 0));
  select * into inv from public.invoices where id = p_invoice for update;
  if not found or inv.status = 'void' then
    return jsonb_build_object('ok', true, 'voided', false, 'cash', 0);
  end if;
  select round(coalesce(sum(amount), 0), 2) into v_cash
    from public.payments where invoice_id = inv.id and method <> 'Account credit';
  v_note := coalesce(p_note, '')
            || case when v_cash > 0
                    then ' · RM ' || to_char(v_cash, 'FM999999999990.00') || ' moved to account credit'
                    else '' end;
  update public.invoices
     set status = 'void',
         notes = concat_ws(' | ', nullif(inv.notes, ''), nullif(v_note, '')),
         updated_at = now()
   where id = inv.id;

  if p_fail_before_credit then
    raise exception 'test_fail_before_credit';
  end if;

  if v_cash > 0 then
    insert into public.account_credit_entries (resident_id, amount, reason, kind, event_id, grant_key)
    values (p_resident, v_cash,
            'Paid on ' || coalesce(p_what, '') || ' '
              || case when inv.number like 'SCH-%' then '(not billed yet)' else inv.number end
              || ' - ' || coalesce(p_tail, ''),
            'cancel', nullif(p_event_id, ''), 'cancel:' || coalesce(p_event_id, '') || ':' || inv.id::text)
    on conflict (resident_id, grant_key) do nothing;
  end if;
  return jsonb_build_object('ok', true, 'voided', true, 'cash', v_cash, 'number', inv.number);
end $$;

-- 4. Only the server (service role) may call these.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.void_invoice_if_unpaid(uuid, numeric)',
    'public.void_unpaid_booking_invoices(uuid)',
    'public.void_invoice_to_credit(uuid, uuid, text, text, text, text, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- 5. Every step in place, or nothing is kept.
do $$
begin
  if to_regprocedure('public.void_invoice_if_unpaid(uuid, numeric)') is null
     or to_regprocedure('public.void_unpaid_booking_invoices(uuid)') is null
     or to_regprocedure('public.void_invoice_to_credit(uuid, uuid, text, text, text, text, boolean)') is null
  then
    raise exception 'atomic_invoice_void did not complete';
  end if;
end $$;

commit;
