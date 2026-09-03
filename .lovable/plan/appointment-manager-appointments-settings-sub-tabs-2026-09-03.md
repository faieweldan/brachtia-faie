# Appointment Manager: Appointments + Settings sub-tabs

Split the Appointment Manager into two sub-tabs, add calendar/list views, admin-created appointments, per-type durations and colour coding.

## Sub-tab 1: Appointments

- Toggle between **List** and **Calendar** view (month grid; each day shows coloured appointment chips, clicking one opens the detail drawer).
- Filters: appointment type (Viewing in person, Virtual tour, Check-in, Check-out, plus any custom "Others" type), residence, status, and date range.
- Each appointment shows a colour dot/chip matching its type colour.
- **New appointment** button opens a form: type, residence, mode (in person / virtual), date + time (choose from generated slots or enter a custom time), duration (pre-filled from the type, editable), guest name, email, phone, university, notes, status.
- Detail drawer: edit any field, change status (Pending / Confirmed / Completed / Cancelled / No-show), add internal notes, delete.
- Website "Book a Viewing" bookings keep being tagged `viewing-in-person` / `viewing-virtual` so they show with the right label and colour.

## Sub-tab 2: Settings

- **Appointment types**: table of types with name, colour picker, default duration (e.g. Viewing 30 min, Check-in 40 min), bookable-online toggle, active toggle, sort order. Add new custom types ("Others"). Only bookable-online types appear on the public booking page.
- **Daily availability**: per weekday start/end time, base slot interval, buffer between appointments, and capacity per slot. Optional residence-specific override; otherwise "All residences".
- **Blocked dates**: add/remove dates (holidays, one-offs) with a reason, all residences or one.
- Live preview of the slots a given weekday/type combination generates.

## Slot logic

Availability rules define the working window, interval, buffer and capacity. The slot length used for a booking comes from the appointment type's duration, so a 40-minute check-in blocks the right amount of time while a 30-minute viewing does not. The public Book a Viewing page keeps using the viewing type's duration.

## Technical notes

- Routes: `src/routes/admin.appointments.tsx` becomes a layout with tabs and `<Outlet />`; new `admin.appointments.index.tsx` (list/calendar) and `admin.appointments.settings.tsx`.
- Migration: add `type_slug` (nullable, meaning "any type") to `availability_rules` so a rule can be scoped per type; no other schema change needed — `appointment_types.duration_minutes` and `.color` already exist, as do `availability_rules` and `blocked_dates`.
- Server functions in `src/lib/admin.functions.ts`: reuse `listAppointments`, `saveAppointment`, `deleteAppointment`, `saveAvailabilityRule`, `deleteAvailabilityRule`, `saveBlockedDate`, `deleteBlockedDate`, `saveAppointmentType`; add `deleteAppointmentType` and a slot-preview helper.
- `src/lib/slots.ts` gains an optional `durationMinutes` argument so type-specific lengths are honoured; `fetchDaySlots` in `src/lib/public.functions.ts` and `bookAppointment` read the duration from the matching appointment type instead of the hard-coded 30.
- List/calendar view state and filters live in URL search params so the view survives refresh.
- Styling follows the existing minimal admin surface (white cards, brand-tint accents); type colours are stored hex values rendered as dots/chips.
