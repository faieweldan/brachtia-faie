import { describe, expect, test } from 'bun:test';
import { MIN_RESIDENT_AGE, latestBirthDate } from '../src/lib/resident-fields';

describe('residents are at least sixteen', () => {
  test('the age is sixteen', () => {
    expect(MIN_RESIDENT_AGE).toBe(16);
  });
  test('on 28 Sep 2026 the latest birthday allowed is 28 Sep 2010', () => {
    expect(latestBirthDate(new Date(2026, 8, 28))).toBe('2010-09-28');
  });
  test('turning sixteen today is old enough; tomorrow is not', () => {
    const latest = latestBirthDate(new Date(2026, 8, 28));
    expect('2010-09-28' <= latest).toBe(true);
    expect('2010-09-29' <= latest).toBe(false);
  });
  test('born on 29 Feb, they turn sixteen on 1 Mar in a year without one', () => {
    // 29 Feb 2028 minus 16 years is 29 Feb 2012, which exists
    expect(latestBirthDate(new Date(2028, 1, 29))).toBe('2012-02-29');
    // 28 Feb 2027 minus 16 is 28 Feb 2011
    expect(latestBirthDate(new Date(2027, 1, 28))).toBe('2011-02-28');
  });
});
