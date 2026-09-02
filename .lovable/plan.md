# Reference IDs and admin-side quote copies

Every enquiry gets a short, human-readable reference number, and admin can open or download the exact same quotation PDF the student received.

## What changes for the student

- After submitting the enquiry, the success screen shows the reference, e.g. **BRH-2609-0142**.
- The downloaded quotation PDF carries the same reference in the header (next to "Stay quote" and the date), and the file name becomes `Brachtia-Quote-BRH-2609-0142.pdf`.

## What changes for admin

- The Bookings list gets a **Ref** shown under the student's name, and search matches on it.
- The enquiry detail dialog gets a **Download quotation** button that regenerates the identical PDF (same numbers, same terms) from what was captured at submission time.
- Reference is also shown at the top of the detail dialog.

## How the numbers stay identical

At submission the full calculator result (monthly rent, pro-rated first month, advance, deposits, add-ons, fees, terms text, room and residence details) is stored as a snapshot on the enquiry row. The admin PDF is built from that snapshot, so it can never drift even if pricing or residence content is edited later.

## Technical notes

- Migration: add to `public.enquiries`
  - `reference text not null unique` (generated server-side as `BRH-YYMM-NNNN` from a Postgres sequence, so it is short and never collides)
  - `quote_snapshot jsonb not null default '{}'::jsonb`
  - a `seq` backing sequence + `default` expression or a `before insert` trigger to fill `reference` when empty.
  - Existing rows get backfilled references.
- `src/lib/public.functions.ts`: `submitEnquiry` accepts an optional `quoteSnapshot` object (property, room, occupancy, term, dates, `StayQuote`, lead fields — the same payload `downloadStayQuote` already takes), inserts it, and returns `{ ok, reference }`.
- `src/components/site/EnquiryDialog.tsx`: passes the snapshot on submit, stores the returned reference in state, shows it on the success screen, and forwards it to `downloadStayQuote`.
- `src/lib/quote-pdf.ts`: `QuoteInput` gains an optional `reference`; drawn in the header block and used in the file name.
- `src/routes/admin.bookings.tsx`: render `reference`, include it in the search filter, and add a Download quotation button that dynamic-imports `downloadStayQuote` with the stored `quote_snapshot` (button disabled with a hint for older enquiries that have no snapshot).
- `src/lib/admin.functions.ts`: `listEnquiries` already selects `*`, so the new columns come through with no change.
