# Residence page: interactive room table + room detail popup

The room option cards on the residence page are replaced by a single interactive price list. Students filter, compare, pick a move-in date, open a room detail popup, and send their choice to the stay calculator.

## 1. The interactive price list

One table per apartment type (3-Bedroom, 4-Bedroom), with a control bar above:

- Move-in date field (single date, shared by the whole table)
- Occupancy pills: All / Single / Twin sharing
- Existing bathroom and view filters, kept in the same bar
- Result count and "Clear filters"

Each row shows:

| Room | Size / view | Monthly rate | Availability | Select |
|---|---|---|---|---|
| Room name + bathroom chip | 105 sq ft, exterior view | RM1,050/mo single · RM550/mo per pax twin | Available / 2 spots left / Waitlist, plus "Available from 1 Sep" | Select button |

- When Single or Twin is chosen, the rate column collapses to that one price and rooms without that occupancy are hidden.
- Availability reacts to the chosen move-in date: rooms whose available-from is later are marked "From 1 Oct" in amber rather than plain "Available".
- The whole row is clickable and opens the room detail popup; the Select button is separate and doesn't open it.
- Selecting a room highlights the row, sends the room, occupancy and move-in date into the stay calculator, and scrolls to it.
- Short-term rates: the existing 12-month / short-term toggle stays above the tables and switches the rates shown; 4-Bedroom tables disappear on short-term as they are 12-month only.

Discoverability cues so clicking feels obvious: row hover lift, a small thumbnail of the room at the start of each row, an image-count chip, and a "View details" affordance on the room name.

## 2. Room detail popup

Opens over the page with:

- Image carousel (existing swipeable gallery) with dot indicators and thumbnail strip
- Room name, apartment type, availability badge
- Fact chips: size in sq ft, bathroom (private ensuite / shared), view (exterior / corridor / internal facing), air-conditioning, furnishing
- Bed configuration: single = 1 single bed; twin = 2 single beds, per-pax pricing shown next to each
- Pricing block: 12-month and short-term rates for both occupancies, with unavailable combinations shown as not offered
- What's in the room (features list) and what's shared in the apartment
- Footer actions: "Use this room in the calculator" and "Enquire"

## Data

`RoomType` gains a few descriptive fields so the popup has real content rather than repeated copy: bed configuration per occupancy, furnishing notes, and an explicit view label (Exterior view / Corridor view / Internal facing). Sample values filled in for both residences; photos stay as current placeholders for you to swap later.

## Technical notes

- New `src/components/site/RoomPriceTable.tsx` (grouped tables, filter bar, move-in date, row selection) and `src/components/site/RoomDetailDialog.tsx` (shadcn Dialog + existing `RoomGallery`).
- `RoomTypeCard.tsx` is removed from the residence page; the room-options section and the old "Full price list" section merge into one.
- Filter state stays in the URL via the existing `validateSearch` schema on `/properties/$slug/`, extended with `movein`.
- `StayCalculator` gains an optional controlled `moveIn` prop so the table's date and occupancy flow into it; internal state remains the fallback.
- `properties.ts`: extend `RoomType` with `beds: { single?: string; twin?: string }`, `furnishing?: string[]`, and reuse `viewType` for the view label; add a helper for availability against a chosen move-in date.
