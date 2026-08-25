# Redesign "Why students stay" perks section

## Goal
Make the current 6-card "Why students stay" section feel compact and impactful by collapsing it into a single row, while keeping all six benefit points readable and on-brand.

## Current state
- Section lives in `src/routes/index.tsx` lines 144-166.
- Uses a 3-column / 2-column card grid with large padding, big icons, and multi-line descriptions.
- Background is `bg-brand-tint`; cards use `bg-card` with `shadow-card`.

## Proposed redesign

### Layout
- Convert the 6 benefits into a single horizontal band.
- Desktop: 6 equal columns in one row (`grid-cols-6`).
- Tablet: 3 columns × 2 rows (`sm:grid-cols-3`).
- Mobile: horizontal scroll snap (`flex overflow-x-auto snap-x`) so all 6 items stay in one swipeable row without stacking.

### Card treatment
- Compact cards with small circular icon badges (no large rounded-square icon blocks).
- Title only, or title + one very short word/phrase, dropping the full descriptive sentence to reduce wordiness.
- Remove card borders and shadows; use a clean white card on the existing tinted background, or place icons + text directly on the tinted background with no cards.
- Tighten vertical padding for the section (`py-10` or `py-12` instead of `py-16/20`).

### Visual impact
- Use a subtle top/bottom divider line or a contained rounded container to frame the row.
- Keep the brand green for icon color; use the peach/light-brown accent (`bg-brand-soft` or similar) for icon badge backgrounds.
- Keep the eyebrow "Why students stay" and headline "Everything sorted. Nothing complicated." but tighten spacing above the row.

### Content
Keep the six existing benefit titles, but shorten supporting text to a 3-5 word phrase or remove it entirely if the title is self-explanatory:
- Clear pricing → "No hidden fees"
- Safe & secure → "Secure residences"
- Move-in ready → "Fully furnished"
- 24/7 support → "Always here"
- Close to campus → "Cyberjaya locations"
- Flexible options → "Single or twin"

## Files to edit
- `src/routes/index.tsx`: rewrite the perks section markup and tighten the `perks` copy.
- `src/styles.css`: no new tokens needed; reuse existing brand/soft/tint tokens.

## Acceptance criteria
- [ ] Section displays as a single compact row on desktop.
- [ ] Mobile uses horizontal swipe without excessive vertical space.
- [ ] All six benefits remain visible/accessible.
- [ ] Design stays on-brand with green + peach/light tones.
