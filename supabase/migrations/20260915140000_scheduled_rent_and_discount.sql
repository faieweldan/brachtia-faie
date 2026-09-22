-- ===========================================================================
-- Rent invoices made ahead, billed when their time comes - and a rent discount.
--
-- Scheduled invoices: once a tenancy has its rent terms, every rent invoice to
-- the end of the tenancy is created at once with status 'scheduled'. It is
-- listed on the resident's Payments tab and in Collections, but nobody owes it:
-- it has no invoice number yet and counts in no total. On its bill_on date - 14
-- days before its period starts - bill_due_invoices() turns it into an ordinary
-- issued invoice and gives it its number then, so numbers run in the order
-- invoices are billed. It is called before billing is read, so no timer is needed.
--
-- auto_scheduled: made by the schedule. The schedule rebuilds these when its
-- terms change. Once admin edits one it is false, and it keeps admin's changes.
--
-- Discount: taken off the monthly rent on the invoice generator. monthly_rent is
-- the rent after the discount - everything worked out from rent uses it -
-- list_rent is the rent before it, and discount_type/discount_value say what was
-- taken off, for the invoice to show.
--
-- Safe to run again.
-- ===========================================================================

alter table public.invoices
  add column if not exists bill_on date,
  add column if not exists auto_scheduled boolean not null default false,
  add column if not exists list_rent numeric,
  add column if not exists discount_type text,
  add column if not exists discount_value numeric not null default 0;

alter table public.invoices drop constraint if exists invoices_discount_type_check;
alter table public.invoices
  add constraint invoices_discount_type_check
  check (discount_type is null or discount_type in ('percent', 'amount'));

create index if not exists invoices_scheduled_idx
  on public.invoices (bill_on) where status = 'scheduled';
create index if not exists invoices_tenancy_idx on public.invoices (tenancy_id);

-- Bill every scheduled invoice whose day has come, oldest first, each with its
-- number from the same sequence as every other invoice. Malaysian date.
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
    select id
    from public.invoices
    where status = 'scheduled'
      and bill_on <= (now() at time zone 'Asia/Kuala_Lumpur')::date
    order by bill_on, period_start, created_at
    for update skip locked
  loop
    update public.invoices
    set status = 'issued',
        number = public.next_invoice_reference(),
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
