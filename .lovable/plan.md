# The Arc — room options rebuild, filters, image carousel

Three changes, all on The Arc residence page (data model changes apply to both residences).

## 1. Room data matches your table exactly

The Arc gets 7 room types, replacing the current 5:

| Unit type | Room | Website name | Size | Bathroom | View | Single | Twin (per pax) |
|---|---|---|---|---|---|---|---|
| 3-Bedroom | A | Room A – Ensuite (with View) | 105 sq ft | Private Ensuite | Yes | RM1,050 | RM550 |
| 3-Bedroom | B | Room B – Standard (with View) | 105 sq ft | Shared | Yes | RM850 | RM450 |
| 3-Bedroom | C | Room C – Standard Small | 90 sq ft | Shared | Internal facing | RM750 | RM400 |
| 4-Bedroom | A | Room A – Standard (with View) | 105 sq ft | Shared | Yes | RM800 | RM450 |
| 4-Bedroom | B | Room B – Standard (with View) | 105 sq ft | Shared | Yes | RM800 | RM450 |
| 4-Bedroom | C | Room C – Standard Small | 90 sq ft | Shared | Internal facing | RM700 | RM400 |
| 4-Bedroom | D | Room D – Standard Small (with View) | 90 sq ft | Shared | Yes | RM800 | RM450 |

4-Bedroom Room A and Room B stay as separate cards (different layouts).

Short-term rates apply to 3-Bedroom units only — Room A RM1,200 / RM650 pax, Room B RM950 / RM550 pax, Room C RM850 / RM500 pax. All 4-Bedroom rooms are 12-month only, and the short-term toggle/pricing simply won't offer them.

The full price list table on the page and the stay calculator both read from this same data, so every number on the page agrees.

## 2. Filters above the room options

A filter bar with three pill groups, exactly as your reference:

- Apartment: All / 3-Bedroom / 4-Bedroom
- Bathroom: All / Ensuite / Shared
- View: All / With View

Filters combine, update the list instantly, show a count ("5 of 7 room types"), and have a "Clear filters" link plus a friendly empty state. Selections are kept in the URL so a filtered view can be shared or survives a refresh.

## 3. Bigger room images with a swipeable carousel

Each room card gets a larger image panel (roughly 40% of the card width on desktop, full-width on mobile) with:

- Multiple photos per room type, swipeable on touch and arrow-navigable on desktop
- Dot indicators over the image, like your reference
- Same carousel reused on the room detail page gallery

Placeholder photos stay in place for you to swap later.

## Backend-readiness

Each room type carries the exact fields from your admin schema — property, unit_type, room_code, display_name, size_sqft, bathroom_type, has_view, view_type, single_allowed, single_price, twin_allowed, twin_price_per_person, availability_status, public_visible — so the future admin panel maps 1:1 onto what the site renders. Rooms marked not publicly visible are hidden from the site.

## Technical notes

- `src/data/properties.ts`: `RoomType` extended with `roomCode`, `sizeSqft`, `bathroom: "ensuite" | "shared"`, `hasView`, `viewType`, `publicVisible`; `rent.short` set to `null` for all 4-Bedroom rooms. `tag` stays as the admin operational label (Room A/B/C/D) and is no longer unique across unit types, so ids become `arc-3br-a`-style.
- New `src/components/site/RoomFilters.tsx`; filter state via TanStack `validateSearch` with `fallback()` on `/properties/$slug/`.
- New `src/components/site/RoomGallery.tsx` (embla via existing shadcn carousel) used by `RoomTypeCard` and the room detail page.
- `RoomTypeCard` layout reworked for the larger image panel and a feature-chip row; `StayCalculator` room selector labels updated to include unit type since tags repeat.
