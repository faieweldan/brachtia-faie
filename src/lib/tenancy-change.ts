/*
 * Update Tenancy - the rules (agreed with Dani, 2-3 Oct 2026). Pure functions,
 * shared by the dialog and the server, and tested in tests/tenancy-change.test.ts.
 *
 * Admin goes through three steps, each showing what the resident has now:
 *   1 occupancy   2 room (in any unit)   3 end date (same or later only -
 *   a shorter tenancy is Checkout > Early termination)
 * More than one can change at once. What changed decides:
 *   - the kind of date change: later by 6 months or more from the old end
 *     date is a renewal (prevailing rate, a new agreement); less than 6
 *     months is an extension (same terms, the same agreement) - Dani, 5 Oct 2026
 *   - the money: each initial-payment item, original against new. A higher
 *     amount is invoiced (linked to the initial payment) unless admin waives it;
 *     a lower one is kept and comes back at checkout. The monthly rent always
 *     changes, and is never waived
 *   - the documents: each made once, however many changes need it (one new
 *     Schedule A carries the new room and the new date)
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

/** the old end date plus 6 months, the line between an extension and a renewal */
export function sixMonthsAfter(end: string): string {
  const [y, m, d] = end.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + 6, 1));
  // the same day of the month, or the month's last day when it has fewer days
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

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

/* --------------------------------------------------------------- the money */

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

export type MoneyRow = { key: MoneyKey | "rent"; label: string; original: number; next: number; difference: number };

export function compareMoney(
  original: Record<MoneyKey, number>,
  next: Record<MoneyKey, number>,
  rent: { original: number; next: number },
): MoneyRow[] {
  return [
    { key: "rent", label: "Monthly rent", original: rent.original, next: rent.next, difference: round2(rent.next - rent.original) },
    ...MONEY_ITEMS.map((i) => ({
      key: i.key,
      label: i.label,
      original: original[i.key],
      next: next[i.key],
      difference: round2(next[i.key] - original[i.key]),
    })),
  ];
}

/**
 * What the resident pays now: every initial-payment item that went up. The
 * rent is left out - it changes the rent invoices instead. A lower item is
 * not paid back now; the deposit already held comes back at checkout.
 */
export function topUpLines(rows: MoneyRow[], waived: string[] = []) {
  return rows
    // each item can be waived on its own (Dani, 5 Oct 2026)
    .filter((r) => r.key !== "rent" && r.difference > 0 && !waived.includes(r.key))
    .map((r) => ({
      label: `${r.label} - difference`,
      amount: r.difference,
      // deposits stay refundable, so checkout counts them
      kind: r.key === "admin" || r.key === "card_charge" ? "onetime" : "refundable",
    }));
}

export const topUpTotal = (rows: MoneyRow[], waived: string[] = []) => round2(topUpLines(rows, waived).reduce((n, l) => n + l.amount, 0));

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "Single" / "Twin 1" - a bed's occupancy */
export const bedOccupancy = (label: string) => (/twin/i.test(label) ? "twin" : /unit/i.test(label) ? "unit" : "single");
