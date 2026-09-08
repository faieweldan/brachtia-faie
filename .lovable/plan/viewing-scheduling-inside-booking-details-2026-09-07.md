# Viewing scheduling inside Booking Details

Book viewings straight from a booking, using the timeslots already configured in Appointment Manager, and keep every viewing tied to the booking.

## Booking Details — Viewing card

Before a viewing exists:

```text
Viewing
No viewing scheduled yet.
[ Book a Time ]   [ Generate Booking Link ]
```

**Book a Time** opens a panel inside the card:
- Date picker (calendar, past dates disabled).
- Available Times: the slots for that date, pulled live from Appointment Manager availability (rules, blocked dates, capacity, viewing duration). Changing the date reloads the times. If there are none: "No times available on this date."
- Mode: In person / Virtual (drives which slot set and duration is used).
- Assigned Staff dropdown (Syazwani, Norfadirah, Valsala).
- Cancel / Confirm Viewing.

Confirming creates the appointment in Appointment Manager, pre-filled from the booking (name, email, phone, university, nationality, gender, intake, residence, move-in/out, sharing preference), linked to the booking id, and moves the booking to the Viewing stage.

**Generate Booking Link** creates a one-off link for that student and copies it to the clipboard. The link stays valid until the viewing is confirmed or cancelled; regenerating replaces it.

After a viewing is confirmed:

```text
Viewing                                   CONFIRMED
10 Sep 2026 · 2:00 PM – 2:30 PM
The Arc, Cyberjaya · In Person
Assigned: Syazwani
[ Copy Message ]  [ Add to Calendar ]  [ Reschedule ]  [ Cancel ]
```

- Status pill reflects the appointment status (Pending / Confirmed / Completed / Cancelled / No-show).
- Copy Message copies a ready WhatsApp confirmation message.
- Add to Calendar downloads an .ics file for the slot.
- Reschedule reopens the same date/time panel and updates the existing appointment.
- Cancel asks for confirmation, marks the appointment cancelled and returns the card to the empty state.

## Student-facing link page

A new page at `/viewing/<link>`, styled exactly like the public Book a Viewing page (same header, layout and calendar/time UI), with one difference: the student's details are shown as static read-only text instead of form fields, and their Booking ID is displayed at the top.

- Summary block: Booking ID, name, email, phone, university, residence, move-in — all read-only.
- Select date → available times for that date → confirm.
- Confirmation screen with the date, time, residence and mode. Expired, already-used or unknown links show a friendly message with a WhatsApp contact button.

Slots the student sees are exactly the ones Appointment Manager exposes, so admin and student can never double-book.

## Appointment Manager

Appointments made this way appear like any other, with the assigned staff shown on the row and in the detail drawer, plus a link back to the booking. Cancelling or rescheduling from either side stays in sync because both read the same appointment record.

## Technical notes

- Migration: `appointments.assigned_staff text not null default ''`; `enquiries.viewing_token text` with a unique index. Grants unchanged (admin portal uses the service client).
- New server functions in `src/lib/admin.functions.ts`: `bookViewingForEnquiry` (validates the slot is still free, inserts the appointment with `enquiry_id`, advances the stage), `rescheduleViewing`, `cancelViewing`, `generateViewingToken`.
- New public functions in `src/lib/public.functions.ts`: `getViewingLink({ token })` returning the student's booking summary, and `confirmViewingFromLink({ token, startsAt, mode })`. Both are unauthenticated by design and only expose the student's own name/residence — no other enquiry data.
- Slot generation reuses `fetchDaySlots` / `buildSlots`; no duplicate slot logic.
- Booking Details Viewing card lives in `src/routes/admin.bookings.$id.tsx`, replacing the current "navigate to Appointment Manager" buttons.
- New route `src/routes/viewing.$token.tsx` with its own head metadata and `noindex`.
- .ics generated client-side from the appointment start plus `duration_minutes`.
