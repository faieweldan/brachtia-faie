/**
 * What an invoice is for, and the short code the accountant reads it by.
 *
 * The code is part of the invoice number - INV/RP/00002 - so the kind of invoice
 * is plain wherever the number is: in a list, a search, or a ledger. The number
 * after it runs in one order across every category.
 */

export type InvoiceCategory = "initial" | "rental" | "charge" | "checkout";

export const INVOICE_CATEGORIES: Record<InvoiceCategory, { label: string; code: string }> = {
  initial: { label: "Initial payment", code: "IP" },
  rental: { label: "Rental payment", code: "RP" },
  charge: { label: "Additional charge", code: "AC" },
  // what a resident still owes once their deposit is used up at checkout (Dani, 2 Oct 2026)
  checkout: { label: "Checkout settlement", code: "CS" },
};

/**
 * Credit notes - money Brachtia owes back - read the same way: CN/<code>/<no.>,
 * each kind counting from 1 (Dani, 14 Oct 2026). A code means one thing across
 * invoices and credit notes: CS is checkout settlement on both sides (INV/CS
 * when the resident owes, CN/CS when Brachtia does); refunded account credit is
 * RF, because AC is already Additional charge. tests/one-rule.test.ts checks no
 * code is used for two things.
 */
export type CreditNoteCategory = "checkout" | "refund";

export const CREDIT_NOTE_CATEGORIES: Record<CreditNoteCategory, { label: string; code: string }> = {
  checkout: { label: "Checkout settlement", code: "CS" },
  refund: { label: "Credit refund", code: "RF" },
};

/** The category an invoice is filed under. */
export function categoryOf(invoiceType: string): InvoiceCategory {
  if (invoiceType === "rental") return "rental";
  if (invoiceType === "charge") return "charge";
  if (invoiceType === "checkout") return "checkout";
  return "initial";
}

/**
 * The invoice number as it is read. New numbers carry their code already
 * (INV/IP/00001); an older dated number has the code added after it
 * (INV-150926-0031/IP).
 */
export function invoiceRef(number: string, invoiceType: string) {
  if (!number) return "—";
  if (/^INV\/[A-Z]{2}\//.test(number)) return number;
  // a QuickBooks number brought in by Migration 1 is shown as written: INV:IP_00894
  if (/^INV:[A-Z]{2}_/.test(number)) return number;
  return `${number}/${INVOICE_CATEGORIES[categoryOf(invoiceType)].code}`;
}
