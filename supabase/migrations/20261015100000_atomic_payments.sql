-- ===========================================================================
-- Payments and account credit, each saved in one step (15 Oct 2026).
--
-- Before, a payment was three separate saves - the payment, its receipt, the
-- invoice's status - so a failure part-way left a payment without its receipt,
-- a double click saved it twice, and account credit lived in a Storage file
-- that two requests could read at once and spend twice.
--
--   1. record_invoice_payment: the one way a payment is saved - admin's, account
--      credit's and checkout's. The invoice row is locked, its payments re-read,
--      the payment and its receipt written and the status set, all or nothing.
--      A request key makes a retried save return the first result.
--   2. account_credit_entries: the credit ledger, in the database. A grant has a
--      key, so the same credit is never given twice; a reversal is marked, never
--      deleted. The old Storage files are read once per resident, by
--      import_legacy_account_credit, and left where they are.
--   3. apply_account_credit: the resident's credit is locked, their open
--      invoices locked, and only then is anything added up - so two requests at
--      once cannot spend the same credit, and credit never pays more than owed.
--
-- Every function runs as its caller (security invoker - no definer is needed:
-- the server calls them with the service role, which owns the rows already),
-- and only the service role may call them. The new tables have row level
-- security on and no policy, so only the service role reads them.
--
-- One transaction: it stops with an error, and keeps nothing, unless every
-- step is in place. Safe to run again. Undo:
-- supabase/rollback/20261015100000_atomic_payments.down.sql
-- ===========================================================================

begin;

-- 0. A payment with two receipts cannot take the one-receipt rule. Nothing is
--    deleted or changed here: the migration stops and says how to find them.
do $$
declare
  n integer;
begin
  select count(*) into n
    from (select payment_id from public.receipts group by payment_id having count(*) > 1) d;
  if n > 0 then
    raise exception 'atomic_payments: % payment(s) have more than one receipt, so one receipt per payment cannot be added. Nothing was changed. Find them with: select payment_id, count(*) from public.receipts group by payment_id having count(*) > 1;', n;
  end if;
end $$;

-- 1. Payments: the request key, and an amount that is money.
alter table public.payments add column if not exists recorded_by text not null default '';
alter table public.payments add column if not exists request_key text;

-- a retried save finds the payment it made; two saves can never share a key
create unique index if not exists payments_request_key_uidx
  on public.payments (request_key) where request_key is not null;
-- the credit a resident has used
create index if not exists payments_credit_resident_idx
  on public.payments (resident_id) where method = 'Account credit';

-- Checked on every new payment, whichever way it is saved. Only on insert: the
-- payments already there are history and are not judged again (an update - the
-- resident's id put on a booking's payments - never trips it).
create or replace function public.payments_amount_check()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.amount is null or new.amount = 'NaN'::numeric or new.amount <= 0
     or new.amount = 'Infinity'::numeric then
    raise exception 'invalid_amount: a payment must be more than 0' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists payments_amount_check on public.payments;
create trigger payments_amount_check
  before insert on public.payments
  for each row execute function public.payments_amount_check();

-- 2. One receipt per payment.
create unique index if not exists receipts_payment_uidx on public.receipts (payment_id);

-- 3. The account-credit ledger.
create table if not exists public.account_credit_entries (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null,
  amount numeric not null
    check (amount <> 'NaN'::numeric and amount > 0 and amount <> 'Infinity'::numeric),
  -- "Security deposit reduced - room change 11 Nov 2026"
  reason text not null default '',
  kind text not null check (kind in ('deposit', 'rent', 'cancel')),
  -- a deposit reclassified: which one - checkout takes it off what is held
  deposit_key text,
  deposit_label text,
  -- the Update Tenancy event it came from
  event_id text,
  -- one grant, once: event:<event>:<kind>:<deposit>, cancel:<event>:<invoice>, once:<uuid>, legacy:...
  grant_key text not null,
  -- an entry brought over from the old Storage file: its place and id there
  legacy_id text,
  source text not null default 'app' check (source in ('app', 'legacy_json')),
  created_at timestamptz not null default now(),
  -- taken back (a cancelled event): marked, never removed
  reversed_at timestamptz,
  reversed_reason text,
  -- per resident: an event id is short, and only unique within the resident's own events
  constraint account_credit_entries_grant_key unique (resident_id, grant_key)
);
create index if not exists account_credit_entries_resident_idx
  on public.account_credit_entries (resident_id);
