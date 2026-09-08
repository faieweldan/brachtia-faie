# Stay calculator: bolder card, PDF quote, stronger copy

## 1. Copy that converts

- Heading changes from "Your stay" to **"See your move-in cost"**, with a one-line sub-caption: "Pick a room and your dates — we'll show exactly what you pay upfront."
- The upfront block keeps "Due before move-in", and the total line reads **"Pay to secure your room"**.
- Under the total, a short reassurance line: "Booking fee RM500 / USD100 is offset against your first payment. No hidden fees."
- Primary button stays the enquiry action but reads **"Reserve with these dates"**, with a quiet "Free to enquire — no payment yet" note under it.

## 2. Card design that pops

Keeps the same structure from the reference screenshot, but with more presence:

- Card gets a deep-green gradient header strip carrying the heading, sub-caption and a small Brachtia mark, so the calculator reads as its own product rather than a plain panel.
- Stronger elevation and a peach ring around the whole card so it stands out against the white page; sticky behaviour in the sidebar unchanged.
- "Pay to secure your room" total gets larger, tabular-figure treatment on its own emphasised row.
- Room type, occupancy toggle and date fields get slightly larger touch targets and clearer focus states; the monthly rent breakdown stays collapsed behind its dropdown.
- Two actions at the bottom: the primary reserve button and a secondary **"Download quote (PDF)"** link.

## 3. Downloadable PDF quote

Clicking "Download quote (PDF)" generates a one-page A4 PDF in the browser and saves it as `Brachtia-Quote-<Residence>-<Room>-<date>.pdf`, containing:

- Brachtia logo, company name, legal name and registration, office/WhatsApp contacts and address
- Residence name, address, room type (unit type + room name), occupancy, size, bathroom and view
- Move-in / move-out dates, contract term (12-month or short-term) and monthly rate
- Full "Due before move-in" table with refundable items flagged, and the total to pay now
- The monthly rent schedule with pro-rated months marked, and total rent for stay
- Footer: quote date, "Indicative quote — subject to availability and final agreement", and the site URL

## Technical notes

- Add `jspdf` (+ `jspdf-autotable`) and build the document from the existing `stayQuote` result — no new pricing logic.
- New `src/lib/quote-pdf.ts` exports `downloadStayQuote({ property, room, occupancy, term, quote })`; imported lazily inside the click handler so it stays out of the initial bundle and off the SSR path.
- The logo is drawn as vector paths matching `Logo.tsx` (same coordinates, scaled), so no image asset is needed.
- Presentation changes are confined to `src/components/site/StayCalculator.tsx`; `properties.$slug.index.tsx` only passes the existing props.
