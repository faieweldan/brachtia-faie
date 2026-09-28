import {
  stayQuote,
  type Addon,
  type ContractTerm,
  type PaymentTerm,
  type Property,
} from "@/data/properties";

/**
 * The lines of a booking's first invoice, worked out from the stay.
 *
 * One rule for two places: the invoice page, and Update quote on the booking,
 * which brings an unpaid invoice into line with a changed stay. Worked out in
 * two places, a changed stay could be quoted one way and invoiced another.
 *
 * `rent` is the rent the invoice charges - after any discount - and it already
 * includes monthly add-ons, as the booking's rent does. They are taken off
 * once here so the quote can add them back as their own lines.
 */
export type InvoiceLineInput = {
  property: Property;
  rent: number;
  addons: Addon[];
  term: ContractTerm;
  moveIn: string;
  moveOut: string;
  frequency: PaymentTerm;
};

export function firstInvoiceLines(i: InvoiceLineInput) {
  if (!i.property || !i.rent || !i.moveIn || !i.moveOut) return null;
  const monthlyExtras = i.addons
    .filter((a) => a.chargeType === "monthly")
    .reduce((sum, a) => sum + a.price, 0);
  const baseRent = Math.max(0, i.rent - monthlyExtras);
  const q = stayQuote(i.property, baseRent, i.term, i.moveIn, i.moveOut, i.frequency, i.addons);
  if (!q) return null;
  return q.firstPayment.map((l) => ({
    label: l.label,
    kind: String(l.kind),
    amount: Number(l.amount || 0),
    quantity: 1,
  }));
}
