# Book a Viewing form — match the enquiry form, plus new fields

## What changes

**1. Book a Viewing form rebuilt to match the enquiry form**

Same look and structure as the "Check availability" dialog: grouped sections, consistent field height and rounding, inline errors under each field, first invalid field focused on submit.

```text
YOUR DETAILS
Full name              [------------------]
Email                  [------------------]
Mobile / WhatsApp      [🇲🇾 +60 |  number ]

STUDY DETAILS
University (dropdown)    Intake (month & year)
Nationality (searchable) Gender

VIEWING DETAILS
Have you already submitted an availability enquiry?  (dropdown)
How did you hear about us?                            (dropdown)

Anything we should know? (optional)
[ Request viewing ]
```

- Phone becomes the same country-code + number control used in the enquiry form.
- Nationality uses the same searchable country picker.
- The mode toggle, residence picker, calendar and time slots stay exactly as they are.

**2. New dropdown: enquiry status (Book a Viewing only)**

"Have you already submitted an availability enquiry?"
- Yes, I've already enquired
- No, I'd like to view first

Shown in the admin appointment list so the team knows which lead is which.

**3. New field on BOTH forms: "How did you hear about us?"**

University · Google Search · Friend · Agent · Social Media · Other

Choosing "Other" reveals a short free-text box.

**4. Fixed university list on BOTH forms**

MMU · HWUM · UoC · UniMY · Lim Kok Wing · City University · Other

Replaces the current list derived from each residence's nearby universities. "Other" reveals a free-text box.

## Technical notes

- Migration: add `heard_about text` (+ `heard_about_other text`) to `enquiries` and `appointments`; add `enquiry_status text` to `appointments`. All default `''`, no RLS change needed.
- New shared `src/data/form-options.ts` holding `UNIVERSITIES`, `HEARD_ABOUT`, `ENQUIRY_STATUS`, `GENDERS` and the intake month generator, imported by both forms.
- Extract the shared field pieces (`fieldClass`, `FieldError`, phone control) from `EnquiryDialog.tsx` into `src/components/site/form-fields.tsx` so the booking page reuses them rather than duplicating.
- `src/routes/book-viewing.tsx`: replace the plain form markup with the shared components and zod validation mirroring `EnquiryDialog`.
- `src/lib/public.functions.ts`: extend the `appointmentSchema` (nationality, intake, gender, heardAbout, heardAboutOther, enquiryStatus) and `enquirySchema` (heardAbout, heardAboutOther); persist to the new columns.
- Admin: show "How did you hear about us" on the enquiry detail dialog, and heard-about + enquiry status on appointment rows.

Files touched: `src/routes/book-viewing.tsx`, `src/components/site/EnquiryDialog.tsx`, new `src/data/form-options.ts`, new `src/components/site/form-fields.tsx`, `src/lib/public.functions.ts`, `src/routes/admin.bookings.tsx`, `src/routes/admin.appointments.tsx`.
