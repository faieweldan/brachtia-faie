# Warm peach accents + a better final CTA

## 1. Swap the light green accents for warm peach

Deep green stays the brand colour (logo, headings, buttons, links). Only the pale green
surfaces — section backgrounds, pills, chips, icon tiles, avatar circles — become a soft
light brown/peach.

Retinted tokens in `src/styles.css`:

- `--brand-tint` → very light peach page-section wash (replaces pale mint on the university
  strip, "Why students stay", "Why Brachtia", feature chips, calculator panels).
- `--brand-soft` → slightly deeper peach for pills, badges and icon tiles.
- `--secondary`, `--muted`, `--accent` → neutral warm greys so cards and inputs sit with the
  peach instead of against it.
- Card/section shadows warmed to match; `--gold` and `--accent-warm` nudged to the same family.

Text on those surfaces switches from `text-brand-deep` green to a warm near-black where it
reads better, so nothing looks like green-on-peach. Component class names stay the same, so
every page picks the new palette up at once.

## 2. Redesign the final CTA box

The full-bleed flat green band becomes a contained, deliberate card:

- A rounded (2.5rem) deep-green panel inset inside the page with generous padding, sitting on
  a peach strip so it reads as a distinct final call rather than a coloured footer.
- Soft radial highlight and a subtle peach glow behind one corner for depth, no flat slab.
- Left column: eyebrow ("Next step"), a tighter headline, one short line of copy, and the
  phone numbers as small pill-shaped chips instead of one long run-on line.
- Right column: stacked full-width CTAs — solid white "Book a Viewing", outlined "WhatsApp" —
  plus a small reassurance line ("Replies within 24 hours").
- Mobile: single column, buttons full width, comfortable spacing.

Same props and links; purely a visual rebuild of `CtaBand.tsx`.

## Technical notes

- `src/styles.css`: retune `--brand-tint`, `--brand-soft`, `--secondary`, `--muted`, `--accent`,
  `--gold`, `--accent-warm` and the two shadow tokens to warm hues (all oklch). No new class
  names needed.
- `src/components/site/CtaBand.tsx`: rebuilt layout; wrapper section gets the peach background
  and the green panel becomes an inner rounded container.
- Spot-check pages that stack peach on peach (home "Why Brachtia" directly above reviews, and
  the CTA band) so the sections still separate cleanly.
