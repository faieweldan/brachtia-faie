import { staySchedule } from "@/data/properties";
import { SCHEDULES } from "@/lib/reference-data";

/**
 * A tenancy's rent, period by period, from the terms admin confirmed.
 *
 * Nothing here is guessed: without the rent, payment schedule and tenancy dates
 * there is no schedule. Each period becomes a scheduled invoice, billed
 * BILL_LEAD_DAYS before its due date. New bookings are due on the 5th
 * of the first uncovered month. Previously confirmed schedules keep their dates. When a schedule is edited,
 * rent already billed stays as it was and the schedule picks up the day after it.
 */

/** The terms admin confirms. */
export type ScheduleTerms = {
  monthlyRent: number;
  /** Advance money remaining in the first uncovered calendar month. */
  firstPeriodCredit?: number;
  frequency: string;
  firstPeriodStart: string;
  firstPeriodEnd: string;
  firstDueDate: string;
  tenancyEnd: string;
  /** the shortened last period's amount, as admin confirmed it */
  finalAmount: number | null;
};

export type RentalPeriod = {
  start: string;
  end: string;
  due: string;
  amount: number;
  /** shorter than a full cycle: its pro-rated amount, before any override */
  prorated: number | null;
  /** runs to the end of the tenancy */
  final: boolean;
};

// the payment schedules the resident form offers - one list, used everywhere
// - and monthly, which an invoice can be raised with
const CYCLE: Record<string, number> = Object.fromEntries(
  SCHEDULES.filter((s) => s.months > 0).map((s) => [s.value, s.months]),
);

/** Rent is billed this many days before its period starts. */
export const BILL_LEAD_DAYS = 14;

/** The day of the month rent is due, from the declaration's term 11. */
export const RENT_DUE_DAY = 5;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The 5th of the first month covered by a payment. */
export function dueFor(start: string) {
  const [y, m] = start.slice(0, 10).split("-").map(Number);
  if (!y || !m) return start;
  return iso(new Date(Date.UTC(y, m - 1, RENT_DUE_DAY)));
}

export function shiftDate(
  date: string,
  { days = 0, months = 0 }: { days?: number; months?: number },
) {
  // months first, keeping the day of the month - the 31st lands on the last day
  // of a shorter month rather than spilling into the next - then the days
  const [y, m, day] = date.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(y!, m! - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day!, lastDay) + days);
  return iso(target);
}

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Rent for part of a cycle: whole calendar months, and days of the rest. */
const prorate = (start: string, end: string, rent: number) =>
  Math.round(staySchedule(start, end, rent).reduce((n, s) => n + s.amount, 0) * 100) / 100;

/** A period's natural end: one cycle on, or the tenancy end for the full term. */
export function cycleEnd(start: string, frequency: string, tenancyEnd: string) {
  const cycle = CYCLE[frequency];
  if (!cycle || !start) return tenancyEnd;
  const end = shiftDate(start, { months: cycle, days: -1 });
  return tenancyEnd && end > tenancyEnd ? tenancyEnd : end;
}

/**
 * The periods from confirmed terms. `resumeAfter` is the end of the last period
 * already issued: the schedule starts the day after it, so issued rent is left
 * as it is.
 */
