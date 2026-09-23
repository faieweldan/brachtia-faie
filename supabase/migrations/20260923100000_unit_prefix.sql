-- ===========================================================================
-- The letter a residence's unit codes start with.
--
-- A unit is known by a code - A-001 for The Arc, S-001 for Solstice. Until now
-- the code was `units.length + 1` counted across EVERY residence, so the
-- numbering was shared: The Arc having 73 units meant the first Solstice unit
-- was handed U074 - the same code The Arc's own 74th unit already had.
--
-- The letter lives on the residence rather than being guessed from its name.
-- Guessing would work today and break on the first residence that shares an
-- initial: "Solstice" and a future "Solaris" would both want S.
--
-- Empty is allowed and means "fall back to the first letter of the name", so a
-- residence added before anyone sets this still gets a sensible code.
--
-- Safe to run again.
-- ===========================================================================

alter table public.residences
  add column if not exists unit_prefix text not null default '';

-- the two that exist today, matched on name because that is all we have to go on
update public.residences
set unit_prefix = 'A'
where unit_prefix = '' and name ilike '%arc%';

update public.residences
set unit_prefix = 'S'
where unit_prefix = '' and name ilike '%solstice%';

comment on column public.residences.unit_prefix is
  'Letter a unit code starts with - A gives A-001. Blank falls back to the first letter of the name.';
