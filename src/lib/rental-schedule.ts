import { staySchedule } from "@/data/properties";
import { SCHEDULES } from "@/lib/reference-data";

/**
 * A tenancy's rent, period by period, from the terms admin confirmed.
 *
 * Nothing here is guessed: without the rent, payment schedule and tenancy dates
 * there is no schedule. Each period becomes a scheduled invoice, billed
 * BILL_LEAD_DAYS before it starts and due on the 5th of the month after it ends
 * - the student has the period itself to pay for it. When a schedule is edited,
 * rent already billed stays as it was and the schedule picks up the day after it.
 */

/** The terms admin confirms. */
export type ScheduleTerms = {
  monthlyRent: number;
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

/**
 * When a period's rent must be paid: the 5th of the month after it ends.
 *
 * Brachtia's declaration says rent is paid by the 5th, so a period running to
 * 31 December is due on 5 January - the student has the period, and the first
 * few days of the next one, to pay for it.
 */
export function dueFor(end: string) {
  const [y, m] = end.slice(0, 10).split("-").map(Number);
  if (!y || !m) return end;
  // month index m is already the month after, since the index is zero-based
  return iso(new Date(Date.UTC(y, m, RENT_DUE_DAY)));
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
    const amount =
      prorated === null
        ? rent * (cycle ?? 1)
        : final && terms.finalAmount !== null
          ? terms.finalAmount
          : prorated;
    // due the 5th of the month after it ends, however long it runs
    periods.push({ start, end, due: dueFor(end), amount, prorated, final });
    if (!cycle || final) break;
    start = shiftDate(end, { days: 1 });
    end = shiftDate(start, { months: cycle, days: -1 });
  }
  return periods;
}

/** The day a period's invoice is billed. */
export const billOnFor = (due: string) => shiftDate(due, { days: -BILL_LEAD_DAYS });

/**
 * The day rent invoices start: the day after what the advance rent on the
 * initial invoice paid for.
 *
 * Advance rent pays the start of the stay, in the order the invoice priced it -
 * the move-in month's pro-rated days first, then whole calendar months. So the
 * amount is walked through the same months: RM225 + RM450 at RM450 a month from
 * 16 Sept pays 16-30 Sept and October, and rent starts 1 Nov. Money that pays
 * only part of a month moves the start by that many days of it.
 */
export function rentStartAfterAdvance(
  tenancyStart: string,
  tenancyEnd: string,
  advance: number,
  rent: number,
) {
  const from = tenancyStart.slice(0, 10);
  if (!from || !(advance > 0) || !(rent > 0)) return from;
  const to = tenancyEnd.slice(0, 10) || shiftDate(from, { months: 60 });
  let left = advance;
  let cursor = from;
  for (const month of staySchedule(from, to, rent)) {
    if (left + 0.005 < month.amount) {
      return shiftDate(cursor, { days: Math.round(left / (rent / month.daysInMonth)) });
    }
    left -= month.amount;
    cursor = shiftDate(`${cursor.slice(0, 8)}01`, { months: 1 });
  }
  return cursor;
}

/**
 * The first rent period: from the day advance rent runs out, one cycle long.
 * Empty when advance rent pays the whole tenancy, or for the full term, which the
 * initial invoice pays whole.
 */
export function firstRentPeriod(
  tenancyStart: string,
  tenancyEnd: string,
  frequency: string,
  advance: number,
  rent: number,
) {
  const to = tenancyEnd.slice(0, 10);
  const none = { start: "", end: "" };
  if (!tenancyStart || !to || !CYCLE[frequency]) return none;
  const start = rentStartAfterAdvance(tenancyStart, to, advance, rent);
  if (!start || start > to) return none;
  return { start, end: cycleEnd(start, frequency, to) };
}
