# Room table selection + rebuilt stay calculator

## 1. Room table: airline-style rate selection

Split the single "Monthly rate" column into two columns — **Single** and **Twin sharing** — one price cell per occupancy, styled like the airline fare grid in the reference:

- Each cell is a clickable fare tile showing the monthly price (or "Not available" when there is no rate for that occupancy/term).
- Clicking a tile selects that room **and** that occupancy at once; the selected tile gets a filled dark-green state with a check, the rest stay white outlined.
- The row's separate "Select" button is removed — the fare tile is the selection control. Clicking the room name/image still opens the room detail popup.
- Header row becomes: Room · Details · Single · Twin sharing.
- On mobile the two fare tiles stack full-width under the room info.
- Existing filters, move-in/move-out dates and the 12-month / short-term toggle stay exactly as they are; these dates remain the single source of truth.

## 2. Calculator: static context, no duplicate inputs

Remove the top input block (room-type dropdown, occupancy toggle, move-in/move-out date pickers). Replace it with a read-only summary card driven by what the student picked in Rooms & Pricing:

```text
Unit type    3-Bedroom · Room A – Ensuite (with view)
Occupancy    Single
Move in      01 Sep 2026
Move out     02 Sep 2027
Duration     12 months 1 day
```

If nothing is selected yet, the calculator shows a prompt: "Pick a room and rate above to see your move-in cost."

## 3. Calculator body

**Monthly rental** shown as a headline figure.

**Payment terms** — a small segmented control: Bi-monthly · Quarterly · Full term. Choosing one changes how much rent is collected upfront (2 months, 3 months, or full stay) and the recurring instalment shown below the total. For short-term stays the default is **Full**, with a note that bi-monthly may be allowed case by case.

**Due before move-in** — keep the existing label wording from the current version, with only these minor adjustments:

- First month rent
- Advance rental (1 month)
- Utilities deposit (½ month) — REFUNDABLE
- Security deposit (2 months) — REFUNDABLE
- Access card deposit RM50 — REFUNDABLE
- Resident card charges RM20
- Admin + agreement charges RM250

Refundable items get a clear green "Refundable" tag. Total to pay now stays as the bold figure at the bottom, with the pro-rated monthly schedule kept in the existing collapsible.

## 4. Add-ons: bedding sets driven by room configuration

Car park add-on is removed. The starter pack is replaced by three bedding options, filtered by the selected room/occupancy:

| Selection | Bedding options offered |
| --- | --- |
| The Arc — twin sharing | Single only |
| The Arc — single | Single, Queen, King |
| Solstice — single | Queen only |

- Option 1: Single Bedding Set — RM250 (1 single quilted comforter, 1 single bedsheet, 1 pillow)
- Option 2: Queen Bedding Set — RM300 (1 queen quilted comforter, 1 queen bedsheet, 2 pillows)
- Option 3: King Bedding Set — RM350 (1 king quilted comforter, 1 king bedsheet, 2 pillows)

Presented as selectable cards with the contents listed underneath; only one can be chosen (or none), and the chosen set is added as a one-time line in the payment list and in the PDF.

## 5. Prompting for an accurate quote

The "Download quote (PDF)" button opens a short **Get your quote** dialog first — the natural moment to ask, since the student already sees their numbers. Copy: "Almost there — tell us who this quote is for and we'll generate it instantly."

Fields (all required unless noted): Name, University (dropdown of nearby campuses + Other), Intake month & year, Nationality, Gender, Email, Mobile.

On submit: validate with zod, close the dialog, generate the PDF immediately with the student's details printed in the quote header, and show a success toast. The details are also carried into the enquiry so the same info doesn't get asked twice.

## Technical notes

- `src/data/properties.ts`: extend `FeeConfig`/`stayQuote` with resident-card charge and a payment-term parameter; add a `beddingOptionsFor(property, room, occupancy)` helper. Fee values per property are set to the amounts listed above.
- `src/components/site/RoomPriceTable.tsx`: two rate columns rendering fare tiles; `onSelect(room, occupancy)` fires from the tile.
- `src/components/site/StayCalculator.tsx`: drop internal date/occupancy/room state, take them as required props from the route; add payment-term state and bedding-set state.
- New `src/components/site/QuoteDetailsDialog.tsx` for the lead-capture step; `src/lib/quote-pdf.ts` gains the student block and bedding line.
- `src/routes/properties.$slug.index.tsx` remains the single owner of room / occupancy / date state.