create unique index if not exists account_credit_entries_legacy_uidx
  on public.account_credit_entries (resident_id, legacy_id) where legacy_id is not null;

-- the residents whose old Storage file has been read in - once each
create table if not exists public.account_credit_imports (
  resident_id uuid primary key,
  entries integer not null,
  imported_at timestamptz not null default now()
);

alter table public.account_credit_entries enable row level security;
alter table public.account_credit_imports enable row level security;
revoke all on public.account_credit_entries, public.account_credit_imports from public, anon, authenticated;
grant all on public.account_credit_entries, public.account_credit_imports to service_role;

-- 4. Saving a payment: the one way, for every kind of payment.
create or replace function public.record_invoice_payment(
  p_invoice uuid,
  p_amount numeric,
  p_paid_on date,
  p_method text,
  p_reference text default '',
  p_proof_path text default '',
  p_description text default '',
  p_recorded_by text default '',
  -- the same key again returns the first result, and saves nothing
  p_request_key text default null,
  -- account credit and checkout: never more than the invoice owes now
  p_cap_to_owing boolean default false,
  -- tests only: fail after the payment, before its receipt - nothing may remain
  p_fail_before_receipt boolean default false
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  inv public.invoices;
  v_pay public.payments;
  v_rec public.receipts;
  v_amount numeric;
  v_paid numeric;
  v_balance numeric;
  v_status text;
begin
  if p_request_key is not null then
    -- the same save sent twice at once: the second waits for the first, then finds it
    perform pg_advisory_xact_lock(hashtextextended('payment_request:' || p_request_key, 0));
    select * into v_pay from public.payments where request_key = p_request_key;
    if found then
      if v_pay.invoice_id <> p_invoice
         or (not p_cap_to_owing and v_pay.amount <> round(p_amount, 2)) then
        return jsonb_build_object('ok', false, 'error', 'request_key_reused');
      end if;
      select * into v_rec from public.receipts where payment_id = v_pay.id;
      select * into inv from public.invoices where id = v_pay.invoice_id;
      return jsonb_build_object(
        'ok', true, 'replayed', true,
        'payment', to_jsonb(v_pay), 'receipt', to_jsonb(v_rec),
        'balance', v_rec.balance_after, 'paid_to_date', v_rec.paid_to_date,
        'settled', v_rec.balance_after <= 0.005,
        'invoice', jsonb_build_object('id', inv.id, 'number', inv.number, 'enquiry_id', inv.enquiry_id,
          'resident_id', inv.resident_id, 'status', inv.status, 'invoice_type', inv.invoice_type, 'total', inv.total));
    end if;
  end if;

  if p_amount is null or p_amount = 'NaN'::numeric or p_amount = 'Infinity'::numeric
     or p_amount = '-Infinity'::numeric or round(p_amount, 2) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;
  v_amount := round(p_amount, 2);

  -- the invoice, locked: every other payment on it waits until this one is in
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invoice_not_found');
  end if;
  if inv.status = 'void' then
    return jsonb_build_object('ok', false, 'error', 'invoice_void');
  end if;
  -- an Update Tenancy IP may be paid before its billing day (7 Oct 2026); rent may not
  if inv.status = 'scheduled' and inv.invoice_type <> 'initial' then
    return jsonb_build_object('ok', false, 'error', 'not_billed');
  end if;

  -- what is paid already, read under the lock
  select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = inv.id;
  if p_cap_to_owing then
    v_amount := least(v_amount, round(inv.total - v_paid, 2));
    if v_amount <= 0 then
      return jsonb_build_object('ok', false, 'error', 'nothing_owing');
    end if;
  end if;

  insert into public.payments (invoice_id, enquiry_id, resident_id, amount, paid_on, method,
                               reference, proof_path, description, recorded_by, request_key)
  values (inv.id, inv.enquiry_id, coalesce(inv.resident_id, ''), v_amount, coalesce(p_paid_on, current_date),
          coalesce(p_method, ''), coalesce(p_reference, ''), coalesce(p_proof_path, ''),
          coalesce(p_description, ''), coalesce(p_recorded_by, ''), p_request_key)
  returning * into v_pay;

  if p_fail_before_receipt then
    raise exception 'test_fail_before_receipt';
  end if;

  -- an overpayment is kept as it was before: the balance goes below 0 and the invoice is paid
  v_balance := inv.total - v_paid - v_amount;
  insert into public.receipts (payment_id, invoice_id, enquiry_id, resident_id, amount, balance_after, paid_to_date)
  values (v_pay.id, inv.id, inv.enquiry_id, coalesce(inv.resident_id, ''), v_amount, v_balance, v_paid + v_amount)
  returning * into v_rec;

  -- paid in advance: it stays scheduled, and is billed on its day already paid
  v_status := case when inv.status = 'scheduled' then 'scheduled'
                   when v_balance <= 0.005 then 'paid'
                   else 'part_paid' end;
  update public.invoices set status = v_status, updated_at = now() where id = inv.id;

  return jsonb_build_object(
    'ok', true, 'replayed', false,
    'payment', to_jsonb(v_pay), 'receipt', to_jsonb(v_rec),
    'balance', v_balance, 'paid_to_date', v_paid + v_amount,
    'settled', v_balance <= 0.005,
    'invoice', jsonb_build_object('id', inv.id, 'number', inv.number, 'enquiry_id', inv.enquiry_id,
      'resident_id', inv.resident_id, 'status', v_status, 'invoice_type', inv.invoice_type, 'total', inv.total));
end $$;

-- 5. A resident's credit: given (not taken back), used (on invoices not voided), left.
create or replace function public.account_credit_position(p_resident uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with g as (
    select coalesce(sum(amount), 0) as given
      from public.account_credit_entries
     where resident_id = p_resident and reversed_at is null
  ), u as (
    -- credit used on an invoice later voided - a cancelled event's IP - is theirs again
    select coalesce(sum(p.amount), 0) as used
      from public.payments p
      join public.invoices i on i.id = p.invoice_id
     where p.resident_id = p_resident::text and p.method = 'Account credit' and i.status <> 'void'
  )
  select case when g.given = 0
              then jsonb_build_object('given', 0, 'used', 0, 'balance', 0)
              else jsonb_build_object('given', round(g.given, 2), 'used', round(u.used, 2),
                                      'balance', round(greatest(0, g.given - u.used), 2)) end
    from g, u
$$;

-- 6. Credit given: each entry once, by its key. Returns how many were new.
create or replace function public.grant_account_credit(p_resident uuid, p_entries jsonb)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('account_credit:' || p_resident::text, 0));
  insert into public.account_credit_entries
    (resident_id, amount, reason, kind, deposit_key, deposit_label, event_id, grant_key)
  select p_resident, round((e->>'amount')::numeric, 2), coalesce(e->>'reason', ''), e->>'kind',
         nullif(e->>'depositKey', ''), nullif(e->>'depositLabel', ''), nullif(e->>'eventId', ''), e->>'key'
    from jsonb_array_elements(p_entries) e
  on conflict (resident_id, grant_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- 7. A cancelled event's credit taken back - marked with when and why, never removed.
create or replace function public.reverse_account_credit(p_resident uuid, p_event_ids text[], p_reason text)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('account_credit:' || p_resident::text, 0));
  update public.account_credit_entries
     set reversed_at = now(), reversed_reason = coalesce(p_reason, '')
   where resident_id = p_resident and event_id = any (p_event_ids)
     and kind <> 'cancel' and reversed_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- 8. Use the credit: on p_first when given (the event's own IP, even before it is
--    billed), then - unless p_only - on the oldest invoice still owing that is billed.
create or replace function public.apply_account_credit(
  p_resident uuid,
  p_first uuid default null,
  p_only boolean default false,
  p_paid_on date default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  inv record;
  v_left numeric;
  v_owing numeric;
  v_res jsonb;
  v_out jsonb := '[]'::jsonb;
begin
  -- one use of this resident's credit at a time
  perform pg_advisory_xact_lock(hashtextextended('account_credit:' || p_resident::text, 0));
  -- their open invoices locked, in one order, before any balance is read: a cash
  -- payment on one of them waits, or is waited for, and is never read stale
  perform 1 from public.invoices
   where resident_id = p_resident::text and status not in ('void', 'paid')
   order by id
     for update;

  v_left := (public.account_credit_position(p_resident) ->> 'balance')::numeric;
  if v_left <= 0.005 then
    return v_out;
  end if;

  for inv in
    select i.id, i.total
      from public.invoices i
     where i.resident_id = p_resident::text and i.status not in ('void', 'paid')
       and (coalesce(i.id = p_first, false) or (not p_only and i.status <> 'scheduled'))
     order by coalesce(i.id = p_first, false) desc, i.invoice_date asc, i.issued_at asc
  loop
    exit when v_left <= 0.005;
    select round(inv.total - coalesce(sum(amount), 0), 2) into v_owing
      from public.payments where invoice_id = inv.id;
    continue when v_owing <= 0.005;
    v_res := public.record_invoice_payment(
      inv.id, round(least(v_owing, v_left), 2), coalesce(p_paid_on, current_date), 'Account credit',
      '', '', 'Account credit applied', 'System', null, true, false);
    if (v_res ->> 'ok')::boolean then
      v_left := v_left - (v_res -> 'payment' ->> 'amount')::numeric;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'invoiceId', inv.id,
        'amount', (v_res -> 'payment' ->> 'amount')::numeric,
        'settled', (v_res ->> 'settled')::boolean,
        'paymentId', v_res -> 'payment' ->> 'id',
        'receipt', v_res -> 'receipt' ->> 'number'));
    end if;
  end loop;
  return v_out;
