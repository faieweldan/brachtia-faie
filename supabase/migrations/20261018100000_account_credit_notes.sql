-- Credit notes for account credit, in the database (14 Oct 2026).
--
-- Two pieces of work met here. The account-credit ledger moved into the
-- database (20261015100000_atomic_payments.sql): every grant once, every use
-- locked. Separately, leftover credit got a way out (13 Oct 2026): credit goes
-- onto the next rentals first, and only what no invoice can take may become a
-- credit note and be paid back. That second piece was written against the old
-- Storage files. Kept there, a note would be a second fact beside the ledger -
-- the balance read from one place, the notes from another - so it lives here:
--
--   1. account_credit_notes: one row per note - its number (CN/AC/00001), the
--      amount, who issued it, and its refund once paid.
--   2. account_credit_position counts notes: given - used - noted. The balance,
--      checkout's "Account credit not used" and Payables read this one figure.
--   3. account_credit_leftover: the credit no open invoice can take - the one
--      rule, read by the Payments tab and by the issue step alike.
--   4. issue_account_credit_note: the resident's credit and open invoices
--      locked (as apply_account_credit locks them), the leftover read, the note
--      made for exactly that. Two clicks at once give one note.
--   5. record_account_credit_note_refund: the note locked, the refund kept once.
--   6. import_legacy_account_credit: a credit note written to an old Storage
--      file comes across as a note, not as a grant.
--
-- Run after 20261017100000_placement_order_fix.sql.

begin;

-- 1. The notes.
create sequence if not exists public.account_credit_note_seq;

create table if not exists public.account_credit_notes (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null,
  number text not null unique,
  amount numeric not null
    check (amount <> 'NaN'::numeric and amount > 0 and amount <> 'Infinity'::numeric),
  reason text not null default 'Credit note - account credit with no invoice left to use it on',
  issued_by text not null default '',
  issued_at timestamptz not null default now(),
  -- { amount, paidOn, method, reference, proofPath, recordedBy, recordedAt } once paid
  refund jsonb,
  -- brought over from an old Storage file: its place there
  legacy_id text,
  constraint account_credit_notes_legacy_uniq unique (resident_id, legacy_id)
);
create index if not exists account_credit_notes_resident_idx
  on public.account_credit_notes (resident_id);
alter table public.account_credit_notes enable row level security;
revoke all on public.account_credit_notes from public, anon, authenticated;
grant all on public.account_credit_notes to service_role;
revoke all on sequence public.account_credit_note_seq from public, anon, authenticated;
grant usage on sequence public.account_credit_note_seq to service_role;

-- 2. The position, notes counted.
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
  ), n as (
    -- paid back on a credit note: no longer theirs to use
    select coalesce(sum(amount), 0) as noted
      from public.account_credit_notes
     where resident_id = p_resident
  )
  select case when g.given = 0
              then jsonb_build_object('given', 0, 'used', 0, 'noted', 0, 'balance', 0)
              else jsonb_build_object('given', round(g.given, 2), 'used', round(u.used, 2),
                                      'noted', round(n.noted, 2),
                                      'balance', round(greatest(0, g.given - u.used - n.noted), 2)) end
    from g, u, n
$$;

-- 3. What no open invoice can take: the balance, less everything still owing -
--    rent not billed yet included, because the credit goes there on the day it is.
create or replace function public.account_credit_leftover(p_resident uuid)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  with o as (
    select coalesce(sum(greatest(0, i.total - coalesce(
             (select sum(p.amount) from public.payments p where p.invoice_id = i.id), 0))), 0) as owing
      from public.invoices i
     where i.resident_id = p_resident::text and i.status not in ('void', 'paid')
  )
  select round(greatest(0, (public.account_credit_position(p_resident) ->> 'balance')::numeric - o.owing), 2)
    from o
$$;

-- 4. Issue the note for the leftover - worked out with everything locked.
create or replace function public.issue_account_credit_note(p_resident uuid, p_issued_by text)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_left numeric;
  v_number text;
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
  v_number := 'CN/AC/' || lpad(nextval('public.account_credit_note_seq')::text, 5, '0');
  insert into public.account_credit_notes (resident_id, number, amount, issued_by)
  values (p_resident, v_number, v_left, coalesce(p_issued_by, ''));
  return jsonb_build_object('ok', true, 'number', v_number, 'amount', v_left);
end $$;

-- 5. A note's refund, kept once.
create or replace function public.record_account_credit_note_refund(p_resident uuid, p_number text, p_refund jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_note public.account_credit_notes;
begin
  select * into v_note from public.account_credit_notes
   where resident_id = p_resident and number = p_number
     for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_note.refund is not null then
    return jsonb_build_object('ok', false, 'error', 'already_paid');
  end if;
  update public.account_credit_notes set refund = p_refund where id = v_note.id;
  return jsonb_build_object('ok', true);
end $$;

-- 6. The old Storage file: a note comes across as a note.
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
    if e->>'kind' = 'note' then
      -- written as a negative entry in the file; a note of its own here
      continue when e->>'reversedAt' is not null;
      insert into public.account_credit_notes
        (resident_id, number, amount, reason, issued_by, issued_at, refund, legacy_id)
      values (p_resident, coalesce(nullif(e->>'number', ''), 'CN/AC/legacy-' || v_legacy),
              round(abs((e->>'amount')::numeric), 2), coalesce(e->>'reason', ''),
              coalesce(e->>'issuedBy', ''), coalesce((e->>'at')::timestamptz, now()),
              e->'refund', v_legacy)
      on conflict do nothing;
      n := n + 1;
      continue;
    end if;
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

-- the next number after any note already brought over
select setval('public.account_credit_note_seq',
              greatest(1, coalesce((select max(substring(number from 'CN/AC/(\d+)$')::bigint)
                                      from public.account_credit_notes), 0)),
              exists (select 1 from public.account_credit_notes where number ~ 'CN/AC/\d+$'));

-- Only the server (service role) may call these.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.account_credit_position(uuid)',
    'public.account_credit_leftover(uuid)',
    'public.issue_account_credit_note(uuid, text)',
    'public.record_account_credit_note_refund(uuid, text, jsonb)',
    'public.import_legacy_account_credit(uuid, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Every step in place, or nothing is kept.
do $$
begin
  if to_regclass('public.account_credit_notes') is null
     or to_regprocedure('public.account_credit_leftover(uuid)') is null
     or to_regprocedure('public.issue_account_credit_note(uuid, text)') is null
     or to_regprocedure('public.record_account_credit_note_refund(uuid, text, jsonb)') is null
     or not (select relrowsecurity from pg_class where oid = 'public.account_credit_notes'::regclass)
  then
    raise exception 'account_credit_notes did not complete';
  end if;
end $$;

commit;
