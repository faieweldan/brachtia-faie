-- ===========================================================================
-- A unit that is no longer let, and the reason why.
--
-- B-13A-01 is not rented any more. Leaving it out of the system altogether left
-- a hole where U028 should be, and a hole explains nothing: the people who knew
-- why move on, and the next person finds a number that simply is not there and
-- has no way to find out whether that is deliberate or a mistake.
--
-- So the unit stays, and carries its own explanation.
--
-- A TIMESTAMP rather than a boolean, because "when" is half the answer. `false`
-- tells a new joiner nothing at all; "deactivated on 23 Sept 2026 because the
-- owner took it back" tells them everything they need without asking anyone.
--
-- Deactivated units are hidden from placement - they are not offered as a room
-- for anybody - but stay visible in Unit setup, greyed, with the reason on the
-- row. Hidden everywhere would recreate the hole this is meant to close.
--
-- Safe to run again.
-- ===========================================================================

alter table public.units
  add column if not exists deactivated_at timestamptz;

alter table public.units
  add column if not exists deactivation_reason text not null default '';

comment on column public.units.deactivated_at is
  'When the unit stopped being let. Null means it is live. Deactivated units are hidden from placement but stay visible in Unit setup.';

comment on column public.units.deactivation_reason is
  'Why it stopped being let, in plain words - the thing somebody needs a year from now.';
