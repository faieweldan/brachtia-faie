-- What the rent includes and excludes, per residence, for the tenancy
-- documents: {"included": [...], "excluded": [...]}. Set in Admin › Website ›
-- Residences › Terms & fees; no default list in code (27 Oct 2026).
alter table public.residences
  add column if not exists rental_terms jsonb not null default '{}'::jsonb;
