-- ===========================================================================
-- Checkout settlement invoices get their own code: INV/CS/00041 (2 Oct 2026).
--
-- What a resident still owes at checkout, once their deposit is used up, is
-- invoiced as a Checkout settlement - its own category in Collections, not an
-- additional charge. Invoices already numbered keep their numbers.
--
-- Safe to run again.
-- ===========================================================================

create or replace function public.invoice_category_code(invoice_type text)
returns text
language sql
immutable
as $$
  select case invoice_type
    when 'rental' then 'RP'
    when 'charge' then 'AC'
    when 'checkout' then 'CS'
    else 'IP'
  end
$$;
