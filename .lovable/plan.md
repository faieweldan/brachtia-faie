# Invoice generator clean-up and Stay Details fields

## Invoice Generator page

**Billing Details becomes a read-only summary card.** Student, email, mobile, residence, unit type, room, occupancy, tenancy start/end, monthly rent and payment frequency are all displayed as plain text — no inputs, no dropdowns. A short line under the heading reads "Edit these in Booking Details → Stay Details", with a link back to the booking.

**Room must be assigned first.** The card shows the assigned room (unit and room, single/twin). If no room has been assigned to the booking, the card shows "No room assigned" and Generate Invoice / Preview Invoice are disabled with a note telling the admin to assign a room on the booking page first.

**New invoice fields**, in a small row above the line-item table:
- Invoice date — defaults to today, admin can change it.
- Payment terms — NET15 by default, switchable to NET30. The due date (invoice date + 15 or 30 days) is shown beside it and printed on the invoice PDF.

**The line-item table is rebuilt as a clean accounting-style table** (per the reference):

```text
ITEM                              TYPE              AMOUNT (RM)
First month rent · Sep 2026       Advance Rent           1,050.00
Advance rental · 1 month          Advance Rent           1,050.00
Utilities deposit · ½ month       Refundable               525.00
Security deposit · 2 months       Refundable             2,100.00
Access card deposit               Refundable                50.00
Resident card charges             One-time                  20.00
+ Add line
```

- Rows render as text, not as form fields.
- Only the amount looks editable — a compact right-aligned amount input.
- Clicking a row turns its Item and Type into editable controls; clicking away returns them to text.
- Delete stays as a trash icon that appears on row hover.
- Totals stay at the bottom: Total Initial Payment and Refundable Deposits Included, then Preview Invoice / Generate Invoice.

## Booking Details → Stay Details

Three changes to the editable Stay Details card:

- **Payment frequency** — new field, prefilled from what the student chose in the quote, editable by admin (Monthly, Bi-monthly, Quarterly, Full term).
- **Unit type** — new field from the enquiry (the unit type of the room the student picked), editable via dropdown of the unit types available at the selected residence.
- **Room preference** — becomes a dropdown instead of free text, listing the room types of the selected residence filtered by the chosen unit type, rather than an open text box.

The invoice generator reads all of these, so the invoice is always driven by what is on the booking.

## Technical notes

- Migration: add `unit_type text not null default ''` to `enquiries`; add `invoice_date date` and `payment_terms text not null default 'NET15'` to `invoices`. `payment_term` already exists on `enquiries` and is reused for payment frequency.
- `updateEnquiry` gains `paymentTerm` and `unitType` inputs. `EditableCard` currently passes snake_case keys (`full_name`) into `updateEnquiry`, which expects camelCase, so those field edits are silently dropped — add a key map in the booking page mutation so all Stay/Student edits persist.
- New server function `listRoomOptions({ residenceSlug })` returning `code`, `room_code`, `name`, `unit_type` from `room_types`, used for the Unit type and Room preference dropdowns; `EditableCard` gains `room` and `select` field kinds.
- `createInvoice` accepts `invoice_date` and `payment_terms`; `InvoiceDoc` and `src/lib/invoice-pdf.ts` print Invoice date, Payment terms and Due date in the info block.
- Invoice page gets the assigned room from the existing ops store (`allBeds` filtered by `enquiryId`), same source the booking page uses; guard disables generation when absent.
- Table styling uses existing admin tokens — bordered rows, muted header, tabular-nums amounts.
