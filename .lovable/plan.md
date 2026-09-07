# Simpler Appointment Manager Settings

Rebuild the Settings tab into the four plain sections from the reference, and drop everything an admin never needs to touch.

## 1. Appointment Types

- Table with two columns: Appointment Type (text) and Duration (mins, number), plus a trash icon at the end of each row instead of the word "Remove".
- "+ Add Appointment Type" adds a new editable row.
- Hidden from the screen (kept working behind the scenes): the colour used on the calendar (assigned automatically from the brand palette), the online-bookable flag for the two viewing types, and sort order.

## 2. Weekly Availability

- One row per day, Monday to Sunday.
- Each day shows its time ranges as chips (e.g. `9:00 AM – 1:00 PM`), so a lunch break is simply two ranges. A day with none reads "Unavailable".
- "+ Add hours" adds a range to that day; clicking a chip edits it; each chip has a small remove control.
- A single "Save Availability" button saves the whole grid.

## 3. Booking Capacity

- "Capacity 1 — Primary" always exists and uses the Weekly Availability above.
- "+ Add Capacity" creates Capacity 2, 3… each with its own day/hours grid (same chip UI) and a Remove link.
- Meaning: two capacities covering the same time means that timeslot accepts two appointments. Students still see one timeslot, never two calendars.

## 4. Blocked Dates & Times

- "+ Block Date or Time" opens a small inline form: Date, Entire day or Specific time, From/To when specific, and an optional Reason.
- Table below lists Date / Blocked ("All day" or "12:00 PM – 2:00 PM") / Reason with a trash icon.

## Removed from this screen

Slot interval, buffer, capacity number per rule, per-type and per-residence availability selects, the Active checkboxes, and the Slot preview block. Availability now applies to all residences and all types; the appointment type's duration alone decides how long a booking runs.

## Scheduling logic

Available slots = Weekly Availability + additional capacities − existing appointments − blocked times. Start times step by the selected appointment type's duration; a slot stays offered while the number of appointments on it is below the number of capacities covering that time.

## Technical notes

- Migration: add `capacity_group int not null default 1` to `availability_rules`; add nullable `start_time` / `end_time` to `blocked_dates`. Existing rows keep working (group 1, all-day blocks).
- `availability_rules` keeps one row per (capacity_group, weekday, time range); `slot_minutes`/`buffer_minutes`/`capacity`/`mode`/`type_slug`/`residence_id` stay in the table but are written as defaults and no longer edited.
- `src/lib/slots.ts`: `buildSlots` computes capacity per start time as the count of covering rules across capacity groups, and subtracts blocked time windows (partial-day blocks, not just whole days).
- `src/lib/public.functions.ts` (`fetchDaySlots`) and `src/lib/viewings.server.ts` drop the type/residence rule filtering and honour partial-day blocks.
- `src/lib/admin.functions.ts`: add a `saveAvailabilityGrid` server function that replaces all rules for one capacity group in a single call (used by "Save Availability"), plus `deleteCapacityGroup`; `saveBlockedDate` accepts optional start/end times.
- `src/routes/admin.appointments.settings.tsx` rewritten around four cards; local draft state for the availability grid, saved on demand rather than on blur.