end $$;

-- 9. The old Storage file of one resident, read in once. Its entries keep their
--    time, reason, kind, deposit, event and reversal; an entry of an event takes
--    that event's key, so the same credit cannot be given again after the move.
--    Run twice, it adds nothing: the resident is marked in the same step.
create or replace function public.import_legacy_account_credit(p_resident uuid, p_entries jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  e jsonb;
  i bigint;
  v_key text;
  v_legacy text;
  n integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('account_credit:' || p_resident::text, 0));
  if exists (select 1 from public.account_credit_imports where resident_id = p_resident) then
    return jsonb_build_object('imported', false, 'entries', 0);
  end if;
  for e, i in select value, ordinality from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) with ordinality loop
    v_legacy := i::text || ':' || coalesce(e->>'id', '');
    continue when exists (select 1 from public.account_credit_entries
                           where resident_id = p_resident and legacy_id = v_legacy);
    v_key := case when nullif(e->>'eventId', '') is not null and e->>'kind' <> 'cancel'
                  then 'event:' || (e->>'eventId') || ':' || (e->>'kind') || ':' || coalesce(e->>'depositKey', '') end;
    if v_key is null or exists (select 1 from public.account_credit_entries
                                 where resident_id = p_resident and grant_key = v_key) then
      v_key := 'legacy:' || p_resident::text || ':' || v_legacy;
    end if;
    insert into public.account_credit_entries
      (resident_id, amount, reason, kind, deposit_key, deposit_label, event_id, grant_key, legacy_id,
       source, created_at, reversed_at, reversed_reason)
    values (p_resident, round((e->>'amount')::numeric, 2), coalesce(e->>'reason', ''), e->>'kind',
            nullif(e->>'depositKey', ''), nullif(e->>'depositLabel', ''), nullif(e->>'eventId', ''),
            v_key, v_legacy, 'legacy_json', coalesce((e->>'at')::timestamptz, now()),
            (e->>'reversedAt')::timestamptz, e->>'reversedReason');
    n := n + 1;
  end loop;
  insert into public.account_credit_imports (resident_id, entries) values (p_resident, n);
  return jsonb_build_object('imported', true, 'entries', n);
