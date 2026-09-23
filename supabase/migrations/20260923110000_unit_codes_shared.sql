-- ===========================================================================
-- One shared sequence of unit codes again: U001, U002, ... across every
-- residence.
--
-- Migration 24 gave each residence its own letter, so The Arc numbered A-001
-- and Solstice would have started again at S-001. That was tidier, but the
-- Uxxx codes are already printed on invoices that have gone out, and an
-- invoice quoting U063 has to lead back to a unit called U063.
--
-- So the prefix stays a column - a residence may still need its own one day,
-- and dropping the column would throw that away - but every residence shares
-- 'U' now, and the number counts across all units rather than within one
-- residence. The first new Arc unit after Solstice is U087, not U076.
--
-- The codes already in the database are renamed by revert-unit-codes.sql,
-- which is run by hand and previews before it writes. This migration only
-- settles what NEW units are called.
--
-- Safe to run again.
-- ===========================================================================

update public.residences
set unit_prefix = 'U'
where unit_prefix is distinct from 'U';

comment on column public.residences.unit_prefix is
  'Letter a unit code starts with - U gives U001, and the number counts across every residence. Blank falls back to the first letter of the name.';
