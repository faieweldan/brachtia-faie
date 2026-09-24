import type { Addon, Property, StayQuote } from "@/data/properties";

type BookingAddons = {
  addons?: unknown;
  quote_snapshot?: {
    addons?: string[];
    property?: Property;
    quote?: StayQuote;
  } | null;
};

/** Recover older submissions whose quote kept the extras but whose booking lost them. */
export function bookingAddonNames(row: BookingAddons): string[] {
  const names = Array.isArray(row.addons) ? row.addons.map(String) : [];
  if (names.length) return names;
  const snap = row.quote_snapshot;
  // An explicit empty selection on a newer quote means the extras were removed.
  if (Array.isArray(snap?.addons)) return snap.addons;
  if (snap?.quote?.selectedAddons) return snap.quote.selectedAddons.map((a) => a.label);
  return (snap?.property?.addons ?? [])
    .filter((a) => snap?.quote?.firstPayment.some((line) => line.label === a.label))
    .map((a) => a.label);
}

/** Saved bookings may name extras by either label or ID. */
export function selectedBookingAddons(property: Property, names: string[]): Addon[] {
  return (property.addons ?? []).filter((a) => names.includes(a.id) || names.includes(a.label));
}

/** Compare the actual charges, not just a total that two different quotes can share. */
export function quoteAmountsMatch(a: StayQuote, b: StayQuote): boolean {
  const cents = (n: number) => Math.round(Number(n || 0) * 100);
  return (
    cents(a.monthlyAfter) === cents(b.monthlyAfter) &&
    cents(a.totalUpfront) === cents(b.totalUpfront) &&
    a.firstPayment.length === b.firstPayment.length &&
    a.firstPayment.every((line, i) => {
      const other = b.firstPayment[i];
      return (
        other &&
        line.label === other.label &&
        line.kind === other.kind &&
        cents(line.amount) === cents(other.amount)
      );
    })
  );
}