end $$;

-- 10. Only the server (service role) may call these.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.payments_amount_check()',
    'public.record_invoice_payment(uuid, numeric, date, text, text, text, text, text, text, boolean, boolean)',
    'public.account_credit_position(uuid)',
    'public.grant_account_credit(uuid, jsonb)',
    'public.reverse_account_credit(uuid, text[], text)',
    'public.apply_account_credit(uuid, uuid, boolean, date)',
    'public.import_legacy_account_credit(uuid, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- 11. Every step in place, or nothing is kept.
do $$
begin
  if to_regclass('public.payments_request_key_uidx') is null
     or to_regclass('public.receipts_payment_uidx') is null
     or to_regclass('public.account_credit_entries') is null
     or to_regclass('public.account_credit_imports') is null
     or to_regprocedure('public.record_invoice_payment(uuid, numeric, date, text, text, text, text, text, text, boolean, boolean)') is null
     or to_regprocedure('public.apply_account_credit(uuid, uuid, boolean, date)') is null
     or to_regprocedure('public.import_legacy_account_credit(uuid, jsonb)') is null
     or not exists (select 1 from pg_trigger where tgname = 'payments_amount_check' and not tgisinternal)
     or not (select relrowsecurity from pg_class where oid = 'public.account_credit_entries'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.account_credit_imports'::regclass)
  then
    raise exception 'atomic_payments did not complete';
  end if;
end $$;

commit;
