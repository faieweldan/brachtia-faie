# Modern refresh + room types instead of units

Three changes: a modern visual system, room *types* (not individual units) with an enquiry flow, and an occupancy toggle alongside the term toggle on the cost breakdown.

## 1. Visual refresh

Keep the forest-green brand identity but modernise it:

- Refined palette: deeper, cleaner green primary with a bright accent for CTAs (in the reference the CTA is a warm accent against the brand colour) plus a soft tint surface, neutral warm-grey text scale, and a clear card/border system. All tokens stay in `src/styles.css` as oklch.
- Typography: drop the serif display look. Move to a contemporary geometric/grotesk pair (headings in a tight modern sans, body in a highly legible sans), loaded via `<link>` in the root route.
- Component language borrowed from the references: rounded 12–16px cards, generous whitespace, light shadow instead of heavy borders, pill badges with icon chips, sticky right-hand booking card on desktop and a sticky bottom bar on mobile, hero gallery as a large image plus a stacked thumbnail column.
- Applies across header, footer, home, properties list, property detail, room pages and forms.

## 2. Rooms become room types

Students browse and enquire by room *type*, never a specific unit number.

- Data: replace the per-unit `rooms` list with `roomTypes` per property — e.g. Single Room, Twin Sharing, Master with En-suite, Studio. Each type carries: name, description, photos, features (en-suite, air-con, desk & wardrobe), size, occupancy options, 12-month and short-term rent, availability-from date, and an "enquire" state. Unit numbers, gender-of-unit and per-bed status are removed from the public site.
- Property detail gets a "Room Options" section styled like the reference: photo on the left, type name, feature chips, availability date, price with "per month", and an Enquire button per type.
- Room type detail page (`/properties/$slug/rooms/$typeId`) keeps the current layout: gallery, description, features, sticky price/CTA card, and the upfront cost breakdown.

## 3. Enquiry flow

- An "Enquire now" modal, matching the reference: small thumbnail plus property/room-type/price header, then first name, last name, email, phone, message, and preference fields (occupancy, term, move-in date). Submitting shows a confirmation ("our team will reach out by email or WhatsApp") — nothing is stored yet, ready for the admin backend later.
- The modal is reachable from every room-type card, the room-type page and the property page. WhatsApp stays as a secondary CTA. The existing Apply and Book a Viewing pages stay and reuse the same field set.

## 4. Occupancy + term toggles on pricing

- The sticky pricing card gets two toggles: 12-month / Short-term (existing) and Single / Twin sharing (new), shown only when the room type offers both.
- Rent, and the whole upfront costs & deposits table, recompute live from the selected combination using the existing `costBreakdown` helper — no logic change, just an extra input.
- Same toggles drive the property-level pricing tables so the numbers agree everywhere.

## Technical notes

- `src/data/properties.ts`: `Room` type replaced by `RoomType` with `rent: Record<ContractTerm, Record<Occupancy, number | null>>`; helpers `getRoomTypes`, `getRoomType`, `priceFrom`, `availableCount` updated. Shape stays API-ready.
- New `src/components/site/EnquireDialog.tsx` (shadcn dialog) and `RoomTypeCard.tsx`; `RoomCard.tsx` retired.
- Route file renamed to `properties.$slug.rooms.$typeId.tsx`.
- Fonts via root-route `<link>`, families registered in `@theme`; no URL `@import` in CSS.
- Existing placeholder photos stay in place for you to swap later.
