/* The kinds of checkout - shared by the server and the admin card. */
import { klToday } from "@/lib/kl-date";

/*
 * Three kinds of checkout (Dani, 2 Oct 2026). The system picks one from the
 * dates; admin can change it.
 *   cancellation       before the tenancy starts. Only the booking fee paid:
 *                      RM150 is kept, the rest of the RM500 comes back. The
 *                      initial payment paid in full: one month's rent + RM150
 *                      is kept. The unpaid initial invoice is cancelled.
 *   early_termination  after move-in, before the end date: the security and
 *                      utility deposits are kept. Rent is not owed to the end.
 *   end_of_tenancy     within 2 weeks of the end date: every deposit comes
 *                      back, less what is owed and any deductions.
 */
export const CHECKOUT_TYPES = ["cancellation", "early_termination", "end_of_tenancy"] as const;
export type CheckoutType = (typeof CHECKOUT_TYPES)[number];
export const CHECKOUT_TYPE_LABEL: Record<CheckoutType, string> = {
  cancellation: "Cancellation",
  early_termination: "Early termination",
  end_of_tenancy: "End of tenancy",
};
/** what a cancellation always keeps, from the RM500 booking fee */
export const CANCELLATION_FEE = 150;

/** The kind of checkout the dates say it is - before moving in (check-in date, else the start), more than 2 weeks before the end, or near/after it. */
export function checkoutTypeFor(start: string, end: string, today = klToday()): CheckoutType {
  if (start && today < start) return "cancellation";
  if (end) {
    const twoWeeksBefore = new Date(Date.parse(`${end}T00:00:00Z`) - 14 * 86_400_000).toISOString().slice(0, 10);
    if (today < twoWeeksBefore) return "early_termination";
  }
  return "end_of_tenancy";
}

/*
 * The statement's sums and what it is called - one rule for the admin card, the
 * server and the PDF (Dani, 12 Oct 2026). The card used to work these out
 * itself, beside the server's copy.
 */
const round = (n: number) => Math.round(n * 100) / 100;
export const checkoutTotals = (deposits: { amount: number }[], lines: { amount: number }[]) => {
  const held = round(deposits.reduce((n, d) => n + (Number(d.amount) || 0), 0));
  const deducted = round(lines.reduce((n, l) => n + (Number(l.amount) || 0), 0));
  return { held, deducted, net: round(held - deducted) };
};
/** a refund (or nothing either way) is a credit note; a balance owed is an invoice (Dani, 5 Oct 2026) */
export const checkoutDocKind = (net: number) => (net >= 0 ? "Credit note" : "Invoice");