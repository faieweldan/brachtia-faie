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
  /*
   * An Update Tenancy IP can be paid before its billing day (agreed 7 Oct
   * 2026). The billing gives it its number as "issued"; it is paid already,
   * so it is marked so here.
   */
  const { data: issued } = await supabase
    .from("invoices")
    .select("id, total")
    .eq("status", "issued")
    .eq("invoice_type", "initial")
    .like("notes", "Initial payment difference%");
  const ids = ((issued ?? []) as any[]).map((i) => i.id);
  if (!ids.length) return;
  const { data: pays } = await supabase.from("payments").select("invoice_id, amount").in("invoice_id", ids);
  const paid = new Map<string, number>();
  for (const p of (pays ?? []) as any[]) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + Number(p.amount || 0));
  const done = ((issued ?? []) as any[]).filter((i) => (paid.get(i.id) ?? 0) + 0.005 >= Number(i.total || 0)).map((i) => i.id);
  if (done.length) await supabase.from("invoices").update({ status: "paid" }).in("id", done);
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

/**
 * How many of a line there are.
 *
 * A line is worth `lineQty x amount`, where amount is the price of one. Old
 * lines were saved before quantity existed and have none, so a missing, blank or
 * nonsense quantity is one - never nothing, which would zero the line and quietly
 * change what an issued invoice is worth. Whole numbers only: half an advance
 * month is a different amount, not a fraction of a line.
 */
export function lineQty(v: unknown) {
  return Math.max(1, Math.round(Number(v) || 1));
}
