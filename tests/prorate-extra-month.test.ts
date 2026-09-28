import { describe, expect, test } from 'bun:test';
import { properties, stayQuote, type PaymentTerm } from '../src/data/properties';
import { nextRentalPayment } from '../src/lib/rental-schedule';

const arc = properties[0]!;
const RENT = 1050;
const firstPayment = (moveIn: string, term: PaymentTerm = 'bimonthly', moveOut = '2027-12-30') =>
  stayQuote(arc, RENT, 'long', moveIn, moveOut, term, [])!.firstPayment;
const extraLine = (lines: { label: string }[]) => lines.find((l) => l.label.startsWith('Additional advance rental'));

describe('the extra month for a short first month', () => {
  test('22 pro-rated days (moving in 10 Oct) changes nothing', () => {
    expect(extraLine(firstPayment('2026-10-10'))).toBeUndefined();
  });
  test('11 pro-rated days (moving in 20 Sep) adds one month, on its own line', () => {
    const line = extraLine(firstPayment('2026-09-20'));
    expect(line?.label).toBe('Additional advance rental (1 month)');
    expect((line as any).amount).toBe(RENT);
    expect((line as any).kind).toBe('advance');
  });
  test('exactly 15 days changes nothing', () => {
    // 16 Sep to 30 Sep is 15 days
    expect(extraLine(firstPayment('2026-09-16'))).toBeUndefined();
  });
  test('14 days adds the month', () => {
    expect(extraLine(firstPayment('2026-09-17'))).toBeDefined();
  });
  test('it is the days that count, not the date: the 15th of February is only 14 days', () => {
    expect(extraLine(firstPayment('2027-02-15'))).toBeDefined();
    // while the 15th of a 31-day month leaves 17 days
    expect(extraLine(firstPayment('2026-10-15'))).toBeUndefined();
  });
  test('moving in on the 1st is a whole month, so nothing is added', () => {
    expect(extraLine(firstPayment('2026-10-01'))).toBeUndefined();
  });
  test('monthly and quarterly payers get it too', () => {
    expect(extraLine(firstPayment('2026-09-20', 'monthly'))).toBeDefined();
    expect(extraLine(firstPayment('2026-09-20', 'quarterly'))).toBeDefined();
  });
  test('full-term payers never get it - they pay the whole stay up front', () => {
    expect(extraLine(firstPayment('2026-09-20', 'full'))).toBeUndefined();
  });
});

describe('rent starts after the extra month', () => {
  test('moving in 20 Sep paying bi-monthly, the first rent bill starts in December, not November', () => {
    const q = stayQuote(arc, RENT, 'long', '2026-09-20', '2027-12-30', 'bimonthly', [])!;
    const next = nextRentalPayment({
      tenancyStart: '2026-09-20', tenancyEnd: '2027-12-30', frequency: 'bimonthly',
      monthlyRent: RENT, items: q.firstPayment,
    });
    expect(next?.start).toBe('2026-12-01');
  });
});
