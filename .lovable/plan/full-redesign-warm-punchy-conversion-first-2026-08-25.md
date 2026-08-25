# Full redesign: warm, punchy, conversion-first

Drop the forest-green / Space Grotesk look entirely. Rebuild the site around the "Warm Converted" hero direction you picked: warm cream background, coral-orange CTAs, near-black stone text, Plus Jakarta Sans, big rounded cards and pills. Cut the copy everywhere.

## 1. New visual system

- Palette (replaces all green tokens in `src/styles.css`): cream page `#FFFAF5`, white cards, stone-900 text, stone-600 body, coral-orange `#EA580C` primary CTA, soft orange tint for pills/badges, WhatsApp green kept only as the WhatsApp icon.
- Type: Plus Jakarta Sans for everything (400–800), loaded via `<link>` in the root route. Extrabold tight-tracking headings, medium body. No serif, no display/body split.
- Shape: pill buttons and chips, 2rem–2.5rem card radii, soft warm shadows, no hard borders.
- Applied across header, footer, home, properties, property detail, room pages, forms and the enquiry modal.

## 2. Landing page rebuilt

Structure follows the chosen direction, top to bottom:

1. Hero — location pill, two-line headline ("Student Living / Where You Belong."), one-line subhead, framed image card with a Google-rating chip top-left and "2 properties available" chip bottom-right, then "Explore Homes" (coral) + "WhatsApp Us" (white outline).
2. Trust strip — 4 short stats (Since 2009 · 80+ properties · 24/7 warden · 500+ students).
3. Properties — the 2 property cards, price-from, 3-word feature chips.
4. Why students choose us — 6 icon tiles, each max 8 words. No paragraphs.
5. Google reviews — kept, tightened to a 3-card row + rating summary.
6. How it works — 3 steps: Pick a room → Enquire → We confirm.
7. Final CTA band — one line, one button, WhatsApp link.

The About paragraphs move off the home page to `/about`. Every remaining sentence on home is trimmed to one line.

## 3. Pricing panel: one control set, not two toggles

Replace the two mismatched pill toggles with a single compact "Your stay" card:

- Occupancy as a small equal-width segmented control (Single / Twin sharing), shown only when both exist.
- Move-in date and move-out date pickers side by side.
- Contract term is no longer a toggle — it is derived from the dates (6+ months = 12-month rate, under 6 months = short-term rate) and shown as a read-only chip with the rate used, so students can't pick a mismatched combination.
- Below it, a single itemised total: pro-rated first month, full months, pro-rated last month, deposits and one-time fees, then "Total due before move-in" and "Monthly thereafter".

Pro-rata is daily: monthly rent ÷ days in that calendar month × days stayed, applied to both partial months. Full months in between charge the full rate.

## 4. Room A / B / C tagging

Each room type keeps its operational tag (Room A, Room B, Room C …) exactly as admin uses it. The tag is shown as a small mono chip next to the room-type name on the property page, the room-type card, the room detail header and inside the enquiry modal and its WhatsApp message, so enquiries map straight to your ops labels.

## 5. Copy pass

Every heading and body line rewritten short and concrete: no "we take pride in offering top-notch property management services". Feature tiles become label + one short line. Room pages lead with price, occupancy, availability date, then features as chips.

## Technical notes

- `src/styles.css`: full token replacement (oklch), `--font-sans` and `--font-display` both Plus Jakarta Sans; `brand`, `brand-soft`, `brand-deep`, `gold`, `accent-warm` remapped to the warm scheme so existing class names keep working.
- `src/data/properties.ts`: add `tag: string` to `RoomType` (Room A/B/C…), add a `proRate(rent, from, to)` helper and extend `costBreakdown` to accept a date range and return pro-rated lines. Term selection derived from the range.
- `SegmentedToggle` restyled to one size only; term toggle removed from the pricing card.
- New `StayCalculator` component used by both the room detail page and the property pricing table.
- Hero image uses an existing asset for now; you can swap it later.
