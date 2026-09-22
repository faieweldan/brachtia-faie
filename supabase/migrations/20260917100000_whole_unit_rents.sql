-- ===========================================================================
-- What a whole apartment is let for, per unit type.
--
-- A whole unit is one let of the apartment, not a rate per person, and it is the
-- same rent whichever of that unit type's rooms you look at. So it is kept once
-- against the unit type - { "3-Bedroom Apartment": { "long": 2400, "short": 2800 } }
-- - rather than copied onto each room type, where four copies of one price would
-- drift apart.
--
-- Blank means a whole unit is not offered for that unit type. A particular unit
-- can still be priced differently in Homes.
--
-- Safe to run again.
-- ===========================================================================

alter table public.residences
  add column if not exists unit_rates jsonb not null default '{}'::jsonb;
