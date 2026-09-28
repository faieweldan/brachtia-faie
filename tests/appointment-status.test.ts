import { describe, expect, test } from 'bun:test';
import { statusWhenOpened, statusWithStaff } from '../src/lib/appointment-status';

describe('opening an appointment', () => {
  test('a new one nobody is taking becomes pending', () => {
    expect(statusWhenOpened('new', '')).toBe('pending');
  });
  test('a new one somebody is already taking becomes confirmed', () => {
    expect(statusWhenOpened('new', 'Syazwani')).toBe('confirmed');
  });
  test('opening anything that is not new changes nothing', () => {
    for (const s of ['pending', 'confirmed', 'completed', 'no_show', 'cancelled'])
      expect(statusWhenOpened(s, 'Syazwani')).toBe(s);
  });
});

describe('assigning staff', () => {
  test('a staff member taking it confirms it', () => {
    expect(statusWithStaff('pending', 'Syazwani')).toBe('confirmed');
    expect(statusWithStaff('new', 'Syazwani')).toBe('confirmed');
  });
  test('taking the staff member off puts it back to pending', () => {
    expect(statusWithStaff('confirmed', '')).toBe('pending');
  });
  test('whitespace is not a staff member', () => {
    expect(statusWithStaff('pending', '   ')).toBe('pending');
  });
  test("admin's final answers are never overwritten", () => {
    for (const s of ['completed', 'no_show', 'cancelled']) {
      expect(statusWithStaff(s, 'Syazwani')).toBe(s);
      expect(statusWithStaff(s, '')).toBe(s);
    }
  });
});
