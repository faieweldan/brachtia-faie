# One enquiry flow on the residence page

Today the residence page has two competing lead forms: a short "Enquire now" dialog and a separate "Get your quote" form used only to unlock the PDF. Plus a standalone Apply page. This merges everything into a single Enquiry form ("Check Availability"), and makes the PDF quote the reward for submitting it.

## The journey

```text
Room table: pick room + Single/Twin, set move-in / move-out
        |
Calculator: shows monthly rate, add-ons, first-time payment
        |
[ Check Availability ]  <- primary CTA (green, full width)
        |
Enquiry form (one dialog)
  - Your stay: room, occupancy, dates, estimated cost  (editable/prompted if missing)
  - Your details: name, university, intake, nationality, gender, email, mobile
        |
Success screen inside the dialog
  - "We'll confirm availability within 24 hours"
  - [ Download quotation (PDF) ]  [ WhatsApp us ]
```

Secondary CTA under the primary: **Book a Viewing** (outline button, links to the existing booking page).

## Key rules

- Check Availability and Enquire are the same action, one label: **Check Availability**.
- The quotation PDF is only reachable after the enquiry is submitted. The standalone "Download quote (PDF)" button is removed from the calculator.
- The enquiry always carries the calculator selections: residence, room type, occupancy, move-in/move-out, stay length, rate type (12-month vs short-term), payment term, bedding add-on, monthly rent, first-time payment total.
- If the student hasn't picked a room/occupancy or dates before clicking Check Availability, the form prompts for them at the top instead of blocking: room type + occupancy dropdowns and the two date fields, pre-filled when known and validated as required.
- One form only — no separate "Apply for a room".

## Enquiry form fields

Stay section (top): Residence (fixed), Room type, Occupancy, Move-in, Move-out — all required.
Details section (per the attached reference): Full name; University + Intake; Nationality + Gender; Email + Mobile/WhatsApp; optional Message.
Validation with zod, inline errors, same rounded input styling as the reference.

## Technical notes

- New `src/components/site/EnquiryDialog.tsx` replaces both `EnquireDialog.tsx` and `QuoteDetailsDialog.tsx` (both deleted). It owns: stay fields, lead fields, zod schema, submitted state, and post-submit PDF/WhatsApp actions.
- `StayCalculator.tsx`: drop the internal `QuoteDetailsDialog` + download button; expose its computed quote state to the dialog so the PDF can be generated after submit using the existing `src/lib/quote-pdf.ts` (extended with the lead's stay selections).
- `properties.$slug.index.tsx`: calculator `actions` render Check Availability (primary) + Book a Viewing (secondary). Room-table selection state is passed into the dialog so it can prompt for missing values and write back the chosen room/dates.
- Remove `src/routes/apply.tsx` and any "Apply" links in the header, footer and CTA band; those point to residences / Check Availability instead.
- Submission stays front-end only for now (toast + success state), matching the current sample-data setup.
