import { describe, expect, test } from "bun:test";

import { planCredit } from "../src/lib/credit-plan";

describe("account credit: next rent first, then the rest, then a credit note", () => {
  test("a credit smaller than the next rent comes off that rent only", () => {
    const { plan, leftover } = planCredit(100, [
      { id: "oct", owing: 750 },
      { id: "nov", owing: 750 },
    ]);
    expect(plan[0]).toEqual({ id: "oct", owing: 750, credit: 100, after: 650 });
    expect(plan[1]!.credit).toBe(0);
    expect(leftover).toBe(0);
  });

  test("more than one rent: the overflow goes onto the next", () => {
    const { plan, leftover } = planCredit(1000, [
      { id: "oct", owing: 750 },
      { id: "nov", owing: 750 },
    ]);
    expect(plan.map((p) => p.after)).toEqual([0, 500]);
    expect(leftover).toBe(0);
  });

  test("more than every rent left: only the rest becomes a credit note", () => {
    expect(planCredit(1000, [{ id: "dec", owing: 750 }]).leftover).toBe(250);
  });

  test("paid the whole term up front: all of it is a credit note", () => {
    expect(planCredit(898, []).leftover).toBe(898);
  });

  test("an invoice already paid takes nothing", () => {
    expect(planCredit(50, [{ id: "paid", owing: 0 }]).plan).toEqual([]);
  });
});