export function buildPeriods(terms: ScheduleTerms, resumeAfter = ""): RentalPeriod[] {
  const { monthlyRent: rent, frequency, firstPeriodStart, firstDueDate, tenancyEnd } = terms;
  if (!(rent > 0) || !frequency || !firstPeriodStart || !terms.firstPeriodEnd) return [];
  if (!firstDueDate || !tenancyEnd) return [];

  const cycle = CYCLE[frequency];
  let start = firstPeriodStart;
  let end = terms.firstPeriodEnd;
  if (resumeAfter && resumeAfter >= firstPeriodStart) {
    start = shiftDate(resumeAfter, { days: 1 });
    end = cycleEnd(start, frequency, tenancyEnd);
  }

  const periods: RentalPeriod[] = [];
  for (let guard = 0; start <= tenancyEnd && guard < 120; guard++) {
    if (end > tenancyEnd) end = tenancyEnd;
    const full = cycle ? end >= shiftDate(start, { months: cycle, days: -1 }) : false;
    const final = end >= tenancyEnd;
    const prorated = full ? null : prorate(start, end, rent);
    const beforeCredit =
      prorated === null
        ? rent * (cycle ?? 1)
        : final && terms.finalAmount !== null
          ? terms.finalAmount
          : prorated;
    const credit = start === firstPeriodStart ? (terms.firstPeriodCredit ?? 0) : 0;
    const amount = Math.max(0, Math.round((beforeCredit - credit) * 100) / 100);
    // Preserve previously confirmed schedules that were explicitly due after
    // their period. New booking terms always use the start-month due date.
    const legacyDue = firstDueDate > terms.firstPeriodEnd;
    const due = legacyDue ? dueFor(shiftDate(end, { days: 1 })) : dueFor(start);
    periods.push({ start, end, due, amount, prorated, final });
    if (!cycle || final) break;
    start = shiftDate(end, { days: 1 });
    end = shiftDate(start, { months: cycle, days: -1 });
  }
  return periods;
}

/** The day a period's invoice is billed. */
export const billOnFor = (due: string) => shiftDate(due, { days: -BILL_LEAD_DAYS });

/** Walk advance money through calendar months without turning cents into rounded days. */
function advanceCoverage(tenancyStart: string, tenancyEnd: string, advance: number, rent: number) {
  const from = tenancyStart.slice(0, 10);
  const to = tenancyEnd.slice(0, 10);
  if (!from || !to || !(rent > 0) || to < from) return { start: "", credit: 0 };
  let left = Math.max(0, Math.round(advance * 100));
  let cursor = from;
  for (const month of staySchedule(from, to, rent)) {
    const cost = Math.round(month.amount * 100);
    if (left < cost) return { start: cursor, credit: left / 100 };
    left -= cost;
    cursor = shiftDate(`${cursor.slice(0, 8)}01`, { months: 1 });
  }
  return { start: "", credit: 0 };
}

export function rentStartAfterAdvance(
  tenancyStart: string,
  tenancyEnd: string,
  advance: number,
  rent: number,
) {
  return advanceCoverage(tenancyStart, tenancyEnd, advance, rent).start;
}

/** First unpaid calendar cycle, with any partial advance preserved as money. */
export function firstRentPeriod(
  tenancyStart: string,
  tenancyEnd: string,
  frequency: string,
  advance: number,
  rent: number,
) {
  const none = { start: "", end: "", credit: 0 };
  const to = tenancyEnd.slice(0, 10);
  if (!CYCLE[frequency]) return none;
  const { start, credit } = advanceCoverage(tenancyStart, to, advance, rent);
  if (!start || start > to) return none;
  // A partial first month still belongs to that calendar billing cycle.
  const end = cycleEnd(`${start.slice(0, 8)}01`, frequency, to);
  return { start, end, credit };
}

/** Shared by the invoice editor, its PDF and the saved next-payment values. */
export function nextRentalPayment(input: {
  tenancyStart: string;
  tenancyEnd: string;
  frequency: string;
  monthlyRent: number;
  items: { kind: string; amount: number; quantity?: number }[];
}) {
  const advance = input.items
    .filter((line) => line.kind === "advance")
    .reduce((sum, line) => sum + Number(line.amount || 0) * Number(line.quantity ?? 1), 0);
  const first = firstRentPeriod(
    input.tenancyStart,
    input.tenancyEnd,
    input.frequency,
    advance,
    input.monthlyRent,
  );
  if (!first.start) return null;
  const amount = Math.max(
    0,
    Math.round((prorate(first.start, first.end, input.monthlyRent) - first.credit) * 100) / 100,
  );
  return { start: first.start, end: first.end, due: dueFor(first.start), amount };
}
