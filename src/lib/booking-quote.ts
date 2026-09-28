import type { Addon, Property, StayQuote } from "@/data/properties";

/** The booking's own answers about the person, used to fill gaps in a snapshot. */
type BookingPerson = {
  full_name?: string | null;
  /** "student" or "employed", as the enquiry answered it */
  current_status?: string | null;
  university?: string | null;
  company?: string | null;
  occupation?: string | null;
  nationality?: string | null;
  gender?: string | null;
  email?: string | null;
  phone?: string | null;
  quote_snapshot?: unknown;
};

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

/**
 * The saved quote, with the person on it filled in from the booking.
 *
 * The snapshot taken when an enquiry is sent is what admin's copy of the quote
 * is built from. Its lead carried a university and an intake but never a
 * company or an occupation, so an employed applicant's quote named their
 * employer when they downloaded it themselves and said nothing about them when
 * staff opened the same quote - two papers, one reference, describing different
 * people.
 *
 * The snapshot still wins wherever it has an answer: it is the record of what
 * was quoted, and it must not be rewritten by a booking edited since. The
 * booking only fills the gaps - which is what makes this work for quotes saved
 * before the fields existed, where the gap is all there is.
 */
export function quoteLeadFrom(
  snapshot: { lead?: Record<string, unknown> } | null | undefined,
  row: BookingPerson | null | undefined,
): Record<string, unknown> {
  const pick = (fromSnap: unknown, fromRow: unknown) => {
    const s = String(fromSnap ?? "").trim();
    return s || String(fromRow ?? "").trim();
  };
  const lead = snapshot?.lead ?? {};
  return {
    ...lead,
    name: pick(lead["name"], row?.full_name),
    currentStatus: pick(lead["currentStatus"], row?.current_status),
    university: pick(lead["university"], row?.university),
    company: pick(lead["company"], row?.company),
    occupation: pick(lead["occupation"], row?.occupation),
    nationality: pick(lead["nationality"], row?.nationality),
    gender: pick(lead["gender"], row?.gender),
    email: pick(lead["email"], row?.email),
    mobile: pick(lead["mobile"], row?.phone),
  };
}

/**
 * The saved quote as its PDF is printed: snapshot, lead completed.
 *
 * The one way a quote becomes a document. Admin opens a booking's quote through
 * it, and the student's own download on the website goes through it too, with
 * the very snapshot that was saved - so the two copies cannot come out
 * different. They did: the website built its own, and left the payment
 * frequency off the student's copy.
 */
export function quoteSnapshotFor(row: BookingPerson | null | undefined) {
  const snapshot = (row?.quote_snapshot ?? {}) as { lead?: Record<string, unknown> };
  return { ...snapshot, lead: quoteLeadFrom(snapshot, row) };
}
