# Mobile UI/UX optimisation

Goal: make every public page feel designed for a phone first — fewer cramped rows, clearer pricing, less endless scrolling, and an always-reachable next step. Desktop layouts stay as they are.

I checked each page at 390px width. Nothing overflows horizontally, but several blocks are laid out for desktop and squeezed down.

## What gets fixed, page by page

### Residence page (biggest problem area)
- **Rooms & pricing table**: on mobile the two price boxes appear with no labels, so it is not obvious which is single and which is twin sharing. Each price gets a small "Single" / "Twin sharing" label above it, and unavailable occupancy shows as a muted "Not available" tile instead of a gap.
- Room names currently truncate mid-word ("Room D – Standard Small (wit…"). Names wrap to two lines on mobile; the "View details" link moves under the name so the tap target is not squeezed.
- Room rows get tighter vertical padding and a larger thumbnail, so more of the list is visible per screen.
- **Filter bar**: "Filter · Ensuite · Exterior view · 7 of 7 room types" is cramped on one line. On mobile it becomes a labelled row of two pill toggles with the result count directly beneath, left aligned.
- **Date inputs**: keep stacked, but the helper text and section spacing tighten so the filter card is not taller than the rooms it filters.
- **Sticky header overlap**: scrolling to a section or room currently hides its heading behind the fixed header. Add scroll offset so headings land below the header.
- **Sticky mobile action bar**: a slim bottom bar appears once the user scrolls past the hero, showing the selected room's price (or "Check availability") plus a WhatsApp button. Hidden on desktop and when the enquiry dialog is open.
- **Calculator card**: reduce inner padding on mobile, and let the "Check Availability" / "Book a Viewing" buttons sit full width with a clearer primary/secondary contrast.
- **Amenity + location sections**: keep collapsibles, but reduce section top/bottom spacing so the page is materially shorter.

### Home
- Stats row renders 3 items in a 2-column grid, leaving an orphan. Change to a single scrollable row of 3 compact stats on mobile.
- University marquee cards are clipped hard at both edges; add soft edge fades so it reads as a scrolling strip rather than a cut-off card.
- Reduce section padding between the eight home sections on mobile and slightly reduce the hero heading size so the CTAs sit higher.

### Contact
- The four contact cards (WhatsApp, Email, Call, Office) each take a full-width row. On mobile they become a 2-column compact grid, with WhatsApp kept full width as the primary action.
- "Who we work with" cards get tighter padding, icon and title on one line, and shorter visual rhythm so the list scans faster.

### Book a viewing
- The "Checked room availability yet?" prompt shrinks into a compact inline banner instead of a tall card.
- Mode tiles (In person / Virtual) become a 2-column choice on mobile instead of two stacked full-width blocks.
- Calendar sizing tuned for 390px (touch-friendly day cells, no horizontal squeeze), and the empty "Available times" area shows a clearer prompt.
- Form field spacing tightened; the submit button becomes sticky at the bottom of the form area on mobile.

### Properties list & About
- Property cards: tighter padding, price line and CTA on one row.
- About hero: reduce top spacing and heading size on mobile; stats band becomes a 2-column grid with even cells.

### Global
- Consistent mobile section rhythm (one shared vertical spacing scale) so pages stop alternating between very tight and very airy blocks.
- Minimum 44px tap targets on links currently rendered as small text ("Show more", "View details", "I'd rather view first").

## Technical notes
- Purely presentational: Tailwind class changes in `src/routes/*.tsx` and `src/components/site/*`. No data, server function, or schema changes.
- Follow the responsive pattern already used in the project (`grid-cols-[minmax(0,1fr)_auto]`, `min-w-0`, `shrink-0`, `truncate`) for mixed text/widget rows.
- Sticky mobile bar is a new small component under `src/components/site/`, rendered only on the residence route and hidden at `md:`.
- Scroll offset via `scroll-mt-*` on section anchors.
- Admin routes are out of scope.
- Verification: re-screenshot every public page at 390px and 430px after the changes.
