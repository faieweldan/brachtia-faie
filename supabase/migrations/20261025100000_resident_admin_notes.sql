-- Internal notes on the resident profile - admin only (Dani, 19 Oct 2026).
-- One note per resident. A resident made from a booking starts with a copy of
-- the booking's internal notes; a migrated resident takes Sheet3's "Internal
-- Notes". Never returned by any resident-facing server function.
alter table public.residents add column if not exists admin_notes text not null default '';
