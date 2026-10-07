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

/** the fixed Schedule B charges an event carries - none for a date change alone */
export function fixedCharges(f: ChangeFlags) {
  return [
    ...(isMove(f) ? [{ key: "change_fee", label: "Resident-requested room/unit change", amount: 100 }] : []),
    ...(f.unit ? [{ key: "card_change", label: "Additional access card following room/unit change", amount: 20 }] : []),
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
