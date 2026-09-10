# Invoices, payments and receipts on Booking Details

Admin can raise an invoice from a booking without retyping anything, record payments against it, get a receipt for each payment, and see the outstanding balance. Everything is tied to the Booking ID and can be attached to a Resident later without recreating it.

## Booking Details — Documents & Payment

The current "Documents" card becomes "Documents & Payment" with three tiles:

- Quote — Generated / Not generated, with Download.
- Invoice — before: "Not generated" + [Generate Invoice]. After: invoice number, Total, Paid, Balance, with [View Invoice] and [Record Payment].
- Payment Receipt — "No receipts yet", otherwise a list of receipts (number, amount, date) each with Download.

## Invoice Generator page

Opens as its own page from Generate Invoice, prefilled from the booking and its saved quote:

- Booking ID / reference, student name and billing details (email, phone, university, nationality)
- Residence, room, occupancy, tenancy start/end, monthly rent, payment frequency
- Line items copied from the initial payment components of the quote (first month rent, advance rent, deposits, booking fee, add-ons)

Admin can edit any amount or description, add or delete a line, and change the payment frequency before generating. Bottom of the page mirrors the quote:

```text
Total Initial Payment            RM2,133.33
Refundable Deposits Included     RM1,050.00
[ Preview Invoice ]  [ Generate Invoice ]
```

Preview opens the invoice PDF; Generate saves it, assigns an ID in the form `INV-DDMMYY-####` and returns to Booking Details.

The invoice PDF follows the existing quote design and adds a payment block:

- Bank: RHB Bank Berhad, No. 1, Jalan Anggerik Vanilla X31/X, Kota Kemuning, Section 31, 40460 Shah Alam, Selangor
- Account name: BRACHTIA MAJU RESOURCES PLT · Account No: 2126-0200-0280-57 · Swift: RHBBMYKL
- The DuitNow QR image supplied, printed beside the bank details

## Record Payment

Amount received, payment date, payment method, reference number (optional), proof of payment upload, then Save Payment. On save the payment is logged against the invoice, a receipt `RCT-DDMMYY-####` is created automatically, total paid and balance are recalculated, and the tile refreshes. The receipt shows the amount received, the invoice number and the remaining balance.

When the booking fee line is fully covered, the booking's payment milestone is marked and it becomes eligible for Create Resident. Nothing is duplicated on the resident side — the resident profile will read the same invoice, payment and receipt records through the booking they came from.

## Technical notes

- New tables: `invoices` (booking/enquiry id, nullable `resident_id`, number, status, currency totals, payment frequency, billing snapshot jsonb, tenancy fields), `invoice_items` (label, kind advance/deposit/fee/addon, qty, amount), `payments` (invoice id, amount, date, method, reference, proof path), `receipts` (number, payment id, invoice id, amount, balance after). Admin-only RLS mirroring the existing tables, with GRANTs; numbering via sequences plus `next_invoice_reference()` / `next_receipt_reference()` functions in the style of `next_enquiry_reference()`.
- Server functions in `src/lib/admin.functions.ts`: `getInvoiceForBooking`, `createInvoice`, `updateInvoice`, `recordPayment` (inserts payment + receipt and recomputes totals in one call), `listReceipts`.
- Proof of payment uploads go to a new private `payment-proofs` bucket through the existing admin upload server function pattern.
- New routes: `src/routes/admin.bookings.$id.invoice.tsx` (generator) and invoice/receipt PDF builders in `src/lib/invoice-pdf.ts`, reusing the header, palette and table helpers from `src/lib/quote-pdf.ts`.
- The DuitNow QR is added as a Lovable asset pointer and embedded in the invoice PDF.
- Deposits total = sum of items with kind `deposit`; balance = invoice total − sum of payments.
- The existing local `ops-store` payments screens are left untouched; this new flow is the database-backed one that residents will later read from.
