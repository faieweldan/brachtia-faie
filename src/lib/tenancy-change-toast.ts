import { toast } from "sonner";

import { fmtDate, money } from "@/lib/ops-store";

type Outcome = {
  name: string;
  date: string;
  settled: boolean;
  effective: boolean;
  documents: string[];
  scheduleEnd?: { from: string; to: string };
  rentBefore: number;
  rent: number;
};

/** "lengthened from 30 Sept 2027 to 14 Oct 2028" */
export function scheduleChange(s: { from: string; to: string }) {
  return `Rent schedule ${s.to > s.from ? "lengthened" : "shortened"}: ${fmtDate(s.from)} → ${fmtDate(s.to)}.`;
}

/**
 * What an Update Tenancy event did when its IP was paid (Dani, 7 Oct 2026):
 * a notice in the bottom-right corner - which documents were made again, and
 * whether the rent schedule was lengthened or shortened.
 */
export function toastTenancyOutcomes(outcomes: Outcome[] | undefined) {
  for (const o of outcomes ?? []) {
    const lines = [
      o.settled && o.documents.length ? `${o.documents.join(", ")} ${o.documents.length === 1 ? "was" : "were"} made again - on the Tenancy tab.` : "",
      o.scheduleEnd ? scheduleChange(o.scheduleEnd) : "",
      o.settled && Math.abs(o.rent - o.rentBefore) > 0.005 ? `Rental ${money(o.rentBefore)} → ${money(o.rent)} a month from ${fmtDate(o.date)}.` : "",
      o.effective ? "It has taken effect: the room and end date are updated." : `It takes effect on ${fmtDate(o.date)}.`,
    ].filter(Boolean);
    toast.success(`${o.name} settled · ${fmtDate(o.date)}`, { description: lines.join(" "), duration: 12_000 });
  }
}
