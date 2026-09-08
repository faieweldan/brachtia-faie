# Room table: icon pricing, simpler filters, move-in/out dates, bed choices

## 1. Monthly rate column

Each rate line becomes an icon + price instead of wordy text:

- Single person icon + `RM 1,050`
- Two-person icon + `RM 550`

Compact, aligned, with a tooltip/short caption ("per pax") only where needed. The full wording — "RM 1,050 per month, single occupancy" and "RM 550 per person per month, twin sharing" — moves into the room detail popup, which already has the full rates table.

## 2. Availability column removed

The Availability column and its badges disappear from the table, so the grid becomes: Room · Details · Monthly rate · Select. Availability still shows inside the room detail popup.

## 3. Control bar: dates + term toggle

Above the table: Move-in date and Move-out date fields side by side, plus the existing 12-month / Short-term toggle. Both dates flow into the stay calculator when a room is selected (the calculator's own date fields stay in sync).

## 4. Simplified filters

Replace the four labelled pill groups with one flat row of checkboxes:

Single · Twin Sharing · 3-Bedroom · 4-Bedroom · Ensuite · Exterior View · Corridor View

Behaviour: checkboxes within the same family (occupancy, apartment, bathroom, view) are OR'd; across families they're AND'd. Nothing checked = show all. Result count and "Clear" sit at the right of the same row.

## 5. Bed configuration

Single occupancy bed choice becomes property-specific:

- The Arc — single occupancy: student chooses Single, Queen or King bed
- Solstice — single occupancy: Queen bed only

Shown in the room detail popup as selectable bed options for The Arc (a small pill group) and as a plain "Queen bed" line for Solstice. Twin sharing stays 2 single beds. Bed choice does not change the price; it's captured as a preference and carried into the enquiry.

## Technical notes

- `properties.ts`: add `bedOptions?: string[]` per property (or per room's single occupancy); `bedConfig` returns the list for single occupancy. Filter state moves from single-value keys to arrays; `filterRoomTypes` updated to OR-within/AND-across, and `validateSearch` on `/properties/$slug/` switched to comma-joined array params plus `moveout`.
- `RoomPriceTable.tsx`: new rate cell using lucide `User` / `Users` icons, drop availability column, add move-out input, replace pill groups with a checkbox row.
- `RoomDetailDialog.tsx`: long-form rate wording, bed option selector for The Arc, availability badge retained.
- `StayCalculator.tsx`: accept controlled `moveOut` alongside `moveIn`; internal state remains the fallback.
