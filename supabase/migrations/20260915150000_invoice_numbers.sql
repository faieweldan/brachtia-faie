-- ===========================================================================
-- Invoice numbers that say what the invoice is for: INV/IP/00001.
--
--   INV/IP/00001   Initial payment
--   INV/RP/00002   Rental payment
--   INV/AC/00003   Additional charge (a checkout settlement counts as one)
--
-- One running number across every category, in the order invoices are made -
-- the category is in the middle, the order is in the number. It is given by the
-- database as the invoice is saved, so no page can make one up. A scheduled rent
-- invoice keeps its placeholder until it is billed, and gets its number then.
--
-- Invoices made before this are renumbered in order by
-- 20260915160000_renumber_existing_invoices.sql.
--
-- Safe to run again.
-- ===========================================================================

create sequence if not exists public.invoice_no_seq;

create or replace function public.invoice_category_code(invoice_type text)
returns text
language sql
immutable
as $$
  select case invoice_type
    when 'rental' then 'RP'
    when 'charge' then 'AC'
    when 'checkout' then 'AC'
    else 'IP'
  end
$$;

create or replace function public.next_invoice_number(invoice_type text)
returns text
language sql
set search_path = public
as $$
  select 'INV/' || public.invoice_category_code(invoice_type) || '/'
    || lpad(nextval('public.invoice_no_seq')::text, 5, '0')
$$;

-- every new invoice is numbered here; a scheduled one waits until it is billed
create or replace function public.number_new_invoice()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'scheduled' then
    if coalesce(new.number, '') = '' then
      new.number := 'SCH-' || new.id;
    end if;
  else
    new.number := public.next_invoice_number(new.invoice_type);
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_number on public.invoices;
create trigger invoices_number
  before insert on public.invoices
  for each row execute function public.number_new_invoice();

-- the trigger gives the number now; the old dated default only used up its sequence
alter table public.invoices alter column number set default '';

-- billing a scheduled invoice gives it the next number in the same order
create or replace function public.bill_due_invoices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  due record;
  billed integer := 0;
begin
  for due in
    select id, invoice_type
    from public.invoices
    where status = 'scheduled'
      and bill_on <= (now() at time zone 'Asia/Kuala_Lumpur')::date
    order by bill_on, period_start, created_at
    for update skip locked
  loop
    update public.invoices
    set status = 'issued',
        number = public.next_invoice_number(due.invoice_type),
        issued_at = now(),
        updated_at = now()
    where id = due.id;
    billed := billed + 1;
  end loop;
  return billed;
end;
$$;

revoke all on function public.bill_due_invoices() from public;
grant execute on function public.bill_due_invoices() to service_role;
