/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The invoices that still stand.
 *
 * An invoice is cancelled - marked void, never deleted - when the room it priced
 * is released before anything was paid. It stays as a record, but nobody owes it
 * and no booking or resident should count it. Every read of invoices starts
 * here, so a new page cannot forget that and show cancelled money as owed.
 *
 * A scheduled invoice - rent made ahead, not billed until its day - is left out
 * for the same reason: it is listed, but nobody owes it yet. The pages that list
 * it ask for it by name.
 *
 * A booking has one invoice - the full initial payment. Its booking fee is not an
 * invoice of its own: it is the first payment recorded against that invoice.
 */
export function liveInvoices(supabase: any, columns = "*") {
  return supabase.from("invoices").select(columns).not("status", "in", "(void,scheduled)");
}

/**
 * Turn every scheduled invoice whose billing day has come into an issued one,
 * with its number. Run before billing is read, so what is owed is always current
 * without anything running on a timer. A database without the function yet
 * simply bills nothing.
 */
export async function billDueInvoices(supabase: any) {
  const { error } = await supabase.rpc("bill_due_invoices");
  if (error) console.warn(`bill_due_invoices: ${error.message}`);
}

/**
 * The booking fee, in ringgit - the same RM500 the website quotes
 * (company.bookingFee). The fee paid in full is the moment a booking is
 * confirmed and the student becomes a resident, so the server reads it here
 * rather than parsing the website's copy.
 */
export const BOOKING_FEE = 500;

export type DiscountType = "percent" | "amount";

/** What a discount takes off one month's rent - never more than the rent. */
export function discountPerMonth(listRent: number, type: DiscountType, value: number) {
  if (!(value > 0) || !(listRent > 0)) return 0;
  const off = type === "percent" ? (listRent * Math.min(value, 100)) / 100 : value;
  return Math.min(listRent, Math.round(off * 100) / 100);
}

/** "10%" or "RM50.00" - how the invoice names a discount. */
export function discountLabel(type: string | null | undefined, value: number) {
  if (!(value > 0) || !type) return "";
  return type === "percent"
    ? `${value}%`
    : `RM${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
