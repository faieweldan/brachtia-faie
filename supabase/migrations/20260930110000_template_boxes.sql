-- ===========================================================================
-- Boxes on a PDF template (30 Sept 2026).
--
-- A PDF template - a building's scanned form - has no {{placeholders}} to fill.
-- Instead admin draws a box on the page where each value goes: on the line
-- after "Name :", in the Remarks cell, over a tick box. Each box is saved here
-- with its place on the page, as fractions of the page's width and height, so
-- it lands in the same spot whatever size the page is shown at.
--
-- [{ "id", "key", "kind": "text" | "tick" | "signature",
--    "page", "x", "y", "w", "h" }]
--
-- Safe to run again.
-- ===========================================================================

alter table public.template_versions
  add column if not exists boxes jsonb not null default '[]'::jsonb;
