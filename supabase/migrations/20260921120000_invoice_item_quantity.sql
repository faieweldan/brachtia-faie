-- How many of a line item there are.
--
-- A charge is often the same thing several times over - two damaged chairs, three
-- months of a fee - and writing it as one lump hides what was actually charged
-- for. The amount stays the price of ONE, and the line is worth quantity x amount.
--
-- Defaulting to 1 means every invoice already raised is worth exactly what it was
-- worth before this column existed.

alter table public.invoice_items
  add column if not exists quantity numeric not null default 1;

comment on column public.invoice_items.quantity is
  'How many, at the unit price in amount. Line total is quantity * amount.';
