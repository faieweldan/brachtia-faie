/**
 * Change Room Before Tenancy Start (Dani, 9 Oct 2026): the money rules, kept
 * apart from the database so each payment state can be tested on its own.
 *
 * Before the tenancy starts a room change has no fee of any kind, keeps the
 * same booking, resident, tenancy, payments and receipts, and never voids the
 * initial invoice. What the initial payment becomes:
 *
 *   no invoice yet           nothing - the invoice, when raised, prices the new room
 *   same total               the same invoice gets the new room's details (a new version)
 *   not fully paid           the same invoice is revised to the new total (a new
 *                            version); payments stay on it; anything paid above
 *                            the new total becomes account credit
 *   fully paid, dearer       the paid invoice stays as it is; a new Initial
 *                            Payment invoice asks only for the difference
 *   fully paid, cheaper      the paid invoice stays as it is; the difference
 *                            becomes account credit, carried to rent
 *
 * On or after the tenancy start date, or once checked in, this is not used:
 * Update Tenancy is.
 */

export type MoneyLine = {
  label: string;
  kind: string;
  amount: number;
  quantity?: number | undefined;
};

export type RoomChangeMoney =
  | { kind: "none" }
  | { kind: "same"; total: number; outstanding: number }
  | {
      kind: "revise";
      oldTotal: number;
      newTotal: number;
      paid: number;
      outstanding: number;
      credit: number;
    }
  | { kind: "ip"; oldTotal: number; newTotal: number; difference: number; lines: MoneyLine[] }
  | { kind: "credit"; oldTotal: number; newTotal: number; difference: number; parts: CreditPart[] };

/** Credit from a cheaper room: the deposit part is kept apart, so checkout does not refund it twice. */
export type CreditPart = {
  amount: number;
  deposit?: "security" | "utility" | "card_deposit" | undefined;
  label: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const qty = (l: MoneyLine) => Math.max(1, Math.round(Number(l.quantity) || 1));
export const linesTotal = (lines: MoneyLine[]) =>
  r2(lines.reduce((n, l) => n + Number(l.amount || 0) * qty(l), 0));

/** The same charge on two invoices, whatever its month count says: "Advance rental (2 months)". */
const keyOf = (l: MoneyLine) =>
  `${l.kind}:${l.label
    .toLowerCase()
    .replace(/ - difference$/, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[\d.,]+/g, "")
    .replace(/\s+/g, " ")
    .trim()}`;

export function depositOf(label: string): CreditPart["deposit"] {
  const l = label.toLowerCase();
  if (!/deposit/.test(l)) return undefined;
  if (/security/.test(l)) return "security";
  if (/utilit/.test(l)) return "utility";
  if (/card|access/.test(l)) return "card_deposit";
  return undefined;
}

/** Charge by charge, new minus old - only what actually changed. */
export function lineDifferences(oldLines: MoneyLine[], newLines: MoneyLine[]) {
  const sum = (lines: MoneyLine[]) => {
    const m = new Map<string, MoneyLine & { total: number }>();
    for (const l of lines) {
      const k = keyOf(l);
      const was = m.get(k);
      m.set(k, { ...l, total: r2((was?.total ?? 0) + Number(l.amount || 0) * qty(l)) });
    }
    return m;
  };
  const before = sum(oldLines);
  const after = sum(newLines);
  const out: (MoneyLine & { difference: number })[] = [];
  for (const k of new Set([...before.keys(), ...after.keys()])) {
    const a = after.get(k);
    const b = before.get(k);
    const difference = r2((a?.total ?? 0) - (b?.total ?? 0));
    if (Math.abs(difference) > 0.005) out.push({ ...(a ?? b)!, difference });
  }
  return out;
}

export function planRoomChangeMoney(p: {
  /** the initial invoice now - none when it has not been raised */
  invoice: { total: number; lines: MoneyLine[] } | null;
  paid: number;
  /** the initial payment worked out for the new room */
  newLines: MoneyLine[];
}): RoomChangeMoney {
  if (!p.invoice) return { kind: "none" };
  const oldTotal = r2(p.invoice.total);
  const newTotal = linesTotal(p.newLines);
  const paid = r2(p.paid);
  const fullyPaid = paid + 0.005 >= oldTotal;

  if (Math.abs(newTotal - oldTotal) <= 0.005) {
    return { kind: "same", total: oldTotal, outstanding: r2(Math.max(0, oldTotal - paid)) };
  }
  if (!fullyPaid) {
    return {
      kind: "revise",
      oldTotal,
      newTotal,
      paid,
      outstanding: r2(Math.max(0, newTotal - paid)),
      credit: r2(Math.max(0, paid - newTotal)),
    };
  }
  const difference = r2(newTotal - oldTotal);
  const diffs = lineDifferences(p.invoice.lines, p.newLines);
  if (difference > 0) {
    // only the charges that went up; if some also went down, one line for the net
    const ups = diffs.filter((d) => d.difference > 0);
    const itemised = ups.length && diffs.every((d) => d.difference > 0);
    const lines: MoneyLine[] = itemised
      ? ups.map((d) => ({
          label: `${d.label} - difference`,
          kind: d.kind,
          amount: d.difference,
          quantity: 1,
        }))
      : [
          {
            label: "Initial payment difference - room change",
            kind: "rent",
            amount: difference,
            quantity: 1,
          },
        ];
    return { kind: "ip", oldTotal, newTotal, difference, lines };
  }
  // cheaper: the deposits that went down are credit kept apart from the rest
  const parts: CreditPart[] = [];
  let depositPart = 0;
  for (const d of diffs) {
    const key = depositOf(d.label);
    if (key && d.difference < 0) {
      parts.push({ amount: -d.difference, deposit: key, label: d.label });
      depositPart = r2(depositPart - d.difference);
    }
  }
  const rest = r2(-difference - depositPart);
  if (rest > 0.005) parts.push({ amount: rest, label: "Initial payment - room change" });
  // deposits down by more than the whole difference (rent went up): one plain credit for the net
  if (rest < -0.005) {
    return {
      kind: "credit",
      oldTotal,
      newTotal,
      difference: -difference,
      parts: [{ amount: -difference, label: "Initial payment - room change" }],
    };
  }
  return { kind: "credit", oldTotal, newTotal, difference: -difference, parts };
}

/**
 * A credit part as the review and the credit note both name it (14 Oct 2026):
 * a deposit that went down says which, the rest is the initial payment.
 */
export const creditPartLabel = (p: CreditPart) => (p.deposit ? `${p.label} - difference` : p.label);

/** Before the tenancy starts and before check-in - after that it is Update Tenancy's. */
export function beforeTenancyStart(
  start: string | null | undefined,
  checkedIn: boolean,
  today: string,
) {
  return !checkedIn && !!start && start.slice(0, 10) > today;
}

export const ROOM_CHANGE_REASONS = [
  "Current resident extended or renewed",
  "Resident requested another room",
  "Upgrade",
  "Downgrade",
  "Operational reassignment",
  "Other",
] as const;

/** Why a paid stay's dates moved before move-in (13 Oct 2026). */
export const STAY_DATE_REASONS = [
  "Semester dates changed",
  "Resident requested new dates",
  "Operational",
  "Other",
] as const;
