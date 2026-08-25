# Room options + stay calculator redesign

Cleaner, calmer room browsing and a calculator that leads with the number students care about.

## 1. Room cards — decluttered

- Drop the green "ROOM B" tag chip (the title already says Room B) and drop the "Available from …" line from the card. Availability date moves to the room detail page and the calculator (as the earliest move-in date).
- Keep only one status chip, and only when it means something: "2 spots left" or "Waitlist". Fully available rooms show no chip.
- Bigger, less constricted layout: image panel grows to ~45% width on desktop with generous card padding, and the text column gets more breathing room between title, specs and price.
- Feature chips (size / bathroom / view) become a single light, low-contrast meta line with small icons instead of three filled peach pills.
- Price and actions sit on one clean baseline row: large price on the left, "Details" text link and a single primary "Enquire" button on the right.
- Selection: each card gets a checkbox/tick affordance in the corner. Ticking a room loads it into the stay calculator (and scrolls the calculator into view on mobile), so students can price a room straight from the list. Only one room is selected at a time; the selected card gets a green ring.

## 2. Filters — one tidy bar

Replace the three stacked label+pill rows with a single compact bar:

- Three inline dropdown-style filter buttons (Apartment, Bathroom, View), each showing its current value, wrapping neatly on mobile.
- Result count and a "Clear" link sit at the right of the same bar, appearing only when a filter is active.
- Same URL-backed state as today, so filtered views stay shareable.

## 3. Stay calculator — payment first

Reordered so the decision-making number is at the top:

1. **Room** — reflects the tick from the room list; still changeable via the dropdown (labelled with unit type + room name + from-price).
2. **Occupancy + dates** — single/twin toggle (only when both are offered) and move-in / move-out pickers.
3. **Due before move-in** — moved to the top of the results as the hero block: itemised deposits/fees with the big "Total to pay now" figure, plus the "then RM x/month" line.
4. **Rent schedule** — collapsed behind a "View monthly rent breakdown" dropdown, with the total rent for the stay shown on the collapsed row so it's visible without expanding.
5. **Rate badge** (12-month vs short-term, days) sits as a small line under the dates rather than a large chip.
6. "Enquire with these dates" stays as the closing CTA.

Empty/invalid states (no published rate, move-out before move-in) stay as they are.

## Technical notes

- `RoomTypeCard.tsx`: remove tag chip and availability line, restructure grid to `[minmax(0,45%)_1fr]`, add optional `selected` + `onSelect` props.
- New lifted state in `properties.$slug.index.tsx` holds `selectedRoomId`, passed into `StayCalculator` as a controlled `value`/`onChange` pair alongside the existing `rooms` prop; the room detail page keeps its uncontrolled single-room usage.
- `RoomFilters.tsx` rewritten as an inline bar using the existing shadcn `Select` (or popover pills) instead of three label rows.
- `StayCalculator.tsx`: reorder JSX blocks, wrap the schedule table in shadcn `Collapsible`. No changes to `stayQuote`, `termForRange`, `rentFor` or any pricing data.
