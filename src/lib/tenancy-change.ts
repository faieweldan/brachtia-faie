import { CARD_AFTER_UNIT_CHANGE_CHARGE, ROOM_CHANGE_CHARGE, chargeAmount, type Charge } from "@/lib/charge-list";
import { planCredit } from "@/lib/credit-plan";

/*
 * Update Tenancy - the rules. Pure functions, shared by the dialog and the
 * server, and tested in tests/tenancy-change.test.ts. Agreed with Dani,
 * 2-7 Oct 2026; the 7 Oct question-and-answer list is the reference.
 *
 * One request can hold more than one EVENT. Each event has its own effective
 * date, its own Initial Payment (IP), its own documents and its own rent
 * change. A room move and a date change on different days are two events; on
 * the same day they are one event. A later event starts from the state the
 * earlier one leaves (the renewal is priced for the new room).
 *
 *   - the date change: the new period counts from the day after the old end
 *     date. Less than 6 months is an extension (same rent, same agreement);
 *     6 months or more is a renewal (the Website rate, a new agreement)
 *   - the money: the refundable deposits only. The required deposit follows
 *     the rent, never the length of the tenancy. Higher: the difference goes
 *     on the event's IP. Lower: the difference becomes account credit
 *   - the fixed charges: RM100 for a room, unit or occupancy change and RM20
 *     for a card in another unit. A renewal or extension alone has neither
 *   - the documents: each made once per event, after its IP is settled
 */

export type ChangeInput = {
  oldUnitId: string;
  newUnitId: string;
  oldRoomId: string;
  newRoomId: string;
  oldOccupancy: string;
  newOccupancy: string;
  /** yyyy-mm-dd */
  oldEnd: string;
  newEnd: string;
};

export type DateChange = "none" | "extension" | "renewal";

export type ChangeFlags = {
  room: boolean;
  /** a room in another unit - always a room change too */
  unit: boolean;
  occupancy: boolean;
  date: DateChange;
};

/** the day after a date */
export function nextDay(d: string): string {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day + 1)).toISOString().slice(0, 10);
}

/**
 * The last day of a new period 6 months long - the line between an extension
 * and a renewal (agreed 7 Oct 2026). The new period is counted from the day
 * after the old end date: 30 Nov -> 1 Dec to 31 May is 6 months, a renewal;
 * 1 Dec to 30 Apr is 5 months, an extension.
 */
export function sixMonthsAfter(end: string): string {
  const [y, m, d] = nextDay(end).split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + 6, 1));
  // the same day of the month, or the month's last day when it has fewer days
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last) - 1);
  return target.toISOString().slice(0, 10);
}

/** less than 6 months: an extension; exactly 6 or more: a renewal */
export function dateChange(oldEnd: string, newEnd: string): DateChange {
  if (!oldEnd || !newEnd || newEnd <= oldEnd) return "none";
  return newEnd >= sixMonthsAfter(oldEnd) ? "renewal" : "extension";
}

export function changeFlags(c: ChangeInput): ChangeFlags {
  const unit = !!c.newUnitId && c.newUnitId !== c.oldUnitId;
  const room = unit || (!!c.newRoomId && c.newRoomId !== c.oldRoomId);
  return {
    room,
    unit,
    occupancy: !!c.newOccupancy && c.newOccupancy !== c.oldOccupancy,
    date: dateChange(c.oldEnd, c.newEnd),
  };
}

export const anyChange = (f: ChangeFlags) => f.room || f.occupancy || f.date !== "none";

export type DocumentPlan = {
  /** a renewal: a new agreement with every TA document (Schedule C included) */
  newAgreement: boolean;
  scheduleA: boolean;
  scheduleC: boolean;
  accessCard: boolean;
};

/**
 * Each change's documents, added together, each document once:
 *   extension -> A          renewal   -> all TA (no access card form)
 *   room      -> A + C      unit      -> A + C + access card form
 *   occupancy -> A + C
 */
export function documentsFor(f: ChangeFlags): DocumentPlan {
  const newAgreement = f.date === "renewal";
  const scheduleC = f.room || f.occupancy;
  return {
    newAgreement,
    // a new agreement has its own Schedule A and C
    scheduleA: !newAgreement && anyChange(f),
    scheduleC: !newAgreement && scheduleC,
    accessCard: f.unit,
  };
}

