import { cycleMonths, dueFor, nextRentAfter } from "@/lib/rental-schedule";
import type { MigrationPreviewRow } from "@/lib/migration/sheet3";

/*
 * What the Migration 1 import writes for one resident, worked out the same way
 * for the screen (so it shows exactly what will be saved) and for the import
 * itself (import.server.ts). No database here.
 */

export const r2 = (n: number) => Math.round(n * 100) / 100;

/** The initial payment's lines, typed the way the rent schedule and deposits read them. */
export function initialLines(row: MigrationPreviewRow) {
  const c = row.charges;
  return [
    { label: "First month rent (pro-rated)", kind: "advance", amount: c.proratedRent },
    { label: "Advance rental", kind: "advance", amount: c.advanceRent },
    { label: "Security deposit (refundable)", kind: "refundable", amount: c.securityDeposit },
    { label: "Utilities deposit (refundable)", kind: "refundable", amount: c.utilitiesDeposit },
    { label: "Access card deposit (refundable)", kind: "refundable", amount: c.accessCardDeposit },
    { label: "Resident card", kind: "onetime", amount: c.residentCardCharges },
    { label: "Admin and agreement charges", kind: "onetime", amount: c.adminAgreementCharges },
    { label: "Starter pack", kind: "onetime", amount: row.record.starterPack },
  ].filter((l) => l.amount > 0);
}

/**
 * Where the migrated initial invoice stands (Dani, 19 Oct 2026) - one rule for
 * the upload preview and the import.
 *
 * What is still owed is Sheet3's "Initial Balance Due", which the converter
 * fills (lines minus Total Initial Payment, owed only above 1 sen) and the team
 * can correct. It is not worked out here from the lines, because a legacy
 * invoice can carry lines Sheet3 does not list (a running account, utilities)
 * and only the team can tell those from a real debt.
 *
 * Owed: the invoice is "issued" and the payment is what came in, so the
 * Payments tab shows Partially paid and the rest is paid through the normal
 * Record payment. Nothing owed: "paid" in full. Paid more than the listed
 * lines (00952, 00993): paid, and the extra is not carried as credit - it went
 * on charges outside these lines.
 */
export function initialPaymentOf(row: MigrationPreviewRow) {
  const total = r2(initialLines(row).reduce((n, l) => n + l.amount, 0));
  const due = r2(row.record.balanceDue);
  const owed = due > 0.01 ? Math.min(due, total) : 0;
  return {
    total,
    owed,
    paid: r2(total - owed),
    status: (owed > 0 ? "issued" : "paid") as "issued" | "paid",
    /** paid less than the listed lines while Sheet3 says nothing is owed - the team should look */
    unexplained: !owed && row.record.totalPaid > 0 && total - row.record.totalPaid > 0.01 ? r2(total - row.record.totalPaid) : 0,
  };
}

/** The rent terms from the next period after today, or null when nothing is left to bill. */
export function migratedRentTerms(row: MigrationPreviewRow, today: string) {
  const { schedule, monthlyRent } = row.record;
  if (schedule === "full" || !(monthlyRent > 0)) return null;
  const next = nextRentAfter({
    tenancyStart: row.tenancyStart,
    tenancyEnd: row.tenancyEnd,
    frequency: schedule,
    monthlyRent,
    proratedRent: row.charges.proratedRent,
    advanceRent: row.charges.advanceRent,
    today,
  });
  // Sheet3 says nothing more is owed: no schedule (19 Oct 2026)
  if (row.paidToEndBySheet) return null;
  // Brachtia's next billing period wins: the schedule starts there, every later bill follows it
  if (row.nextPeriodStart && row.nextPeriodStart !== next?.start) {
    const cycle = cycleMonths(schedule);
    const month = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
    const finalMonths = cycle ? ((month(row.tenancyEnd) - month(row.nextPeriodStart)) % cycle) + 1 : 1;
    return {
      monthly_rent: monthlyRent,
      frequency: schedule,
      first_period_start: row.nextPeriodStart,
      first_period_end: row.nextPeriodEnd,
      first_due_date: row.nextPaymentDue || dueFor(row.nextPeriodStart),
      tenancy_end: row.tenancyEnd,
      final_amount: Math.round(monthlyRent * finalMonths * 100) / 100,
    };
  }
  if (!next) return null;
  // the schedule steps on from the next cycle; its last bill is whole months too
  return {
    monthly_rent: monthlyRent,
    frequency: schedule,
    first_period_start: next.start,
    first_period_end: next.end,
    first_due_date: next.due,
    tenancy_end: row.tenancyEnd,
    final_amount: next.finalAmount,
  };
}


/*
 * One word for a record from before the system, used the same way everywhere
 * (Dani, 12 Oct 2026): the agreement, the initial invoice, its payment and
 * receipt show a "Migrated" tag, and the eye / Open goes to the original copy.
 */
export const MIGRATED = "Migrated";
export const MIGRATED_MEANING = "Original record from before the system. The signed copy is kept as a link.";

/** The note an imported invoice carries - the original copy's link at its end. */
export function migratedNote(originalUrl: string) {
  return `${MIGRATED} · original record from before the system${originalUrl ? ` · ${originalUrl}` : ""}`;
}

/** Whether an invoice (by its notes) was imported, and its original copy. */
export function migratedOriginal(notes: string | null | undefined) {
  const n = String(notes ?? "");
  if (!n.startsWith(MIGRATED)) return null;
  return { url: n.match(/https?:\/\/\S+/)?.[0] ?? "" };
}
