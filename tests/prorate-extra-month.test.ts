import { describe, expect, test } from 'bun:test';
import { properties, stayQuote, type PaymentTerm } from '../src/data/properties';
import { nextRentalPayment } from '../src/lib/rental-schedule';

const arc = properties[0]!;
const RENT = 1050;
const firstPayment = (moveIn: string, term: PaymentTerm = 'bimonthly', moveOut = '2027-12-30') =>
  stayQuote(arc, RENT, 'long', moveIn, moveOut, term, [])!.firstPayment;
const advance = (lines: { label: string; amount: number }[]) =>
  lines.filter((l) => /advance rental/i.test(l.label));
// how many months the one Advance rental line covers; 0 when there is none
const advanceMonths = (lines: { label: string; amount: number }[]) => {
  const m = /^Advance rental \((\d+) months?\)/.exec(advance(lines)[0]?.label ?? '');
  return m ? Number(m[1]) : 0;
};

describe('the extra month for a short first month', () => {
  test('22 pro-rated days (moving in 10 Oct) changes nothing', () => {
    expect(advanceMonths(firstPayment('2026-10-10'))).toBe(1);
  });
  test('11 pro-rated days (moving in 20 Sep) adds one month to the same line', () => {
    const lines = firstPayment('2026-09-20');
    expect(advance(lines)).toHaveLength(1);
    expect(advance(lines)[0]!.label).toBe('Advance rental (2 months)');
    expect(advance(lines)[0]!.amount).toBe(RENT * 2);
  });
  test('there is never an "Additional advance rental" line', () => {
    for (const d of ['2026-09-20', '2026-09-28', '2027-02-15']) {
      expect(firstPayment(d).some((l) => /additional/i.test(l.label))).toBe(false);
    }
  });
  test('exactly 15 days changes nothing', () => {
    // 16 Sep to 30 Sep is 15 days
    expect(advanceMonths(firstPayment('2026-09-16'))).toBe(1);
  });
  test('14 days adds the month', () => {
    expect(advanceMonths(firstPayment('2026-09-17'))).toBe(2);
  });
  test('it is the days that count, not the date: the 15th of February is only 14 days', () => {
    expect(advanceMonths(firstPayment('2027-02-15'))).toBe(2);
    // while the 15th of a 31-day month leaves 17 days
    expect(advanceMonths(firstPayment('2026-10-15'))).toBe(1);
  });
  test('moving in on the 1st is a whole month, so nothing is added', () => {
    expect(advanceMonths(firstPayment('2026-10-01'))).toBe(1);
  });
  test('monthly and quarterly payers get it too', () => {
    expect(advanceMonths(firstPayment('2026-09-20', 'monthly'))).toBe(1);
    expect(advanceMonths(firstPayment('2026-10-10', 'quarterly'))).toBe(2);
    expect(advanceMonths(firstPayment('2026-09-20', 'quarterly'))).toBe(3);
  });
  test('full-term payers never get it - they pay the whole stay up front', () => {
    expect(advanceMonths(firstPayment('2026-09-20', 'full'))).toBe(0);
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
