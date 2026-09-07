# Appointment Details popup redesign

Rebuild the appointment popup so it matches the reference layout, and make it behave differently depending on whether the appointment is linked to a booking.

## Header

- Title "Appointment Details" with the status pill beside it (Pending / Confirmed / Completed / No Show / Cancelled).
- Under the title, a small grey line showing the appointment type and mode, e.g. "Viewing (In Person)" or "Virtual Tour".

## Card 1 — Appointment

- Date & time shown as a sentence: "10 Sep 2026 · 2:00 pm – 2:30 pm (30 min)", with a "Reschedule" button on the right that opens the calendar and available times exactly as it does today.
- Below it, four labelled fields in two rows: Residence, Assigned Staff, Status, Linked To.
- Linked To shows "Booking · BRH-2609-0004" with a link to open the booking, or "Not linked" with a "Link Booking / Resident" action that reveals the booking and resident pickers. An "Unlink" action stays available when linked.
- Appointment type and mode pickers move into this card so everything about the appointment sits in one place.

## Linked vs unlinked behaviour

- **Linked to a booking:** an info strip explains person and stay details are pulled from the booking and are read-only. Name, contact, university, move-in, move-out and sharing display as plain read-only text, with "Edit in Booking" / "View in Booking" links to the booking page.
- **Not linked:** the same fields are editable inputs, with an info strip saying person and stay details can be edited.

## Card 2 — Person

- Initials avatar, name in bold, then phone, email and university on their own lines with small icons.
- Editable form version (name, phone, email, university) when the appointment is not linked.

## Card 3 — Stay Requirements

- Move-in, Move-out and Sharing side by side; read-only text when linked, date pickers and a sharing dropdown when not.

## Card 4 — Notes

- "Student notes" and "Internal notes" text areas, both always editable.

## Footer

- Copy Invite, Add to Calendar, then Cancel Appointment (red text) and Save Changes on the right.
- History list stays below the cards when there is any.

## Notes on data

No database changes. Every field already exists on the appointment record; this is a layout and read-only-state change only. Saving, rescheduling history and status-change history keep working as they do now.
