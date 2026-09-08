# Homes & Residents modules (front-end design only)

Two new modules (plus a small Tasks module and a Settings tab) and the glue that connects Bookings → Homes → Residents. This pass is **UI only**: no database tables, no server functions, and **no seeded demo rows** — every list starts empty with a clear "add your first…" empty state so you can enter your own data to test.

## Navigation

Sidebar becomes: Dashboard, Bookings, Homes, Residents, Tasks, Appointment Manager, Website, Settings. Modules with sub-tabs use the same style as the Website tab.

- **Homes** — Inventory, Availability, Unit setup
- **Residents** — Residents, Tenancies, Payments & AR
- **Tasks** — single list, no sub-tabs
- **Settings** — Documents (Tenancy Agreement template)

## 1. Homes module

### Inventory (default)
Three-level tree: Residence → Unit → Room → Bed, matching your sheet.

- Filter bar: residence, block/floor, unit type (4-bed / 3-bed / studio), room letter, occupancy (single/twin), gender, status, availability date range.
- Table columns: Unit ID, Unit no., Room, Bed, Occupancy, Status pill, Resident name, University, Nationality, Tenancy start/end, Rent.
- Colour-coded status pills reproducing your sheet: **Vacant** (amber), **Held** (blue), **Booked** (violet), **Active** (green), **Notice / Expiring** (red when end date is near).
- Row actions: Hold bed, Assign resident, Open unit, View history.
- Expand a unit row to see all rooms/beds inside it in one glance.

### Availability search
The "find me a bed" screen admin uses when an enquiry arrives: pick residence, move-in date, lease length, occupancy and gender, and get a card/list of matching beds with rent, available-from date and a **Reserve (Hold)** button. Holding asks for who it's for (link to an enquiry) and a hold-expiry date, then flips the bed to Held.

### Unit setup
Add/edit units, driven by what's already configured in the **Website** module:

- Residence dropdown = the residences in Website → Residences.
- Room type dropdown = the room types defined on that residence (Room A/B/C/D etc.), so codes, occupancies and rates stay in one place.
- Invoice/quote pricing pulls the same rates the public stay calculator uses — nothing is re-entered here.
- Unit-level fields: unit number, block/floor, unit type (4-bedroom / 3-bedroom / studio), gender designation.
- Bed configuration builder: each room gets a letter and an occupancy (single/twin); bed slots generate automatically (Twin 1 / Twin 2). A **"Rent as whole unit"** toggle collapses the unit into a single rentable entity with its own rate.


## 2. Bookings ↔ Homes link

Every new enquiry lands as **Open**. The pipeline ladder, shown as a kanban-style toolbar plus a per-enquiry drawer:

```text
Open → Room Reserved → Viewing Scheduled
   → Awaiting Booking Fee → Booked (Closed)
   → Closed (reason required)
```

The enquiry drawer gains a stepper with these actions in order:
1. **Reserve room** — opens the Homes availability picker inline; the chosen Room/Bed ID is stamped on the enquiry.
2. **Schedule viewing** — links to an appointment (existing linking UI), marks viewing complete.
3. **Generate invoice** — reuses the website stay calculator inputs (room, occupancy, dates, term, add-ons) and produces a booking invoice preview with a download button.
4. **Record booking fee** — payment proof upload + amount/date/method; room flips to Booked.
5. **Create resident profile** — prompt/CTA that opens the resident form pre-filled from the enquiry; on save the enquiry closes as Booked and a resident record appears in Residents.
6. **Close with reason** — reason picker (lost to competitor, no response, budget, other).

## 3. Residents module

### Residents list
Search + filters (residence, university, status, intake). Columns: name, student ID, residence/unit/room/bed, university, tenancy dates, tenancy status, AR balance.

### Resident profile (tabbed detail page)
Fields taken from your application form:

