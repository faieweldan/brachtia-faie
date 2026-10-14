-- Credit note numbers that mirror invoices (Dani, 14 Oct 2026).
--
-- Invoices read INV/<kind>/<no.> - IP, RP, AC, CS. Credit notes were two
-- styles, and one clashed: account credit refunds were CN/AC/... while AC on an
-- invoice means Additional charge; checkout notes were CS/... with no CN.
-- Now every credit note is CN/<kind>/<no.>, each kind counting from 1:
--   CN/RF/00001  account credit refunded (RF - refund)
--   CN/CS/00001  checkout settlement - pairs with INV/CS, the invoice when the
--                resident owes at checkout
-- A code means one thing across invoices and credit notes
-- (src/lib/invoice-category.ts, tests/one-rule.test.ts).
--
--   1. account credit notes keep who they were issued to (name, ID) - an issued
--      document says who it is for even if the resident is later removed
--   2. the CN/AC notes there already become CN/RF, from 1, in the order issued
--      (no PDF of one was ever made, so no printed number disagrees)
--   3. issue_account_credit_note numbers CN/RF and keeps the name and ID
--   4. checkout's number from the database - it was a counter in a Storage file,
--      read then written, so two statements started together could share one
--
-- Checkout statements already issued keep their CS/ numbers: their PDFs, signed
-- ones included, print it, and a signed document is never rewritten.
--
-- Run after 20261020100000_referral_from_booking.sql.

begin;

do $$
begin
  if to_regclass('public.account_credit_notes') is null then
    raise exception 'credit_note_numbers needs 20261018100000_account_credit_notes.sql first. Nothing was changed.';
  end if;
end $$;

-- 1. Who it was issued to.
alter table public.account_credit_notes add column if not exists resident_name text not null default '';
alter table public.account_credit_notes add column if not exists resident_code text not null default '';
update public.account_credit_notes n
   set resident_name = coalesce(r.full_name, ''),
       resident_code = coalesce(nullif(r.resident_code, ''), r.quickbooks_id, '')
  from public.residents r
 where r.id = n.resident_id and n.resident_name = '';

-- 2. The notes there already, from 1 in the order issued.
with o as (
  select id, row_number() over (order by issued_at, number) as n
    from public.account_credit_notes
   where number !~ '^CN/RF/'
)
update public.account_credit_notes c
   set number = 'CN/RF/' || lpad((o.n + coalesce((select count(*) from public.account_credit_notes where number ~ '^CN/RF/'), 0))::text, 5, '0')
  from o
 where o.id = c.id;

select setval('public.account_credit_note_seq',
              greatest(1, (select count(*) from public.account_credit_notes)),
              exists (select 1 from public.account_credit_notes));

-- 3. Issued as CN/RF, with who it is for.
create or replace function public.issue_account_credit_note(p_resident uuid, p_issued_by text)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_left numeric;
  v_number text;
  v_res record;
begin
  perform pg_advisory_xact_lock(hashtextextended('account_credit:' || p_resident::text, 0));
  -- the same lock order as apply_account_credit: a payment on one of these waits, or is waited for
  perform 1 from public.invoices
   where resident_id = p_resident::text and status not in ('void', 'paid')
   order by id
     for update;
  v_left := public.account_credit_leftover(p_resident);
  if v_left <= 0.005 then
    return jsonb_build_object('ok', false, 'error', 'nothing_left_over');
  end if;
  select full_name, coalesce(nullif(resident_code, ''), quickbooks_id, '') as code
    into v_res from public.residents where id = p_resident;
  v_number := 'CN/RF/' || lpad(nextval('public.account_credit_note_seq')::text, 5, '0');
  insert into public.account_credit_notes (resident_id, number, amount, issued_by, resident_name, resident_code)
  values (p_resident, v_number, v_left, coalesce(p_issued_by, ''), coalesce(v_res.full_name, ''), coalesce(v_res.code, ''));
  return jsonb_build_object('ok', true, 'number', v_number, 'amount', v_left);
end $$;

-- 4. Checkout's number, from 1, given once.
create sequence if not exists public.checkout_note_seq;
revoke all on sequence public.checkout_note_seq from public, anon, authenticated;
grant usage on sequence public.checkout_note_seq to service_role;

create or replace function public.next_checkout_note_number()
returns text
language sql
set search_path = public, pg_temp
as $$
  select 'CN/CS/' || lpad(nextval('public.checkout_note_seq')::text, 5, '0')
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.issue_account_credit_note(uuid, text)',
    'public.next_checkout_note_number()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Every step in place, or nothing is kept.
do $$
begin
  if to_regprocedure('public.next_checkout_note_number()') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'account_credit_notes' and column_name = 'resident_name')
     or exists (select 1 from public.account_credit_notes where number !~ '^CN/RF/\d{5}$')
  then
    raise exception 'credit_note_numbers did not complete';
  end if;
end $$;

commit;
