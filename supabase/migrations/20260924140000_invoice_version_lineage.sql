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

-- one index, doing both jobs: it refuses two rows claiming the same version of
-- a lineage, and it is the order the version list is read in
create unique index if not exists invoice_versions_root_version_idx
  on public.invoice_versions (root_invoice_id, version);

drop index if exists public.invoice_versions_root_idx;

-- ---------------------------------------------------------------------------
-- Every invoice already raised becomes a version of its lineage.
--
-- Not literally what was first issued on one that has since been edited - that
-- was painted over before any of this existed. It is the earliest still in the
-- system, which is the honest baseline, and the next change reads as /1.
--
-- An invoice cancelled and reissued is not a second document: A, then B
-- replacing it, then C replacing B are three rows of one story. They are
-- numbered 1, 2, 3 against the first of them, in the order they were raised -
-- numbering each against itself gave two rows both claiming to be version 1 of
-- the same lineage, which is what this migration got wrong the first time.
--
-- A lineage that already has versions is left alone, so running this after the
-- app has been recording its own changes nothing.
-- ---------------------------------------------------------------------------

with recursive lineage as (
  -- an invoice that replaces nothing is the start of its own story
  select i.id, i.id as root
  from public.invoices i
  where i.replaces_invoice_id is null
  union all
  -- and anything replacing one carries that story's root forward, however deep
  select i.id, l.root
  from public.invoices i
  join lineage l on i.replaces_invoice_id = l.id
),
numbered as (
  select
    i.*,
    l.root,
    row_number() over (partition by l.root order by i.created_at, i.id) as version_no
  from public.invoices i
  join lineage l on l.id = i.id
)
insert into public.invoice_versions
  (invoice_id, root_invoice_id, version, number, document, total, issued_as)
select
  n.id,
  n.root,
  n.version_no,
  coalesce(n.number, ''),
  jsonb_build_object(
    'number', n.number,
    'issued_at', n.issued_at,
    'invoice_date', n.invoice_date,
    'payment_terms', n.payment_terms,
    'full_name', n.full_name,
    'email', n.email,
    'phone', n.phone,
    'university', n.university,
    'nationality', n.nationality,
    'residence_name', n.residence_name,
    'room_name', n.room_name,
    'occupancy', n.occupancy,
    'tenancy_start', n.tenancy_start,
    'tenancy_end', n.tenancy_end,
    'monthly_rent', n.monthly_rent,
    'payment_frequency', n.payment_frequency,
    'total', n.total,
    'deposits_total', n.deposits_total,
    'notes', n.notes,
    'list_rent', n.list_rent,
    'discount_type', n.discount_type,
    'discount_value', n.discount_value,
    'discount_note', n.discount_note,
    'show_terms', n.show_terms,
    'next_payment_date', n.next_payment_date,
    'next_payment_amount', n.next_payment_amount,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', it.label, 'kind', it.kind, 'amount', it.amount, 'quantity', it.quantity
      ) order by it.sort_order, it.created_at)
      from public.invoice_items it where it.invoice_id = n.id
    ), '[]'::jsonb)
  ),
  coalesce(n.total, 0),
  'backfilled'
from numbered n
where not exists (
  select 1 from public.invoice_versions v where v.root_invoice_id = n.root
);
