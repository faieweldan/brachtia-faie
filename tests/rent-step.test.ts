import { describe, expect, test } from "bun:test";

import { billedDifference, rentForDays, splitAtStep, type RentStep } from "@/lib/rental-schedule";

// Dani's example (6 Oct 2026): RM 1,050 -> RM 1,400, moving on 15 Nov, a bi-monthly cycle 1 Nov - 31 Dec
const step: RentStep = { id: "s1", from: "2026-11-15", oldRent: 1050, newRent: 1400 };

describe("a room change mid-period", () => {
  test("a day is the month's rent over that month's real days", () => {
    expect(rentForDays("2026-11-01", "2026-11-14", 1050)).toBe(490);
    expect(rentForDays("2026-11-15", "2026-11-30", 1400)).toBe(746.67);
    expect(rentForDays("2026-12-01", "2026-12-31", 1400)).toBe(1400);
  });

  test("the period holding the move is split at the move date", () => {
    const s = splitAtStep({ start: "2026-11-01", end: "2026-12-31", amount: 2800 }, step);
    expect(s.before).toEqual({ start: "2026-11-01", end: "2026-11-14", amount: 490 });
    expect(s.after?.start).toBe("2026-11-15");
    expect(s.amount).toBe(2636.67);
    expect(s.after?.amount).toBe(2146.67);
  });

  test("a period after the move is untouched; one before it is all at the old rent", () => {
    expect(splitAtStep({ start: "2027-01-01", end: "2027-02-28", amount: 2800 }, step).amount).toBe(2800);
    const early = splitAtStep({ start: "2026-09-01", end: "2026-10-31", amount: 2800 }, step);
    expect(early.amount).toBe(2100);
    expect(early.after).toBeNull();
  });

  test("a move inside a period already billed at the old rent", () => {
    // dearer: 16 Nov days + December owed on top
    expect(billedDifference({ start: "2026-11-01", end: "2026-12-31" }, step)).toBe(536.67);
    // cheaper: the same days come back, off the next rent invoice
    expect(billedDifference({ start: "2026-11-01", end: "2026-12-31" }, { ...step, oldRent: 1400, newRent: 1050 })).toBe(-536.67);
    // the move is after this period: nothing
    expect(billedDifference({ start: "2026-09-01", end: "2026-10-31" }, step)).toBe(0);
  });
});
