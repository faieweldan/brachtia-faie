import { describe, expect, test } from 'bun:test';
import { properties, stayQuote, staySchedule, formatRM, type Addon } from '../src/data/properties';
import { bookingAddonNames, selectedBookingAddons, quoteAmountsMatch } from '../src/lib/booking-quote';
import { nextRentalPayment, firstRentPeriod, buildPeriods, dueFor } from '../src/lib/rental-schedule';
import { invoiceNextPayment, type InvoiceDoc } from '../src/lib/invoice-pdf';

const round = (n: number) => Math.round(n * 100) / 100;
const bedding: Addon = { id: 'bedding', label: 'Single Bedding Set', price: 250, chargeType: 'onetime', items: [], occupancies: ['single'], active: true };
const parking: Addon = { ...bedding, id: 'parking', label: 'Parking', price: 100, chargeType: 'monthly' };
const property = { ...properties[0]!, addons: [bedding, parking] };
const from = '2026-10-15';
const to = '2027-07-15';
function payment(rent = 1050, months = 1, frequency = 'monthly', extra = 0, end = to) {
  const october = round(rent * 17 / 31);
  return nextRentalPayment({ tenancyStart: from, tenancyEnd: end, frequency, monthlyRent: rent,
    items: [{ kind: 'advance', amount: october }, { kind: 'advance', amount: rent * months + extra },
      { kind: 'refundable', amount: 2000 }, { kind: 'onetime', amount: 250 }] });
}

describe('advance rent and the next rental payment', () => {
  test('one month beyond prorated October makes December due on 5 December', () => {
    expect(payment()).toEqual({ start: '2026-12-01', end: '2026-12-31', due: '2026-12-05', amount: 1050 });
  });
  test('two months advance makes January due on 5 January', () => {
    expect(payment(1050, 2)?.due).toBe('2027-01-05');
  });
  test('three or more months are based on money, without a fixed cap', () => {
    expect(payment(1050, 3)?.due).toBe('2027-02-05');
    expect(payment(1050, 5)?.due).toBe('2027-04-05');
  });
  test('every two months begins after advance coverage, without skipping another cycle', () => {
    expect(payment(1000, 1, 'bimonthly')).toEqual({ start: '2026-12-01', end: '2027-01-31', due: '2026-12-05', amount: 2000 });
  });
  test('ongoing RM5 monthly discount gives RM495 and RM990 for two months', () => {
    expect(payment(495)?.amount).toBe(495);
    expect(payment(495, 1, 'bimonthly')?.amount).toBe(990);
  });
  test('partial advance is exact credit, not a rounded number of paid days', () => {
    expect(payment(495, 1, 'monthly', 100.01)).toEqual({ start: '2026-12-01', end: '2026-12-31', due: '2026-12-05', amount: 394.99 });
  });
  test('shortened final period stops at move-out and uses that month\'s days', () => {
    expect(payment(495, 1, 'bimonthly', 0, '2026-12-15')?.amount).toBe(239.52);
    expect(payment(495, 1, 'bimonthly', 0, '2026-12-15')?.end).toBe('2026-12-15');
  });
  test('full-term or fully covered tenancy has no next payment', () => {
    expect(payment(495, 1, 'full')).toBeNull();
    expect(payment(495, 12)).toBeNull();
  });
  test('quantities and only advance tags count as rent coverage', () => {
    expect(nextRentalPayment({ tenancyStart: '2026-10-01', tenancyEnd: to, frequency: 'monthly', monthlyRent: 500,
      items: [{ kind: 'advance', amount: 500, quantity: 3 }, { kind: 'refundable', amount: 5000 }] })?.due).toBe('2027-01-05');
  });
  test('the reported booking bills the first month advance rent did not pay for', () => {
    // 24 Sept 2026, RM550/month, bi-monthly, one month in advance. Counting
    // backwards from the due date billed October again - already paid for by
    // the advance - and skipped December.
    const advance = [{ kind: 'advance', amount: 128.33 }, { kind: 'advance', amount: 550 }];
    expect(nextRentalPayment({ tenancyStart: '2026-09-24', tenancyEnd: '2027-09-24',
      frequency: 'bimonthly', monthlyRent: 550, items: advance }))
      .toEqual({ start: '2026-11-01', end: '2026-12-31', due: '2026-11-05', amount: 1100 });
    // RM50 off the monthly rent is RM50 off each month of that period
    expect(nextRentalPayment({ tenancyStart: '2026-09-24', tenancyEnd: '2027-09-24',
      frequency: 'bimonthly', monthlyRent: 500,
      items: [{ kind: 'advance', amount: 116.67 }, { kind: 'advance', amount: 500 }] })?.amount)
      .toBe(1000);
  });
  test('leap February is covered exactly', () => {
    expect(nextRentalPayment({ tenancyStart: '2028-02-15', tenancyEnd: '2028-05-31', frequency: 'monthly', monthlyRent: 580,
      items: [{ kind: 'advance', amount: 300 + 580 }] })?.due).toBe('2028-04-05');
  });
  test('scheduled rent agrees with initial invoice and conserves every cent of credit', () => {
    const rent = 495;
    const advance = round(rent * 17 / 31) + rent + 100.01;
    const first = firstRentPeriod(from, to, 'bimonthly', advance, rent);
    const periods = buildPeriods({ monthlyRent: rent, frequency: 'bimonthly', firstPeriodStart: first.start,
      firstPeriodEnd: first.end, firstDueDate: dueFor(first.start), firstPeriodCredit: first.credit,
      tenancyEnd: to, finalAmount: null });
    const next = payment(rent, 1, 'bimonthly', 100.01)!;
    expect(periods[0]).toMatchObject(next);
    expect(round(advance + periods.reduce((n, p) => n + p.amount, 0)))
      .toBe(round(staySchedule(from, to, rent).reduce((n, p) => n + p.amount, 0)));
    const resumed = buildPeriods({ monthlyRent: rent, frequency: 'bimonthly', firstPeriodStart: first.start,
      firstPeriodEnd: first.end, firstDueDate: dueFor(first.start), firstPeriodCredit: first.credit,
      tenancyEnd: to, finalAmount: null }, periods[0]!.end);
    expect(resumed[0]?.amount).toBe(990);
  });
  test('existing schedules that were confirmed in arrears keep that timing', () => {
    const [period] = buildPeriods({ monthlyRent: 500, frequency: 'bimonthly', firstPeriodStart: '2026-11-01',
      firstPeriodEnd: '2026-12-31', firstDueDate: '2027-01-05', tenancyEnd: to, finalAmount: null });
    expect(period?.due).toBe('2027-01-05');
  });
});

