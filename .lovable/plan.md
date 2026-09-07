# Room Assignment — smart matching, unit details, auto twin conversion

Rework the Room Assignment card on the booking detail page so it shows only rooms that genuinely suit the student, lets staff inspect a unit before deciding, and handles the Single-to-Twin conversion automatically.

## What staff will see

Header text under "Room Assignment":
"Showing rooms that match the student's residence, room type, tenancy period, gender and sharing preference."

A single search box (placeholder "Search Unit / Room ID...") with a live match count beside it ("4 matches"). The three dropdown filters are removed — matching is automatic. A small "Show all rooms" toggle stays available for the rare case staff need to override the filter.

Results table columns: ROOM (A-07-01 · Room A), CURRENT CONFIG (Single, or "Twin · 1/2"), ACTION (Select). Clicking the room name opens a details panel showing the unit (residence, unit no, block/floor, unit type, gender, unit notes) and each room in that unit with its beds and current resident (name, university, nationality, tenancy dates) — read from the Homes module data. Select assigns from either the table row or the details panel.

## Matching rules

A bed is a candidate when all hold:
- Residence matches the enquiry's residence.
- Room type matches the requested room (room letter / room type code), when the enquiry names one.
- Gender: the unit's gender is "Any" or equals the student's gender.
- Tenancy period: the bed is free for the requested move-in to move-out window — no booked/active/held tenancy on that bed overlapping the window.
- Sharing preference:
  - Single request: rooms configured Single with the bed free.
  - Twin request: Twin rooms with one bed free, plus completely empty Single rooms (they can be reconfigured).
  - Whole unit: units where every bed is free.

Rooms already reserved for another enquiry are excluded. When nothing matches, the empty state explains which criteria are blocking and offers the "Show all rooms" override.

## Reserving

- Twin request on an empty Single room: the room is converted to Twin (two bed spaces), bed 1 is reserved for this student, bed 2 stays vacant. Confirmation toast states the room was reconfigured to Twin, 1 of 2 reserved.
- Otherwise the chosen bed is held for the student as today.
- Both paths stamp holder name, gender, university, nationality and the move-in date, and advance the stage to Room reserved.
- "Change Room" releases the bed. If that bed came from an auto-converted Single and the twin partner bed is still vacant, the room reverts to Single.

## Technical notes

- All changes in `src/routes/admin.bookings.$id.tsx` plus a small helper set in `src/lib/ops-store.ts` (`convertRoomOccupancy(roomId, occupancy)` and a `bedFreeForPeriod(bed, from, to)` predicate) so the state mutation stays with the store.
- Candidate list built from `allBeds(ops.units)`, filtered by the rules above against the enquiry row (`residence_slug`, `room_name`/`room_code`, `gender`, `move_in`, `move_out`, `occupancy`).
- Unit details panel is a `Sheet`/inline expander using existing `ops.units` data; no new queries.
- Existing palette tokens only; no new colours.
