import { SCHEDULES } from "@/lib/reference-data";

/**
 * The dashboard's money (12 Oct 2026): the deposits the company holds now, and
 * the rent falling due from the next billing cycle on. The sums live here,
 * apart from the database, so they are tested on their own and the screen and
 * the server cannot add up differently.
 */

/* ------------------------------------------------------------- Deposits */

export type DepositKind = "security" | "utility" | "access" | "other";

export const DEPOSIT_KINDS: DepositKind[] = ["security", "utility", "access", "other"];

export const DEPOSIT_LABEL: Record<DepositKind, string> = {
  security: "Security deposit",
  utility: "Utility deposit",
  access: "Access card deposit",
  other: "Other deposits",
};

/**
 * Which deposit a refundable line is. The data model types a line only as
 * "refundable" - it has no deposit category - so the line's name is read.
 */
export function depositKind(label: string): DepositKind {
  if (/security/i.test(label)) return "security";
  if (/utilit/i.test(label)) return "utility";
  if (/access|card/i.test(label)) return "access";
  return "other";
}

/** A deposit held (positive) or one taken off again (negative: moved to account credit). */
export type DepositLine = { label: string; amount: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function depositsHeld(lines: DepositLine[]) {
  const byKind: Record<DepositKind, number> = { security: 0, utility: 0, access: 0, other: 0 };
  for (const l of lines) byKind[depositKind(l.label)] += l.amount;
  for (const k of DEPOSIT_KINDS) byKind[k] = Math.max(0, r2(byKind[k]));
  // the total is the sum of the parts shown, so the two always agree
  const total = r2(DEPOSIT_KINDS.reduce((n, k) => n + byKind[k], 0));
  return { byKind, total };
}

/* ----------------------------------------------------------------- Rent */

export type RentDue = { dueDate: string; amount: number; frequency: string };
export type Grouping = "month" | "quarter";
/** "all", or a stored payment frequency (monthly, bimonthly, semiannual...). */
export type FrequencyFilter = string;

// the buttons use the payment frequency names the profile uses - "Bi-monthly
// (every 2 months)" is "Bi-monthly" - so a frequency has one name everywhere
const FREQUENCY_SHORT: [string, string][] = SCHEDULES.map((s) => [s.value, s.label.replace(/\s*\(.*\)$/, "")]);

/**
 * The frequency buttons: All, then every frequency that has rent due - so the
 * buttons always add up to All, and none shows an empty chart.
 */
export function frequencyOptions(rows: RentDue[], today: string) {
  const cycle = nextCycleMonth(today);
  const present = new Set(
    rows.filter((r) => r.dueDate.slice(0, 7) >= cycle).map((r) => r.frequency || "other"),
  );
  const known = FREQUENCY_SHORT.filter(([v]) => present.has(v)).map(([value, label]) => ({
    value,
    label,
  }));
  const rest = [...present]
    .filter((v) => !FREQUENCY_SHORT.some(([k]) => k === v))
    .map((value) => ({ value, label: value === "other" ? "Not set" : value }));
  return [{ value: "all", label: "All" }, ...known, ...rest];
}

/** "2026-11" for a month, "2026-Q4" for a quarter. */
export function bucketOf(dueDate: string, by: Grouping) {
  const [y, m] = dueDate.split("-");
  return by === "month" ? `${y}-${m}` : `${y}-Q${Math.ceil(Number(m) / 3)}`;
}

/** "Nov 2026", or "Q4 2026". */
export function bucketLabel(key: string, long = false) {
  const [y, rest] = key.split("-");
  if (rest!.startsWith("Q")) return `${rest} ${y}`;
  return new Date(`${y}-${rest}-01T00:00:00Z`).toLocaleDateString("en-MY", {
    month: long ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The next billing cycle: the month after today's, as "2026-11". */
export function nextCycleMonth(today: string) {
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 7);
}

/**
 * The rent forecast: rent due from the start of the next billing cycle on,
 * for one payment frequency or all, added up per month or quarter. A quarter
 * that has begun counts only from the next cycle - `partial` says so.
 */
export function rentForecast(
  rows: RentDue[],
  today: string,
  by: Grouping,
  frequency: FrequencyFilter,
) {
  const cycle = nextCycleMonth(today);
  const ahead = rows.filter(
    (r) =>
      r.dueDate &&
      r.dueDate.slice(0, 7) >= cycle &&
      (frequency === "all" || (r.frequency || "other") === frequency),
  );
  const sums = new Map<string, { amount: number; count: number }>();
  for (const r of ahead) {
    const k = bucketOf(r.dueDate, by);
    const s = sums.get(k) ?? { amount: 0, count: 0 };
    s.amount = r2(s.amount + r.amount);
    s.count += 1;
    sums.set(k, s);
  }
  const firstQuarterStart = `${cycle.slice(0, 4)}-${String((Math.ceil(Number(cycle.slice(5)) / 3) - 1) * 3 + 1).padStart(2, "0")}`;
  const periods = [...sums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, s]) => ({
      key,
      label: bucketLabel(key),
      partial:
        by === "quarter" && key === bucketOf(cycle, "quarter") && firstQuarterStart !== cycle,
      ...s,
    }));
  const next = ahead.filter((r) => r.dueDate.slice(0, 7) === cycle);
  return {
    cycle,
    next: { amount: r2(next.reduce((n, r) => n + r.amount, 0)), count: next.length },
    total: { amount: r2(ahead.reduce((n, r) => n + r.amount, 0)), count: ahead.length },
    periods,
  };
}