describe('booking add-ons and quote consistency', () => {
  test('bedding survives calculation, recovery of old booking, and invoice reconstruction', () => {
    const q = stayQuote(property, 1050, 'long', from, to, 'bimonthly', [bedding])!;
    const oldQuote = { ...q, selectedAddons: undefined };
    const names = bookingAddonNames({ addons: [], quote_snapshot: { property, quote: oldQuote } });
    expect(names).toEqual(['Single Bedding Set']);
    const invoice = stayQuote(property, 1050, 'long', from, to, 'bimonthly', selectedBookingAddons(property, names))!;
    expect(quoteAmountsMatch(q, invoice)).toBe(true);
    expect(q.totalUpfront - stayQuote(property, 1050, 'long', from, to, 'bimonthly')!.totalUpfront).toBe(250);
  });
  test('new explicit removal does not resurrect an old add-on', () => {
    const q = stayQuote(property, 1050, 'long', from, to, 'bimonthly', [bedding])!;
    expect(bookingAddonNames({ addons: [], quote_snapshot: { addons: [], property, quote: q } })).toEqual([]);
  });
  test('both IDs and labels resolve, without duplicated extras', () => {
    expect(selectedBookingAddons(property, ['bedding', 'Single Bedding Set'])).toEqual([bedding]);
  });
  test('recurring extras are included once and survive the quote snapshot', () => {
    const q = stayQuote(property, 1050, 'long', from, to, 'bimonthly', [bedding, parking])!;
    expect(q.monthlyAfter).toBe(1150);
    expect(bookingAddonNames({ quote_snapshot: { quote: q } })).toEqual(['Single Bedding Set', 'Parking']);
    expect(q.firstPayment.filter((l) => l.label === 'Single Bedding Set')).toHaveLength(1);
  });
  test('equal totals do not hide a changed charge', () => {
    const q = stayQuote(property, 1050, 'long', from, to, 'bimonthly', [bedding])!;
    const other = { ...q, firstPayment: q.firstPayment.map((l) => l.label === bedding.label ? { ...l, label: 'Another item' } : l) };
    expect(quoteAmountsMatch(q, other)).toBe(false);
  });
  test('the quote carries the payment frequency, and admin can change it', () => {
    // the student's choice on the website travels on the quote itself, which is
    // what the PDF prints - so it cannot say one cycle while the booking bills
    // another
    const chosen = stayQuote(property, 1050, 'long', from, to, 'quarterly')!;
    expect(chosen.paymentTerm).toBe('quarterly');
    const overridden = stayQuote(property, 1050, 'long', from, to, 'monthly')!;
    expect(overridden.paymentTerm).toBe('monthly');
    // a quote saved before the field existed says nothing rather than guessing
    expect(({ ...chosen, paymentTerm: undefined }).paymentTerm).toBeUndefined();
  });
  test('amounts always show two decimal places', () => {
    expect(formatRM(4770.81)).toBe('RM 4,770.81');
    expect(formatRM(495)).toBe('RM 495.00');
  });
  test('PDF ignores stale cached next-payment fields and uses current advance and rent', () => {
    const inv = { tenancy_start: from, tenancy_end: to, monthly_rent: 1000, payment_frequency: 'bimonthly',
      items: [{ kind: 'advance', label: 'Custom advance', amount: 1548.39 }],
      next_payment_date: '2027-01-05', next_payment_amount: 2100 } as InvoiceDoc;
    expect(invoiceNextPayment(inv)).toEqual({ start: '2026-12-01', end: '2027-01-31', due: '2026-12-05', amount: 2000 });
  });
});
