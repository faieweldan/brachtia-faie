/* eslint-disable @typescript-eslint/no-explicit-any */

import { discountLabel } from "@/lib/invoices";
import type { InvoiceDoc } from "@/lib/invoice-pdf";

/**
 * One stored invoice, turned into the document its PDF is printed from.
 *
 * Written once because it kept being written twice. The generator's preview
 * built a document from what was on screen, and the booking page built another
 * from the saved row, and every field added to one and not the other went
 * missing from the invoice the student received - the terms flag first, then
 * the discount, each found only when somebody noticed the paper was wrong. A
 * field added here reaches every copy by default.
 *
 * Two things are deliberately not here, because they are not on the invoice:
 * how much has been paid against it, and who is looking at it.
 */
export function invoiceDocFromRow(row: any, items: any[]): InvoiceDoc {
  const listRent = Number(row?.list_rent ?? 0);
  const discountValue = Number(row?.discount_value ?? 0);
  return {
    number: row?.number ?? "",
    issued_at: row?.issued_at ?? null,
    invoice_date: row?.invoice_date ?? null,
    payment_terms: row?.payment_terms ?? "",
    // no due_date: it is not stored. The PDF works it out from the invoice
    // date and the terms, so an invoice cannot end up with a due date that
    // disagrees with the "NET15" printed beside it
    full_name: row?.full_name ?? "",
    email: row?.email ?? "",
    phone: row?.phone ?? "",
    university: row?.university ?? "",
    nationality: row?.nationality ?? "",
    residence_name: row?.residence_name ?? "",
    room_name: row?.room_name ?? "",
    occupancy: row?.occupancy ?? "",
    tenancy_start: row?.tenancy_start ?? null,
    tenancy_end: row?.tenancy_end ?? null,
    monthly_rent: Number(row?.monthly_rent ?? 0),
    payment_frequency: row?.payment_frequency ?? "",
    total: Number(row?.total ?? 0),
    deposits_total: Number(row?.deposits_total ?? 0),
    notes: row?.notes ?? "",
    items: (items ?? []).map((i: any) => ({
      label: i.label,
      kind: i.kind,
      amount: Number(i.amount ?? 0),
      ...(i.quantity != null ? { quantity: Number(i.quantity) } : {}),
    })),
    // the rent before the discount, what came off, and why. The label printed
    // on the PDF is not a column - it is worked out from the type and value,
    // which is exactly why it went missing when it was rebuilt by hand
    ...(listRent > 0 && discountValue > 0
      ? {
          list_rent: listRent,
          discount_label: discountLabel(row?.discount_type, discountValue),
          ...(row?.discount_note ? { discount_note: String(row.discount_note) } : {}),
        }
      : {}),
    // the terms admin asked for when it was raised, not what today would assume
    ...(row?.show_terms
      ? {
          show_terms: true,
          next_payment_date: row?.next_payment_date ?? null,
          next_payment_amount:
            row?.next_payment_amount == null ? null : Number(row.next_payment_amount),
        }
      : {}),
  };
}