- **Personal** — full name (as passport/NRIC), email, mobile, DOB, nationality, passport/NRIC no., gender, marital status, race, religion.
- **Academic** — university, level of study, course, student ID, expected graduation year.
- **Housing & health** — preferred/assigned residence-unit-room-bed, occupancy, move-in date, lease months, medical conditions (yes/no + detail).
- **Emergency contact** — name, relationship, mobile, email, address, postcode, state, country.
- **Payment** — preferred method, payment schedule (bi-monthly / quarterly / semi-annual / full term), payer name, relationship, mobile, email.
- **Documents** — passport photo, offer letter, passport/NRIC, signed declaration, tenancy agreement, stamped TA, payment proofs, receipts. Each row: file, uploaded date, status, view/replace.
- **Portal access** — placeholder card showing invite status and a "Send portal invite" button (non-functional for now).

A completeness meter shows which required fields are still blank — this is the gate that creates the tenancy record.

### Tenancies
One row per tenancy: resident, unit/room/bed, start/end, rent, payment schedule, agreement status.

Agreement lifecycle shown as a progress strip:
```text
Draft generated → Admin review & sign → Sent to student → Student signed
   → Check-in scheduled → Checked in → Stamped
```
- **Generate agreement** — from the PDF template uploaded in Settings; shows a preview panel and a Regenerate button.
- **Pre-check-in checklist** — Prepare key card, Clean & set up room, Resident card application; each tickable with assignee and date.
- **Check-in day** — mark complete, upload remaining payment proof, generate receipts (booking fee receipt and full payment receipt).
- **Stamping task** — auto-created after check-in, closes when the stamped TA page is uploaded.

### Payments & AR
- **Due this month** view: every tenant's next instalment derived from their payment schedule — resident, unit, period covered, amount, due date, days overdue, status (Due / Paid / Overdue / Partial).
- Record payment dialog: amount, date, method, reference, proof upload → generates a receipt preview.
- Ledger per resident: invoices, payments, balance.
- Summary cards: billed this month, collected, outstanding, overdue count.

## 4. Tasks module (own sidebar item)

A standalone list of system-generated tasks so admin never has to dig into a resident to find work: review & sign agreement, pre-check-in checklist, stamp TA, chase overdue payment, hold expiring.

- Columns: task, type, related resident / enquiry / unit, due date, status (Open / Done), and a jump link into the screen that resolves it.
- Filters: type, status, overdue only. Tick to complete.
- The admin dashboard gets an "Action needed" card counting open tasks by type.

## 5. Settings tab

New global **Settings** sidebar item, marked *coming soon* apart from one working-looking card:

- **Tenancy Agreement template** — upload/replace a PDF template, with a mock 1-page placeholder TA shown in the preview panel until you supply the real one. Merge-field hints listed alongside (resident name, unit, dates, rent, schedule).

## Supporting elements suggested

- **Global search** in the admin header — jump to a unit, room, resident or enquiry by name/ID.
- Shared status-pill and document-upload-row components so Homes, Bookings and Residents look identical.

## Technical notes

- Routes: `admin.homes.tsx` (+ `.index`, `.availability`, `.units`), `admin.residents.tsx` (+ `.index`, `.$id`, `.tenancies`, `.payments`), `admin.tasks.tsx`, `admin.settings.tsx`. Sub-tab shells copy `admin.website.tsx`.
- Types + an empty in-memory store in `src/lib/inventory-store.ts` and `src/lib/residents-store.ts` — **no seed rows**; entries created during a session persist across screens so the flow can be walked end to end.
- Residence and room-type pickers in Unit setup read the existing Website data (`listResidences` from `src/lib/admin.functions.ts`), and invoice pricing reuses the public stay-calculator rate logic, so nothing is duplicated.
- Reuses existing shadcn primitives, `src/components/admin/fields.tsx`, `ImageUploader`, sonner toasts and the `.admin-ui` palette. New shared components: `StatusPill`, `DocumentRow`, `ChecklistCard`, `AvailabilityPicker`, `StageStepper`, `EmptyState`.
- Invoice/receipt/agreement previews render as on-screen documents built from the existing quote-PDF styling; PDF generation follows `src/lib/quote-pdf.ts` patterns where practical.
- No migrations, no server functions, no changes to the public site in this pass.
