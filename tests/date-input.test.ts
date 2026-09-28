import { describe, expect, test } from 'bun:test';
import { dmyToIso, isoToDmy } from '../src/components/ui/date-input';

describe('dates read day first', () => {
  test('a stored date shows as dd/mm/yyyy', () => {
    expect(isoToDmy('2026-10-03')).toBe('03/10/2026');
  });
  test('what is typed is saved the way the database keeps it', () => {
    expect(dmyToIso('03/10/2026')).toBe('2026-10-03');
  });
  test('03/10 is the third of October, never the tenth of March', () => {
    expect(dmyToIso('03/10/2026')).not.toBe('2026-03-10');
  });
  test('a day that does not exist is refused, not rolled into next month', () => {
    expect(dmyToIso('31/02/2026')).toBe('');
    expect(dmyToIso('29/02/2026')).toBe('');
    expect(dmyToIso('29/02/2028')).toBe('2028-02-29'); // a leap year
  });
  test('half a date is not a date', () => {
    expect(dmyToIso('03/10/20')).toBe('');
    expect(isoToDmy('')).toBe('');
  });
});
