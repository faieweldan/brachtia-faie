import type { Tone } from "@/lib/billing-tone";

/**
 * Where one payment stands, in the five words staff use for it.
 *
 * The rule, as Lav set it out on 21 Sept 2026:
 *
 *   Cancelled        the invoice was voided - nothing is owed on it ever again
 *   Scheduled        the rent is planned, no invoice raised yet
 *   Invoiced         raised, and more than a week before it is due
 *   Coming Due       raised, and due inside the next week
 *   Partially paid   some of it is in, the rest is not
 *   Past Due         the due date has gone and money is still owed
 *   Paid             nothing outstanding
 *
 * Worked out rather than stored. `invoices` has no due_date column - the due
 * date is the invoice date plus its NET days - so a status written into a row
 * would be right on the day it was saved and wrong the morning after. Deriving
 * it means a page opened tomorrow is correct tomorrow.
 *
 * Pure, so the rules can be tested without a database.
 */

/** How close is "coming due". A week - the same week the reminder works to. */
export const COMING_DUE_DAYS = 7;

export type PaymentStatus =
  "Cancelled" | "Scheduled" | "Paid in advance" | "Invoiced" | "Coming Due" | "Partially paid" | "Past Due" | "Paid";

export type PaymentState = {
  status: PaymentStatus;
  tone: Tone;
  /** how many days late, and only when late - "—" everywhere else */
  daysOverdue: number;
};

/** Whole days from a to b, on the calendar rather than to the hour. */
export function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(`${fromISO.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toISO.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * The state of one invoice as at `today`.
 *
 * Order matters and is not the order the table above reads in: paid is checked
 * before overdue, or an invoice settled after its due date would still show as
 * Past Due forever.
 */
export function paymentStateOf(
  invoice: {
    cancelled?: boolean;
    scheduled?: boolean;
    outstanding: number;
    dueDate?: string;
    paid?: number;
  },
  today: string,
): PaymentState {
  const none = { daysOverdue: 0 };

  /*
   * Cancelled is asked first, before every other question. A voided invoice
   * with nothing paid on it has an outstanding of zero, so asking "is it
   * settled" first would call it Paid - which is the opposite of true, and the
   * kind of wrong that is only noticed when somebody chases a refund.
   */
  if (invoice.cancelled) return { status: "Cancelled", tone: "idle", ...none };

  // no invoice yet, so nobody owes anything
  if (invoice.scheduled) {
    // an Update Tenancy IP paid before its billing day (agreed 7 Oct 2026)
    if ((invoice.paid ?? 0) > 0 && invoice.outstanding <= 0) return { status: "Paid in advance", tone: "done", ...none };
    return { status: "Scheduled", tone: "idle", ...none };
  }

  // settled - whenever it was settled
  if (invoice.outstanding <= 0) return { status: "Paid", tone: "done", ...none };

  const due = (invoice.dueDate ?? "").slice(0, 10);
  const daysToDue = due ? daysBetween(today, due) : null;

  // late first: money past its date is the more pressing fact, even when some
  // of it has come in. This is the order Collections has always shown.
  if (daysToDue !== null && daysToDue < 0) {
    return { status: "Past Due", tone: "late", daysOverdue: Math.abs(daysToDue) };
  }

  /*
   * Some of it is in. A student who has paid RM800 of RM1,600 and one who has
   * paid nothing are a different conversation, and the invoice alone cannot
   * tell them apart - so it is said here rather than left to whoever opens it.
   */
  if ((invoice.paid ?? 0) > 0) return { status: "Partially paid", tone: "part", ...none };

  // raised, owed, and no due date to judge it by: it is out, and that is all
  if (daysToDue === null) return { status: "Invoiced", tone: "open", ...none };
  if (daysToDue <= COMING_DUE_DAYS) return { status: "Coming Due", tone: "due", ...none };
  return { status: "Invoiced", tone: "open", ...none };
}

/**
 * How near its due date a part-paid invoice is. Partially paid wins the status
 * pill over Coming Due, and Past Due wins over Partially paid - so the other
 * half of the story is shown as the row's colour instead (Dani and Lav, 29 Sep
 * 2026): light red when late, light yellow within COMING_DUE_DAYS.
 */
export function partPaidUrgency(
  invoice: { cancelled?: boolean; scheduled?: boolean; outstanding: number; dueDate?: string; paid?: number },
  today: string,
): "late" | "soon" | null {
  if (invoice.cancelled || invoice.scheduled) return null;
  if (!((invoice.paid ?? 0) > 0) || invoice.outstanding <= 0) return null;
  const due = (invoice.dueDate ?? "").slice(0, 10);
  if (!due) return null;
  const days = daysBetween(today, due);
  if (days < 0) return "late";
  if (days <= COMING_DUE_DAYS) return "soon";
  return null;
}
