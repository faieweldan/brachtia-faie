import { describe, expect, test } from 'bun:test';
import { partPaidUrgency } from '../src/lib/payment-status';

const today = '2026-09-29';
const inv = (dueDate: string, paid = 500, outstanding = 1000) => ({ dueDate, paid, outstanding });

describe('the colour of a part-paid row', () => {
  test('late is red', () => expect(partPaidUrgency(inv('2026-09-20'), today)).toBe('late'));
  test('due within 7 days is yellow', () => expect(partPaidUrgency(inv('2026-10-06'), today)).toBe('soon'));
  test('due later is left plain', () => expect(partPaidUrgency(inv('2026-10-20'), today)).toBeNull());
  test('nothing paid is not part-paid', () => expect(partPaidUrgency(inv('2026-09-20', 0), today)).toBeNull());
  test('fully paid is not part-paid', () => expect(partPaidUrgency(inv('2026-09-20', 1500, 0), today)).toBeNull());
  test('no due date, no colour', () => expect(partPaidUrgency(inv(''), today)).toBeNull());
});
