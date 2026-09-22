-- ===========================================================================
-- Existing invoices renumbered to INV/XX/00001, in the order they were made.
--
-- 20260915150000_invoice_numbers.sql numbers every invoice made from then on.
-- This gives the invoices made before it their new numbers too, so the whole
-- list runs in one order: the oldest invoice is 00001, and the next new invoice
-- carries on from the last one here. Cancelled invoices keep their place in the
-- order - their number was issued. Scheduled rent is not numbered until billed.
--
-- The booking activity log names invoices by number, so it is updated to match.
--
-- Safe to run again: once every numbered invoice is in the new format, it does
-- nothing - so it never renumbers invoices made after it.
-- ===========================================================================

do $$
declare
  renamed record;
  last_no integer;
begin
  if not exists (
    select 1
    from public.invoices
    where status <> 'scheduled'
      and number !~ '^INV/[A-Z]{2}/[0-9]{5,}$'
  ) then
    return;
  end if;

  create temporary table renumber on commit drop as
  select
    id,
    number as old_number,
    'INV/' || public.invoice_category_code(invoice_type) || '/'
      || lpad((row_number() over (order by created_at, id))::text, 5, '0') as new_number
  from public.invoices
  where status <> 'scheduled';

  update public.invoices i
  set number = r.new_number
  from renumber r
  where i.id = r.id;

  update public.booking_events e
  set ref = r.new_number
  from renumber r
  where e.ref = r.old_number;

  -- one number at a time, longest first, so a line naming two invoices gets both
  for renamed in select old_number, new_number from renumber order by length(old_number) desc loop
    update public.booking_events
    set summary = replace(summary, renamed.old_number, renamed.new_number)
    where summary like '%' || renamed.old_number || '%';
  end loop;

  -- the next invoice follows on from the last one renumbered
  select count(*) into last_no from renumber;
  perform setval('public.invoice_no_seq', greatest(last_no, 1), last_no > 0);
end;
$$;
