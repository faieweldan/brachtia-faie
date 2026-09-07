# Booking details page

Clicking a row in the bookings table opens a full booking page instead of the side drawer, laid out like the reference: a header strip, Student Details and Stay Details cards fed by the website form submission, room assignment, viewing, documents, internal notes, and a right column with Next Action, Booking Progress and Recent Activity.

## Page layout

Header strip
- Back to Bookings, student name with the blue/pink gender chip, stage pill, "Assigned to …" (staff picker).
- Quote ID and submission date/time.
- Quick facts line: university (abbreviation), move-in, sharing preference, room preference.
- Top-right: WhatsApp, Email, and a "…" menu (download quote, close enquiry with reason).

Student Details (editable)
- Name, gender, phone/WhatsApp, email, nationality, university — exactly the fields the student submitted on the website.
- Edit switches the card into inputs with Save/Cancel.

Stay Details (editable)
- Residence, occupancy, room preference, move-in, move-out, stay duration (calculated), intake, term, monthly rent, first payment, add-ons, "heard about us", and the student's message.
- Same inline Edit/Save behaviour.

Room Assignment
- Room photo, unit and room, occupancy, reserved pill, who reserved it and when — read from the existing room/bed records where a bed is tagged to this booking.
- Change Room opens the existing room picker; when no room is tagged the card shows an empty state with "Assign room".

Viewing
- Shows the linked viewing appointment when one exists (date, time, mode), otherwise "No viewing scheduled yet".
- Book a Time creates/opens the viewing; Generate Booking Link copies a link to the public booking page pre-filled for this student so staff can paste it into WhatsApp.

Documents
- Quote: generates and downloads the existing quotation PDF.
- Invoice and Payment Receipt: shown as cards with a disabled button and "Coming soon", so the layout matches without pretending they work.

Internal Notes
- Free-text box saving to the booking's admin notes.

Right column
- Next Action card: the current next action from the existing pipeline rules, with a short explanation and the primary button (plus a secondary action such as Generate Booking Link where it applies).
- Booking Progress: enquiry submitted, room reserved, viewing, invoice, payment, resident — each with its stored date or a "not yet" line.
- Recent Activity: built from the dates already recorded (submitted, stage changes, viewing completed, invoice issued, fee received) newest first. No new database table.

## Table behaviour

The bookings table stays as it is; clicking a row navigates to the booking page instead of opening the drawer. The drawer is removed.

## Technical notes

- `src/routes/admin.bookings.tsx` becomes a layout rendering `<Outlet />`; the current table moves to `src/routes/admin.bookings.index.tsx`; the new page is `src/routes/admin.bookings.$id.tsx`.
- New server function `getEnquiry` in `src/lib/admin.functions.ts` fetching one enquiry by id; the page also pulls appointments and the local ops store for room/bed data.
- `updateEnquiry` gains the editable student and stay fields (name, email, phone, nationality, university, gender, intake, residence, room, occupancy, term, move-in/out, rent, first payment, message).
- Next action, stage pills, SLA and progress reuse `src/lib/bookings-pipeline.ts` unchanged.
- Booking link = public `/book-viewing` URL with residence, name, email and phone as query parameters, copied to the clipboard.
- Colours use the existing admin palette tokens; no new hardcoded colours.
