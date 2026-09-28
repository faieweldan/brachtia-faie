import { describe, expect, test } from 'bun:test';
import { properties, stayQuote } from '../src/data/properties';
import { firstInvoiceLines } from '../src/lib/invoice-lines';
import { discountPerMonth } from '../src/lib/invoices';

const arc = properties[0]!;
const stay = { property: arc, addons: [], term: 'long' as const, moveIn: '2026-10-10', moveOut: '2027-10-09', frequency: 'bimonthly' as const };
const sum = (ls: { amount: number }[] | null) => (ls ?? []).reduce((n, l) => n + l.amount, 0);

describe("the booking's first invoice, worked out from the stay", () => {
  test('matches the quote exactly when there is no discount', () => {
    const lines = firstInvoiceLines({ ...stay, rent: 1050 });
    const q = stayQuote(arc, 1050, 'long', stay.moveIn, stay.moveOut, 'bimonthly', []);
    expect(lines?.map((l) => [l.label, l.amount])).toEqual(q!.firstPayment.map((l) => [l.label, l.amount]));
  });
  test('a discount lowers the rent the whole invoice is worked out from', () => {
    const rent = 1050 - discountPerMonth(1050, 'amount', 50);
    const lines = firstInvoiceLines({ ...stay, rent });
    const security = lines!.find((l) => l.label.startsWith('Security deposit'))!;
    expect(security.amount).toBe(rent * 2);
    expect(sum(lines)).toBeLessThan(sum(firstInvoiceLines({ ...stay, rent: 1050 })));
  });
  test('a short first month brings the extra month onto the invoice too', () => {
    const lines = firstInvoiceLines({ ...stay, rent: 1050, moveIn: '2026-09-20' });
    expect(lines!.some((l) => l.label === 'Additional advance rental (1 month)')).toBe(true);
  });
  test('every line is one amount - no quantity to multiply', () => {
    expect(firstInvoiceLines({ ...stay, rent: 1050 })!.every((l) => l.quantity === 1)).toBe(true);
  });
  test('no rent or no dates means nothing to invoice', () => {
    expect(firstInvoiceLines({ ...stay, rent: 0 })).toBeNull();
    expect(firstInvoiceLines({ ...stay, rent: 1050, moveIn: '' })).toBeNull();
  });
});
