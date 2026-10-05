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
  return `${number}/${INVOICE_CATEGORIES[categoryOf(invoiceType)].code}`;
}
