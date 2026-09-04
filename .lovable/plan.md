# Remove `rent` from the unit CSV template & import

Rent is sourced from the Website module's room types (the Units panel already says "Room types, occupancy and rent come from the Website module, so pricing stays in one place"). The CSV template and bulk-upload rows contradict that by asking the user to type rent per room. Remove the rent column entirely so the template is `residence,unit_no,unit_type,room_letter,room_type_code,occupancy`, and the importer derives rent from the Website room type (the existing `info.rent`) instead of reading a CSV cell.

## File: `src/routes/admin.homes.units.tsx`

1. **Template headers** (line 35)
   - Before: `"residence,unit_no,unit_type,room_letter,room_type_code,occupancy,rent"`
   - After:  `"residence,unit_no,unit_type,room_letter,room_type_code,occupancy"`

2. **Template sample rows** (lines 37–40)
   - Drop the trailing rent value from each of the four rows, e.g.
     `The Arc Cyberjaya,A-12-10,4-bedroom,A,A,twin` (no `,1050`).

3. **Importer** (`importCsv`, lines 187–201)
   - Remove the `rentRaw` line (`const rentRaw = Number(col(row, "rent"));`).
   - In the returned room object, replace
     `rent: Number.isFinite(rentRaw) && rentRaw > 0 ? rentRaw : info.rent,`
     with `rent: info.rent,`
   - Rent now always comes from the Website room type, matching the manual editor behaviour.

## Out of scope
- No changes to the manual unit editor, room type lookup, store, or any other route.
- The per-room "Rent (RM/mo)" text field in the manual editor stays (it lets an admin override a room's rent if needed); only the CSV import no longer accepts a rent column.

## Verification
- `bunx tsgo --noEmit`
- `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/admin/homes/units` → 200
