import { nextRentAfter } from "@/lib/rental-schedule";
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
