-- A credit note keeps its breakdown (Dani, 14 Oct 2026).
--
-- issue_account_credit_note worked the leftover out - credit given, less what
-- was used on invoices, less earlier credit notes, less the rent still to bill
-- - and kept only the total. The note then read "account credit with no
-- invoice left to use it on · RM1,066.93" with nothing to say where the money
-- came from. Now:
--   1. account_credit_notes.lines - the breakdown, as it stood when issued
--      (an issued document does not change when more credit comes in later)
--   2. account_credit_note_lines - the one way it is worked out; the lines add
--      up to account_credit_leftover
--   3. issue_account_credit_note keeps it with the note
--   4. the notes there already get theirs, worked out now, leaving themselves out
--
-- Run after 20261021100000_credit_note_numbers.sql.

begin;

do $$
begin
  if to_regprocedure('public.account_credit_leftover(uuid)') is null then
    raise exception 'credit_note_lines needs 20261018100000_account_credit_notes.sql first. Nothing was changed.';
  end if;
end $$;

-- 1. The breakdown.
alter table public.account_credit_notes add column if not exists lines jsonb not null default '[]'::jsonb;

-- 2. Every credit given, then what took from it - adds up to the leftover.
--    p_leave_out: a note already issued, so its own amount is not taken off itself.
create or replace function public.account_credit_note_lines(p_resident uuid, p_leave_out uuid default null)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with given as (
    select coalesce(jsonb_agg(jsonb_build_object('label', e.reason, 'amount', round(e.amount, 2)) order by e.created_at), '[]'::jsonb) as lines
      from public.account_credit_entries e
     where e.resident_id = p_resident and e.reversed_at is null
  ), used as (
    select coalesce(sum(p.amount), 0) as amount
      from public.payments p
      join public.invoices i on i.id = p.invoice_id
     where p.resident_id = p_resident::text and p.method = 'Account credit' and i.status <> 'void'
  ), noted as (
    select coalesce(sum(n.amount), 0) as amount
      from public.account_credit_notes n
     where n.resident_id = p_resident and n.id is distinct from p_leave_out
  ), owing as (
    select coalesce(sum(greatest(0, i.total - coalesce(
             (select sum(p.amount) from public.payments p where p.invoice_id = i.id), 0))), 0) as amount
      from public.invoices i
     where i.resident_id = p_resident::text and i.status not in ('void', 'paid')
  )
  select given.lines
         || case when used.amount > 0.005 then jsonb_build_array(jsonb_build_object('label', 'Used on invoices', 'amount', -round(used.amount, 2))) else '[]'::jsonb end
         || case when noted.amount > 0.005 then jsonb_build_array(jsonb_build_object('label', 'Earlier credit notes', 'amount', -round(noted.amount, 2))) else '[]'::jsonb end
         || case when owing.amount > 0.005 then jsonb_build_array(jsonb_build_object('label', 'Rent still to bill', 'amount', -round(owing.amount, 2))) else '[]'::jsonb end
    from given, used, noted, owing
$$;

-- 3. Issued with its breakdown.
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
  insert into public.account_credit_notes (resident_id, number, amount, issued_by, resident_name, resident_code, lines)
  values (p_resident, v_number, v_left, coalesce(p_issued_by, ''), coalesce(v_res.full_name, ''), coalesce(v_res.code, ''),
          public.account_credit_note_lines(p_resident));
  return jsonb_build_object('ok', true, 'number', v_number, 'amount', v_left);
end $$;

-- 4. The notes there already.
update public.account_credit_notes n
   set lines = public.account_credit_note_lines(n.resident_id, n.id)
 where n.lines = '[]'::jsonb;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.account_credit_note_lines(uuid, uuid)',
    'public.issue_account_credit_note(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Every step in place, or nothing is kept.
do $$
begin
  if to_regprocedure('public.account_credit_note_lines(uuid, uuid)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'account_credit_notes' and column_name = 'lines')
  then
    raise exception 'credit_note_lines did not complete';
  end if;
end $$;

commit;
