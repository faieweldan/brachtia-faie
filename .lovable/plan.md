# Quote PDF: terms instead of rent breakdown, RM500 booking fee

## 1. Booking fee wording

- Booking fee becomes **RM500** everywhere (drop "/ USD100"): calculator note and PDF footnote.

## 2. Downloaded quotation (PDF)

- Remove the "Monthly rent breakdown" table and its "Total rent for stay" row entirely.
- In its place, add a **Terms & conditions** section listing the terms configured for that residence by admin (the Terms & fees list in the residence editor), as a numbered list, flowing onto a second page if long.
- Keep everything else: header, prepared-for/lead block, listing details, "Due before move-in" table with the total to pay now, and the footer disclaimer.
- Below the total, keep the one-line note: "A booking fee of RM500 secures your room once availability is confirmed — offset against your first payment."

## 3. Calculator card (on-page)

- Under the "Your first-time payment" total, keep the booking-fee line and add a small, quiet **"Terms & conditions"** link.
- Clicking it opens a popup listing the same residence-configured terms, with a Close action. No change to pricing or layout otherwise.
- The on-page "Monthly rent breakdown" dropdown stays as-is (only the PDF drops it).

## Technical notes

- `src/data/properties.ts`: `company.bookingFee` → `"RM500"`.
- `src/lib/quote-pdf.ts`: delete the schedule autoTable; add a terms autoTable/paragraph block driven by `property.terms`; keep pagination-safe margins.
- `src/components/site/StayCalculator.tsx`: add a Dialog trigger rendering `property.terms`.