export function documentNames(p: DocumentPlan): string[] {
  return [
    ...(p.newAgreement ? ["New agreement (General Terms, Schedules A, B and C)"] : []),
    ...(p.scheduleA ? ["Schedule A"] : []),
    ...(p.scheduleC ? ["Schedule C"] : []),
    ...(p.accessCard ? ["Access card form"] : []),
  ];
}

/* -------------------------------------------------------------- the events */

const NO_CHANGE: ChangeFlags = { room: false, unit: false, occupancy: false, date: "none" };

export type PlannedEvent = {
  /** yyyy-mm-dd - the first day of the change */
  date: string;
  flags: ChangeFlags;
};

/**
 * The events in one request, earliest first. The move is on `moveOn`; a date
 * change starts the day after the old end date. Two different days make two
 * events; the same day makes one.
 */
export function planEvents(f: ChangeFlags, moveOn: string, oldEnd: string): PlannedEvent[] {
  const moved = f.room || f.occupancy;
  const dateStart = f.date !== "none" && oldEnd ? nextDay(oldEnd) : "";
  if (!moved) return f.date === "none" ? [] : [{ date: dateStart, flags: { ...NO_CHANGE, date: f.date } }];
  if (f.date === "none" || moveOn === dateStart) return [{ date: moveOn, flags: f }];
  return [
    { date: moveOn, flags: { ...f, date: "none" as const } },
    { date: dateStart, flags: { ...NO_CHANGE, date: f.date } },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export const isMove = (f: ChangeFlags) => f.room || f.occupancy;

/** "Room change", "Renewal", "Room change + Renewal" */
export function eventName(f: ChangeFlags): string {
  const room = f.unit ? "Unit change" : f.room ? "Room change" : f.occupancy ? "Occupancy change" : "";
  const date = f.date === "renewal" ? "Renewal" : f.date === "extension" ? "Extension" : "";
  return [room, date].filter(Boolean).join(" + ");
}

/**
 * The fixed Schedule B charges an event carries - none for a date change
 * alone - at the residence's prices (Website › Residences, 28 Oct 2026): The
 * Arc's card after a unit change is RM20, Solstice's RM50. `missing` names a
 * charge the residence has no price for; confirm refuses while there is one.
 */
export function fixedCharges(f: ChangeFlags, charges: Charge[], cardForm = true) {
  const line = (key: string, label: string) => {
    const amount = chargeAmount(charges, label);
    return { key, label, amount: amount ?? 0, missing: amount === null };
  };
  return [
    ...(isMove(f) ? [line("change_fee", ROOM_CHANGE_CHARGE)] : []),
    // a new card only where the residence has a card form - Solstice has none (28 Oct 2026)
    ...(f.unit && cardForm ? [line("card_change", CARD_AFTER_UNIT_CHANGE_CHARGE)] : []),
  ];
}

/* --------------------------------------------------------------- the money */

/** the refundable deposits - the only initial-payment items an update compares */
export const DEPOSIT_KEYS = ["security", "utility", "card_deposit"] as const;
export type DepositKey = (typeof DEPOSIT_KEYS)[number];
export type Deposits = Record<DepositKey, number>;

export const depositLabel = (k: DepositKey) => MONEY_ITEMS.find((i) => i.key === k)!.label;

export const depositsOf = (m: Partial<Record<string, number>>): Deposits => ({
  security: round2(m["security"] ?? 0),
  utility: round2(m["utility"] ?? 0),
  card_deposit: round2(m["card_deposit"] ?? 0),
});

export type DepositRow = { key: DepositKey; label: string; held: number; required: number; difference: number };

/**
 * One event's deposits: what is held before it against what its rent
 * requires. Higher: the difference goes on the IP, unless admin waives it.
 * Lower: the difference becomes account credit, and the deposit held drops
 * by the same amount - it is not refunded again at checkout.
 */
export function eventDeposits(held: Deposits, required: Deposits, waived: string[] = []) {
  const rows: DepositRow[] = DEPOSIT_KEYS.map((key) => ({
    key,
    label: depositLabel(key),
    held: held[key],
    required: required[key],
    difference: round2(required[key] - held[key]),
  }));
  const ipLines = rows
    .filter((r) => r.difference > 0 && !waived.includes(r.key))
    .map((r) => ({ label: `${r.label} - difference`, amount: r.difference, kind: "refundable" as const }));
  const reclassified = rows.filter((r) => r.difference < 0).map((r) => ({ key: r.key, label: r.label, amount: -r.difference }));
  return {
    rows,
    ipLines,
    /** each lower deposit, now account credit */
    reclassified,
    credit: round2(reclassified.reduce((n, r) => n + r.amount, 0)),
    waived: rows.filter((r) => r.difference > 0 && waived.includes(r.key)).map((r) => ({ key: r.key, amount: r.difference })),
    /** what the next event starts from: the required level, however it was met */
    heldAfter: { ...required },
  };
}

/** the event's IP: the deposit differences, then the fixed charges admin kept */
export function eventInvoice(ipLines: { label: string; amount: number; kind: string }[], charges: { label: string; amount: number }[], credit: number) {
  const lines = [...ipLines, ...charges.filter((c) => c.amount > 0).map((c) => ({ label: c.label, amount: round2(c.amount), kind: "onetime" }))];
  const total = round2(lines.reduce((n, l) => n + l.amount, 0));
  const creditApplied = round2(Math.min(credit, total));
  return { lines, total, creditApplied, payable: round2(total - creditApplied), creditLeft: round2(credit - creditApplied) };
}

/**
 * The day an event's IP is billed: 14 days before the event, or today when
 * that day has passed.
 */
export function ipBillOn(eventDate: string, today: string): string {
  const [y, m, d] = eventDate.split("-").map(Number) as [number, number, number];
  const on = new Date(Date.UTC(y, m - 1, d - 14)).toISOString().slice(0, 10);
  return on < today ? today : on;
}

/* --------------------------------------------------------- reading invoices */


/** the initial-payment items compared, in the order the invoice prints them */
export const MONEY_ITEMS = [
  { key: "security", label: "Security deposit", match: /^security deposit/i },
  { key: "utility", label: "Utility deposit", match: /^utilit(y|ies) deposit/i },
  { key: "card_deposit", label: "Access card deposit", match: /^access card deposit/i },
  { key: "admin", label: "Admin agreement fees", match: /^admin/i },
  { key: "card_charge", label: "Access card charges", match: /^(resident|access) card charge/i },
] as const;

export type MoneyKey = (typeof MONEY_ITEMS)[number]["key"];

/** what each item comes to on a list of invoice lines - lines of the same item added up */
export function moneyOf(lines: { label: string; amount: number }[]): Record<MoneyKey, number> {
  const out = Object.fromEntries(MONEY_ITEMS.map((i) => [i.key, 0])) as Record<MoneyKey, number>;
  for (const l of lines) {
    const item = MONEY_ITEMS.find((i) => i.match.test(l.label.trim()));
    if (item) out[item.key] = round2(out[item.key] + (Number(l.amount) || 0));
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "Single" / "Twin 1" - a bed's occupancy */
export const bedOccupancy = (label: string) => (/twin/i.test(label) ? "twin" : /unit/i.test(label) ? "unit" : "single");

/* ------------------------------------------------------- the money preview */

/**
 * The words of the money preview (Dani, 15 Oct 2026) - the review, the draft
 * invoice and the draft credit note print the same ones. A fee paid by credit
 * is the full fee, then the credit on its own line, then the balance - never
 * "waived" (that is a real let-off) and never the fee at RM0.
 */
export const MONEY_LABEL = {
  initialPayment: "Initial Payment invoice",
  creditApplied: "Less: account credit applied",
  balanceDue: "Balance due",
  accountCredit: "Account credit",
  totalCredit: "Total credit",
  remainingCredit: "Remaining credit",
  contractualRent: "Contractual monthly rent",
  rent: "Rent",
  creditNote: "Credit note",
  creditHeld: "Account credit held before this change",
  depositReduction: (label: string) => `${label} reduction`,
  billedRentCredit: (range: string) => `Rent already billed, ${range}`,
  appliedTo: (what: string) => `Applied to ${what}`,
} as const;

/** one event of the request, as the outlook needs it */
export type OutlookEvent = {
  name: string;
  date: string;
  /** the event's IP total - deposit differences and fees */
  ipTotal: number;
  /** each lower deposit, now account credit (given on confirm) */
  depositCredit: { label: string; amount: number }[];
  /** cheaper rent for days already billed - credit given when the IP is settled */
  rentCredit: { label: string; amount: number } | null;
  /** dearer rent for days already billed - an RP adjustment raised when settled */
  adjustment: { label: string; amount: number } | null;
};

/** an invoice the credit can go to, in the order it would take it */
export type OutlookTarget = { id: string; label: string; date: string; owing: number; kind: "invoice" | "rent" };

/**
 * Where the account credit goes once the change is confirmed (Dani, 15 Oct
 * 2026), in the order the system really applies it:
 *   1. on confirm, the credit there and each lower deposit go on the event's
 *      own IP first (applyAccountCredit with only that IP)
 *   2. the rest goes to the invoices still owing and the rent still to bill,
 *      oldest first (planCredit - the same rule the credit note is issued by)
 *   3. what no invoice can take is the credit note's amount
 * Credit is spent first-in first-out, so each use can name where it came from:
 * "arising from Event 1" when one event's credit pays the next one's IP.
 */
export function changeCreditOutlook(balance: number, events: OutlookEvent[], targets: OutlookTarget[]) {
  type Part = { from: number; amount: number };
  const pool: Part[] = balance > 0.005 ? [{ from: -1, amount: round2(balance) }] : [];
  const take = (want: number) => {
    const used: Part[] = [];
    let left = round2(want);
    while (left > 0.005 && pool.length) {
      const p = pool[0]!;
      const n = round2(Math.min(p.amount, left));
      used.push({ from: p.from, amount: n });
      p.amount = round2(p.amount - n);
      left = round2(left - n);
      if (p.amount <= 0.005) pool.shift();
    }
    return used;
  };
  const given: { label: string; amount: number; event: number }[] = [];
  if (balance > 0.005) given.push({ label: MONEY_LABEL.creditHeld, amount: round2(balance), event: -1 });
  const perEvent = events.map((e, i) => {
    for (const d of e.depositCredit)
      if (d.amount > 0.005) {
        pool.push({ from: i, amount: round2(d.amount) });
        given.push({ label: MONEY_LABEL.depositReduction(d.label), amount: round2(d.amount), event: i });
      }
    const used = take(e.ipTotal);
    const applied = round2(used.reduce((n, u) => n + u.amount, 0));
    // credit from an earlier event of this request, named formally
    const fromEvents = [...new Set(used.filter((u) => u.from >= 0 && u.from !== i).map((u) => u.from))];
    if (e.rentCredit && e.rentCredit.amount > 0.005) {
      pool.push({ from: i, amount: round2(e.rentCredit.amount) });
      given.push({ label: e.rentCredit.label, amount: round2(e.rentCredit.amount), event: i });
    }
    return { ipTotal: round2(e.ipTotal), creditApplied: applied, balanceDue: round2(e.ipTotal - applied), fromEvents };
  });
  const left = round2(pool.reduce((n, p) => n + p.amount, 0));
  const ordered = [...targets].filter((t) => t.owing > 0.005).sort((a, b) => a.date.localeCompare(b.date));
  const { plan, leftover } = planCredit(left, ordered);
  const credited = plan.filter((p) => p.credit > 0.005).map((p) => ({ ...ordered.find((t) => t.id === p.id)!, credit: p.credit, after: p.after }));
  const totalGiven = round2(given.reduce((n, g) => n + g.amount, 0));
  return {
    events: perEvent,
    /** every credit given: held before, each lower deposit, cheaper billed rent */
    given,
    totalGiven,
    /** what is left after every IP of the request */
    afterIps: left,
    /** each invoice or rent the rest goes to, and what is still to pay on it */
    credited,
    leftover,
  };
}

/** "October 2027" for a calendar month, else "1 Oct 2027 – 15 Oct 2027" */
export function periodName(start: string, end: string) {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const a = d(start);
  const b = d(end);
  const lastDay = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 0)).getUTCDate();
  if (a.getUTCDate() === 1 && b.getUTCFullYear() === a.getUTCFullYear() && b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() === lastDay)
    return a.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const f = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${f(a)} – ${f(b)}`;
}
