-- ===========================================================================
-- Every resident gets a Resident ID, including the ones from the master list.
--
-- 20260915170000 gave a resident ID only to residents who did NOT already carry
-- a Brachtia ID from QuickBooks: the thought was that somebody with "00256"
-- already had an ID and did not need a second one.
--
-- In practice that splits the list in two. A resident imported from the master
-- list shows a blank Resident ID next to residents who have one, and every
-- invoice, receipt and tenancy that states "Resident ID" has nothing to state
-- for them. The two IDs answer different questions - the QuickBooks ID is what
-- the old accounting system knows them by, the resident ID is who they are here
-- - so a resident may hold both, and most hold only the new one.
--
-- After this: everybody has a resident ID. The QuickBooks ID is kept exactly as
-- it was, unique as before, and is simply shown in fewer places.
--
-- Safe to run again: the backfill only touches rows that still have no code,
-- and a resident who has one keeps it - a resident ID never changes once given.
-- ===========================================================================

/*
 * The same function as before, less the quickbooks_id exemption. Everything
 * else - the format, the early return while gender or nationality is unknown,
 * the shared running number - is unchanged, so codes given before this and
 * codes given after it are the same kind of thing and cannot collide.
 */
create or replace function public.assign_resident_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resident_type text;
  gender_code text;
  joined text;
begin
  -- once given it never changes, whatever else is corrected on the row
  if new.resident_code is not null then
    return new;
  end if;

  gender_code := case lower(trim(coalesce(new.gender, '')))
    when 'male' then 'M' when 'm' then 'M'
    when 'female' then 'F' when 'f' then 'F'
    else null
  end;
  resident_type := case
    when coalesce(trim(new.nationality), '') = '' then null
    when upper(trim(new.nationality)) in ('MYS', 'MY', 'MALAYSIA', 'MALAYSIAN') then 'L'
    else 'I'
  end;
  -- not known yet: given on the save that fills them in
  if gender_code is null or resident_type is null then
    return new;
  end if;

  joined := case
    when coalesce(new.move_in, '') ~ '^\d{4}-' then substr(new.move_in, 3, 2)
    else to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YY')
  end;

  new.resident_code := joined || resident_type || gender_code
    || lpad(nextval('public.resident_code_seq')::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists residents_resident_code on public.residents;
create trigger residents_resident_code
  before insert or update on public.residents
  for each row execute function public.assign_resident_code();

/*
 * Everybody still without one, oldest first so the running number follows the
 * order people actually joined rather than the order the rows come back in.
 *
 * A resident whose gender or nationality is still blank is passed over by the
 * trigger and stays without a code - there is no way to tell an I from an L, or
 * an M from an F, without them. They get theirs on the save that fills them in.
 */
do $$
declare
  waiting record;
begin
  for waiting in
    select id from public.residents
    where resident_code is null
    order by created_at, id
  loop
    -- the trigger does the work on update
    update public.residents set updated_at = updated_at where id = waiting.id;
  end loop;
end;
$$;

comment on column public.residents.resident_code is
  'Who the resident is here - YYTG####. Every resident has one, including residents imported with a QuickBooks ID.';
