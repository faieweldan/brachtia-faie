-- ===========================================================================
-- Resident ID: YYTG####, e.g. 26IF0042.
--
--   YY    the year the resident first joins Brachtia - their move-in year,
--         or this year when there is no move-in date yet      26 = 2026
--   T     resident type                                        I = International, L = Local
--   G     gender                                               M = Male, F = Female
--   ####  one running number across every resident            0001-9999
--
-- Given by the database, never typed, so two residents can never share one. A
-- resident gets it as soon as their gender and nationality are known - on the
-- way in when a booking becomes a resident, or on the save that fills them in.
-- Once given it never changes: it is who they are, even if a detail is corrected.
--
-- Residents who already have a Brachtia ID from the master list (quickbooks_id,
-- "00256") keep it and are not given a new one.
--
-- Safe to run again.
-- ===========================================================================

alter table public.residents add column if not exists resident_code text;
create unique index if not exists residents_resident_code_key
  on public.residents (resident_code) where resident_code is not null;

create sequence if not exists public.resident_code_seq;

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
  if new.resident_code is not null or coalesce(trim(new.quickbooks_id), '') <> '' then
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

-- residents made in the app before this, who have what the ID needs, get theirs now,
-- oldest first so the running number follows who joined first
do $$
declare
  waiting record;
begin
  for waiting in
    select id from public.residents
    where resident_code is null and coalesce(trim(quickbooks_id), '') = ''
    order by created_at, id
  loop
    -- the trigger does the work on update
    update public.residents set updated_at = updated_at where id = waiting.id;
  end loop;
end;
$$;
