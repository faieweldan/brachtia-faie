-- ===========================================================================
-- Invoice versions that survive a cancel and reissue.
--
-- Cancelling an invoice and raising it again makes a NEW invoice row, pointed
-- at the one it replaces. Numbering versions per row would start the count
-- over at that point, so an invoice cancelled once would show two separate
-- histories of one document, each calling itself the original.
--
-- Versions are numbered against the first invoice in the lineage instead - the
-- root - so a booking's invoice reads as one story however many times it was
-- reissued.
--
-- Safe to run again.
-- ===========================================================================

alter table public.invoice_versions
  add column if not exists root_invoice_id uuid
  references public.invoices(id) on delete cascade;

-- rows written before this belong to their own invoice
update public.invoice_versions
  set root_invoice_id = invoice_id
  where root_invoice_id is null;

alter table public.invoice_versions
  drop constraint if exists invoice_versions_invoice_id_version_key;

create unique index if not exists invoice_versions_root_version_idx
  on public.invoice_versions (root_invoice_id, version);

create index if not exists invoice_versions_root_idx
  on public.invoice_versions (root_invoice_id, version);

-- ---------------------------------------------------------------------------
-- Every invoice already raised becomes its own version 1.
--
-- Not literally what was first issued on one that has since been edited - that
-- was painted over before any of this existed. It is the earliest still in the
-- system, which is the honest baseline, and the next change reads as /1.
-- ---------------------------------------------------------------------------

insert into public.invoice_versions
  (invoice_id, root_invoice_id, version, number, document, total, issued_as)
select
  i.id,
  -- the root of its lineage: the invoice it replaces, or itself
  coalesce(i.replaces_invoice_id, i.id),
  1,
  coalesce(i.number, ''),
  jsonb_build_object(
    'number', i.number,
    'issued_at', i.issued_at,
    'invoice_date', i.invoice_date,
    'payment_terms', i.payment_terms,
    'full_name', i.full_name,
    'email', i.email,
    'phone', i.phone,
    'university', i.university,
    'nationality', i.nationality,
    'residence_name', i.residence_name,
    'room_name', i.room_name,
    'occupancy', i.occupancy,
    'tenancy_start', i.tenancy_start,
    'tenancy_end', i.tenancy_end,
    'monthly_rent', i.monthly_rent,
    'payment_frequency', i.payment_frequency,
    'total', i.total,
    'deposits_total', i.deposits_total,
    'notes', i.notes,
    'list_rent', i.list_rent,
    'discount_type', i.discount_type,
    'discount_value', i.discount_value,
    'discount_note', i.discount_note,
    'show_terms', i.show_terms,
    'next_payment_date', i.next_payment_date,
    'next_payment_amount', i.next_payment_amount,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', it.label, 'kind', it.kind, 'amount', it.amount, 'quantity', it.quantity
      ) order by it.sort_order, it.created_at)
      from public.invoice_items it where it.invoice_id = i.id
    ), '[]'::jsonb)
  ),
  coalesce(i.total, 0),
  'backfilled'
from public.invoices i
where not exists (
  select 1 from public.invoice_versions v
  where v.root_invoice_id = coalesce(i.replaces_invoice_id, i.id)
);
