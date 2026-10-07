import { describe, expect, test } from "bun:test";

import { billedDifference, rentForDays, splitAtStep, splitAtSteps, type RentStep } from "@/lib/rental-schedule";

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

// the agreed examples (7 Oct 2026)
describe("several rent changes", () => {
  test("16 Dec move, RM400 -> RM500: 193.55 + 258.06 = 451.61", () => {
    const s = splitAtSteps({ start: "2026-12-01", end: "2026-12-31", amount: 500 }, [{ id: "a", from: "2026-12-16", oldRent: 400, newRent: 500, kind: "room" }], 500)!;
    expect(s.segments.map((x) => x.amount)).toEqual([193.55, 258.06]);
    expect(s.amount).toBe(451.61);
  });
  test("room change 11 Nov, then renewal 1 Dec at RM550: November split, December at the renewal rate", () => {
    const steps: RentStep[] = [
      { id: "a", from: "2026-11-11", oldRent: 400, newRent: 500, kind: "room" },
      { id: "b", from: "2026-12-01", oldRent: 500, newRent: 550, kind: "renewal" },
    ];
    const nov = splitAtSteps({ start: "2026-11-01", end: "2026-11-30", amount: 550 }, steps, 550)!;
    expect(nov.segments.map((x) => [x.label, x.amount])).toEqual([["previous room", 133.33], ["new room", 333.33]]);
    expect(nov.amount).toBe(466.66);
    expect(splitAtSteps({ start: "2026-12-01", end: "2026-12-31", amount: 550 }, steps, 550)).toBeNull();
  });
  test("renewal alone: the rent before the old end date stays as it was", () => {
    const steps: RentStep[] = [{ id: "b", from: "2026-12-01", oldRent: 500, newRent: 550, kind: "renewal" }];
    expect(splitAtSteps({ start: "2026-11-01", end: "2026-11-30", amount: 550 }, steps, 550)!.amount).toBe(500);
  });
});
