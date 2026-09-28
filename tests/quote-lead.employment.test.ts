import { describe, expect, test } from 'bun:test';
import { employmentRow } from '../src/lib/quote-pdf';
import { quoteSnapshotFor } from '../src/lib/booking-quote';

const base = { name: 'Ali', university: '', intake: '', nationality: 'Malaysia', gender: 'Male', email: 'a@b.c', mobile: '0123' };

describe('what the quote says the person does', () => {
  test('a student gets their university and intake', () => {
    expect(employmentRow({ ...base, currentStatus: 'student', university: 'MMU', intake: 'Sept 2026' }))
      .toEqual([['University', 'MMU  ·  Intake Sept 2026']]);
  });
  test('somebody working gets their job and company', () => {
    expect(employmentRow({ ...base, currentStatus: 'employed', occupation: 'Guard', company: 'MCMC' }))
      .toEqual([['Employment', 'Guard  ·  MCMC']]);
  });
  test('working with no company is self-employed, said out loud', () => {
    expect(employmentRow({ ...base, currentStatus: 'employed', occupation: 'Software dev', company: '' }))
      .toEqual([['Employment', 'Software dev  ·  Self-employed']]);
  });
  test('somebody working never gets an empty University row', () => {
    const row = employmentRow({ ...base, currentStatus: 'employed', occupation: 'Cleaner', company: 'Misma' });
    expect(row.some(([label]) => label === 'University')).toBe(false);
  });
  test('an older quote with no answer on file still reads its job', () => {
    expect(employmentRow({ ...base, occupation: 'Guard', company: 'MCMC' }))
      .toEqual([['Employment', 'Guard  ·  MCMC']]);
  });
  test('nothing known means no row, not a row of blanks', () => {
    expect(employmentRow({ ...base })).toEqual([]);
  });
});

describe('one quote, whoever opens it', () => {
  test('the saved payment frequency reaches the document', () => {
    const snap = { paymentTerm: 'bimonthly', lead: { ...base, currentStatus: 'employed' } };
    expect((quoteSnapshotFor({ quote_snapshot: snap }) as any).paymentTerm).toBe('bimonthly');
  });
  test('an older quote learns studying or working from the booking', () => {
    const lead = quoteSnapshotFor({ quote_snapshot: { lead: { ...base } }, current_status: 'employed' }).lead as any;
    expect(lead.currentStatus).toBe('employed');
  });
});
