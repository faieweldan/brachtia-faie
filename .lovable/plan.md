# Redesign the About page hero

## Goal
Make the About (`/about`) hero cleaner and nicer: the photo fades softly into the beige background (no hard rectangle, no cropped people), the "Explore our residences" button has breathing room, and the stats bar displays fully without overlapping the image or button.

## Current problems (confirmed)
- Hero image is `position: absolute`, full-height on the right; `object-cover` crops people at the right edge and the left person is washed out by a heavy gradient.
- The bottom of the photo meets the next section as a harsh horizontal line.
- The stats bar was translated up to overlap the hero, clipping/blocked the image and the button.
- Button feels cramped against the stats bar.

## New hero design (`src/routes/about.tsx`, hero + stats block)

**Layout — in-flow two-column grid (no absolute image):**
```
+--------------------------------------------------+
|  brand-tint (beige) section, generous padding    |
|                                                  |
|  [ eyebrow ]                  [      photo      ]|
|  [ H1 (2 lines) ]             [  fades at edges ]|
|  [ paragraph ]                [  into beige     ]|
|  [ paragraph ]                [                 ]|
|  [ Explore button ]           [                 ]|
|                                                  |
+--------------------------------------------------+
|  stats bar (white card, shadow, own band)        |
+--------------------------------------------------+
```
- Section: `bg-brand-tint`, `px-4 sm:px-6`, vertical padding `pt-16 sm:pt-24 pb-20 sm:pb-24`.
- Inner grid: `mx-auto max-w-6xl`, `md:grid-cols-[1.1fr_1fr]`, `gap-12 md:gap-16`, `items-center`.
- Left column: eyebrow, H1, two paragraphs, then the button with `mt-8` so it never sits flush against stats.
- Right column (desktop only, `hidden md:block`): the photo in a frame.

**Photo frame — fits + fades:**
- The source photo is a wide landscape group shot (~16:9). Use a frame `aspect-[16/10]` so `object-cover` keeps all six people visible (near-zero crop).
- `object-cover object-center`, `rounded-[1.75rem]`.
- "Fade into background nicely": apply a 4-edge feather mask so the photo's rectangle dissolves into the beige — no hard border. Implemented with an inline `style` `maskImage` (radial + linear edge gradients) plus `-webkit-mask-image` for compatibility. A soft `shadow-lift` sits behind the still-opaque center.
- Add a faint radial beige glow behind the card (`bg-brand-soft/30 blur-2xl`) for depth.

**Mobile:** keep the existing rounded `aspect-[5/4]` card (already works); give it `mt-2` and a small shadow.

**Stats bar — its own band, no overlap:**
- Move out of the hero section into a sibling `<div>` with `bg-brand-tint` and `pb-12 sm:pb-16` + `pt-2`, so it sits below the hero with real spacing (no negative margin, no overlap).
- White rounded-3xl card, `shadow-lift`, 4 columns (`sm:grid-cols-4`), `gap-px bg-border`, each cell `bg-card px-6 py-7`.
- Reduce the following "University partners" section top padding to `pt-16 sm:pt-20` since the overlap is gone.

## Files touched
- `src/routes/about.tsx` — hero section (≈ lines 65-138) and the stats block.

## Verification
- Playwright screenshot at desktop 1280 and a narrow 390 mobile width; confirm via vision check: all six people visible (none cut), edges feathered into beige, button fully visible with margin, stats bar fully shown and not overlapping anything.
