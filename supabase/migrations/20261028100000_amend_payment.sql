-- ===========================================================================
-- Amend payment (28 Oct 2026).
--
-- A payment typed wrong - the amount, the date, the reference or the slip -
-- could only have its slip replaced, so Kodhai's RM1,923.86 stayed recorded as
-- RM1,912.21. Amend payment corrects every field the payment was recorded with.
--
-- An issued receipt is never edited. The wrong payment and its receipt are
-- moved to payment_amendments, whole, with the reason and who amended it, and
-- the corrected payment is saved by record_invoice_payment - the one way a
-- payment is saved - so it gets a new receipt and the invoice's balance and
-- status are worked out the same way as for any payment.
--
-- The wrong payment leaves the payments table instead of being marked, so every
-- place that adds up what an invoice has been paid stays right without being
-- changed.
--
-- Needs 20261015100000_atomic_payments.sql. One transaction; safe to run again.
-- ===========================================================================

begin;

do $$
begin
  if to_regprocedure('public.record_invoice_payment(uuid, numeric, date, text, text, text, text, text, text, boolean, boolean)') is null then
    raise exception 'amend_payment needs 20261015100000_atomic_payments.sql first. Nothing was changed.';
  end if;
end $$;

-- 1. Every amended payment, as it was, with its receipt.
create table if not exists public.payment_amendments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  -- the wrong payment's id and its row, whole - amount, date, reference, proof
  old_payment_id uuid not null,
  old_payment jsonb not null,
  -- its receipt, whole - the receipt number staff and the resident may hold
  old_receipt jsonb,
  -- the payment that took its place
  new_payment_id uuid,
  reason text not null,
  amended_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists payment_amendments_invoice_idx on public.payment_amendments (invoice_id);
create index if not exists payment_amendments_new_payment_idx on public.payment_amendments (new_payment_id);

alter table public.payment_amendments enable row level security;
revoke all on public.payment_amendments from public, anon, authenticated;
grant all on public.payment_amendments to service_role;

-- 2. Amend: the wrong payment out, the corrected one in - all or nothing.
create or replace function public.amend_invoice_payment(
  p_payment uuid,
  p_reason text,
  p_amended_by text,
  p_amount numeric,
  p_paid_on date,
  p_method text,
  p_reference text default '',
  p_proof_path text default '',
  p_description text default '',
  -- the same key again returns the first result, and changes nothing
  p_request_key text default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old public.payments;
  v_rec public.receipts;
  v_amend public.payment_amendments;
  v_res jsonb;
begin
  if p_request_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('payment_request:' || p_request_key, 0));
    select a.* into v_amend
      from public.payment_amendments a
      join public.payments p on p.id = a.new_payment_id
     where p.request_key = p_request_key;
    if found then
      if v_amend.old_payment_id <> p_payment then
        return jsonb_build_object('ok', false, 'error', 'request_key_reused');
      end if;
      v_res := public.record_invoice_payment(
        v_amend.invoice_id, p_amount, p_paid_on, p_method, p_reference, p_proof_path,
        p_description, p_amended_by, p_request_key, false, false);
      return v_res || jsonb_build_object('amended', to_jsonb(v_amend));
    end if;
  end if;

  if length(trim(coalesce(p_reason, ''))) < 3 then
    return jsonb_build_object('ok', false, 'error', 'reason_needed');
  end if;

  select * into v_old from public.payments where id = p_payment for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'payment_not_found');
  end if;
  -- made by the system, not typed by staff: corrected where it came from
  if v_old.method = 'Account credit' then
    return jsonb_build_object('ok', false, 'error', 'not_amendable');
  end if;
  -- the invoice first, in the same order record_invoice_payment locks it
  perform 1 from public.invoices where id = v_old.invoice_id for update;
  select * into v_rec from public.receipts where payment_id = v_old.id;

  insert into public.payment_amendments (invoice_id, old_payment_id, old_payment, old_receipt, reason, amended_by)
  values (v_old.invoice_id, v_old.id, to_jsonb(v_old), to_jsonb(v_rec),
          left(trim(p_reason), 500), coalesce(p_amended_by, ''))
  returning * into v_amend;

  -- its receipt goes with it (on delete cascade), and is kept in old_receipt
  delete from public.payments where id = v_old.id;

  v_res := public.record_invoice_payment(
    v_old.invoice_id, p_amount, p_paid_on, p_method, p_reference, p_proof_path,
    p_description, p_amended_by, p_request_key, false, false);
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    -- refused (a cancelled invoice, an amount of 0): nothing above is kept
    raise exception 'amend_refused:%', coalesce(v_res ->> 'error', 'unknown') using errcode = 'P0001';
  end if;

  update public.payment_amendments
     set new_payment_id = (v_res -> 'payment' ->> 'id')::uuid
   where id = v_amend.id
  returning * into v_amend;

  return v_res || jsonb_build_object('amended', to_jsonb(v_amend));
exception
  when sqlstate 'P0001' then
    if sqlerrm like 'amend_refused:%' then
      return jsonb_build_object('ok', false, 'error', substr(sqlerrm, length('amend_refused:') + 1));
    end if;
    raise;
end $$;

revoke all on function public.amend_invoice_payment(uuid, text, text, numeric, date, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.amend_invoice_payment(uuid, text, text, numeric, date, text, text, text, text, text)
  to service_role;

do $$
begin
  if to_regclass('public.payment_amendments') is null
     or to_regprocedure('public.amend_invoice_payment(uuid, text, text, numeric, date, text, text, text, text, text)') is null
  then
    raise exception 'amend_payment did not complete';
  end if;
end $$;

commit;
