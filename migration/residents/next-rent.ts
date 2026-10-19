/*
 * The next rent of each Batch 1 resident, worked out by the SYSTEM's own rule
 * (nextRentAfter in src/lib/rental-schedule.ts) - so the converter never keeps
 * a second copy of how rent is billed. convert_batch.py pipes rows in as JSON
 * and writes the answers into Sheet3. Prints JSON only - never names.
 *
 * stdin:  {"today": "2026-10-12", "rows": [{"key", "start", "end", "frequency", "rent", "prorated", "advance"}]}
 * stdout: {"<key>": {"period", "due", "amount"}}
 */
import { nextRentAfter } from "../../src/lib/rental-schedule";

// day first, as the app writes dates: 01 Nov 2026
const dayFirst = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

const input = JSON.parse(await Bun.stdin.text()) as {
  today: string;
  rows: { key: string; start: string; end: string; frequency: string; rent: number; prorated: number; advance: number }[];
};
const out: Record<string, { period: string; due: string; amount: number | null }> = {};
for (const r of input.rows) {
  if (r.frequency === "full") {
    out[r.key] = { period: "Fully paid", due: "", amount: null };
    continue;
  }
  const next = r.start && r.end && r.rent > 0
    ? nextRentAfter({ tenancyStart: r.start, tenancyEnd: r.end, frequency: r.frequency, monthlyRent: r.rent, proratedRent: r.prorated, advanceRent: r.advance, today: input.today })
    : null;
  out[r.key] = next
    ? { period: `${dayFirst(next.start)} – ${dayFirst(next.end)}`, due: next.due, amount: next.amount }
    : { period: r.start && r.end && r.rent > 0 ? "Paid to the end of the tenancy" : "", due: "", amount: null };
}
console.log(JSON.stringify(out));
