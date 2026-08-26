# Rebuild the "How it works" section with new copy, mini-UI illustrations, and new position

## What changes on the landing page

The current dark-green "How it works" band is replaced with a richer version that keeps the immersive look but shows a small visual mock of the real residence-page experience inside each step. The whole section moves up so it sits directly above "Why students stay" (between "Our Residences" and "Why Students Choose Us").

## New copy

- Eyebrow: HOW IT WORKS
- Headline: Book Your Room in 3 Simple Steps
- Sub: Explore your options, see your costs upfront and find the room that works for you.
- Steps:
  1. Find What Suits You — Browse residences and compare room types, prices and stay options.
  2. See Your Costs Upfront — Choose your room, occupancy and dates to instantly see your estimated move-in cost.
  3. Confirm & Reserve Your Room — Once we've confirmed availability, simply pay your booking fee to reserve your place.
- CTA: [ Check Availability ] → `/apply`
- Reassurance: No account needed · Takes about 2 minutes · Availability confirmed within 24 hours*
- Disclaimer: *Subject to availability and complete enquiry details.
- Secondary block: "Prefer to see it first?" — Visit the residence and explore your options in person before deciding. [ Book a Viewing → ] → `/book-viewing`

## Step illustrations (mini replicas of the residence page)

Each glass step card gets a compact, non-interactive UI mock that mirrors the real pages:

1. **Step 1 — Mini room browser**: a scaled-down version of the room price table — a couple of rows with a room thumbnail, room name, and the Single / Twin price tiles (like the airline-style tiles on the residence page), one tile highlighted as "selected".
2. **Step 2 — Mini cost calculator**: a scaled version of the stay calculator — room selector, Single/Twin toggle, move-in/move-out fields, and a highlighted "Estimated move-in cost" figure (e.g. RM 1,650).
3. **Step 3 — Mini confirmation screen**: a card showing "Room Available ✓" with a green check, followed by a "Complete Booking" button row and a small "Booking fee RM 500" prompt.

Built with divs/text (no real interactivity, pointer-events disabled), styled to look like the actual components at miniature scale.

## Design

- Keep the current deep-green immersive band (gradient glows, floating orbs, subtle grid, glass cards, connector line with travelling pulse) — it stays the visual "wow" anchor of the page.
- Step number (01/02/03) and title on top, mini-UI illustration below, then the description line.
- Mobile: steps stack vertically; illustrations scale down gracefully.
- The "Prefer to see it first?" block sits at the bottom of the section as a subtle divider row: text left, outline "Book a Viewing →" button right.

## Files

- `src/routes/index.tsx`: replace the existing steps array + "How it works" section markup with the new copy, mini-UI illustrations, secondary viewing block, and reorder the section above "Why students stay".
- Optionally extract the section to `src/components/site/HowItWorks.tsx` to keep `index.tsx` readable.

## Acceptance criteria

- [ ] Section renders above "Why students stay" with the exact new copy.
- [ ] Each step shows its mini-UI illustration (browser / calculator / confirmation).
- [ ] Check Availability → `/apply`, Book a Viewing → `/book-viewing`.
- [ ] Reassurance line and disclaimer present; dark immersive styling preserved.
- [ ] Mobile layout stacks cleanly.
