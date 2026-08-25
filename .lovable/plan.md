# Stay calculator on the residence page

Move the stay/cost calculator onto each residence page so students can price a stay without leaving the page.

## What changes

1. **Placement** — the calculator sits in the right sidebar of the residence page, directly under the "Rooms from RM xxx / Enquire now / Book a viewing / WhatsApp" card, and sticks with the sidebar as the page scrolls.

2. **Room selector** — a new "Room type" dropdown at the top of the calculator lists every room type at that residence, labelled with its operational tag and name plus its lowest rate (e.g. "Room A — Standard Single · from RM 750/mo"). Changing the room re-prices everything below it. Defaults to the cheapest available room type.

3. **Existing behaviour is kept** — Single / Twin sharing toggle (only shown when that room offers both), move-in and move-out date pickers, auto-detected 12-month vs short-term rate, pro-rated rent schedule, "Total rent for stay", and the "Due before move-in" breakdown with the total to pay now.

4. **Actions** — under the breakdown, an "Enquire with these dates" button opens the existing enquiry dialog pre-filled with the selected room type, occupancy and dates.

5. **Room detail page** — keeps its own calculator, unchanged, locked to that room (no selector there).

6. **Mobile** — on narrow screens the sidebar stacks below the content as it does today, so the calculator appears after the room options; layout and spacing stay compact.

## Technical notes

- `StayCalculator.tsx` gains an optional `rooms` prop; when passed it renders a room-type `Select` and manages the selected room in state, resetting occupancy and default move-in date on change. When omitted it behaves exactly as now.
- `properties.$slug.index.tsx` renders `<StayCalculator property={property} rooms={getRoomTypes(property.slug)} />` inside the existing `<aside>`, below the pricing card, and passes the `actions` render-prop that mounts `EnquireDialog`.
- No data model or pricing-logic changes; `stayQuote`, `termForRange` and `rentFor` are reused as-is.
