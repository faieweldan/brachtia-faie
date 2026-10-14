import { describe, expect, test } from "bun:test";
import {
  depositKind,
  depositsHeld,
  nextCycleMonth,
  rentForecast,
} from "../src/lib/dashboard-money";

const today = "2026-10-12";
const rows = [
  { dueDate: "2026-10-05", amount: 999, frequency: "monthly" }, // this cycle, not the next
  { dueDate: "2026-11-05", amount: 100, frequency: "monthly" },
  { dueDate: "2026-11-05", amount: 50, frequency: "bimonthly" },
  { dueDate: "2026-12-05", amount: 10, frequency: "quarterly" },
  { dueDate: "2027-01-05", amount: 1, frequency: "monthly" },
  { dueDate: "2027-01-05", amount: 7, frequency: "semiannual" },
];

describe("deposits held", () => {
  test("each line goes to its kind by name", () => {
    expect(depositKind("Utility Deposit")).toBe("utility");
    expect(depositKind("Security deposit")).toBe("security");
    expect(depositKind("Access Card Deposit")).toBe("access");
  });
  test("total equals the parts; credit moves come off", () => {
    const h = depositsHeld([
      { label: "Utility Deposit", amount: 300 },
      { label: "Security Deposit", amount: 500 },
      { label: "Access card", amount: 50 },
      { label: "Security Deposit", amount: -200 },
    ]);
    expect(h.byKind).toEqual({ security: 300, utility: 300, access: 50, other: 0 });
    expect(h.total).toBe(650);
  });
  test("nothing held is zero, not negative", () => {
    expect(depositsHeld([{ label: "Security", amount: -5 }]).total).toBe(0);
  });
});

describe("rent forecast", () => {
  test("next cycle is the month after today, across the year", () => {
    expect(nextCycleMonth(today)).toBe("2026-11");
    expect(nextCycleMonth("2026-12-31")).toBe("2027-01");
  });
  test("headline counts the next cycle only", () => {
    expect(rentForecast(rows, today, "month", "all").next).toEqual({ amount: 150, count: 2 });
  });
  test("by month, from the next cycle on", () => {
    const f = rentForecast(rows, today, "month", "all");
    expect(f.periods.map((p) => [p.key, p.amount, p.count])).toEqual([
      ["2026-11", 150, 2],
      ["2026-12", 10, 1],
      ["2027-01", 8, 2],
    ]);
  });
  test("by quarter; a begun quarter is marked partial", () => {
    const f = rentForecast(rows, today, "quarter", "all");
    expect(f.periods.map((p) => [p.key, p.amount, p.partial])).toEqual([
      ["2026-Q4", 160, true],
      ["2027-Q1", 8, false],
    ]);
  });
  test("frequency filter changes total, count and periods", () => {
    const m = rentForecast(rows, today, "month", "monthly");
    expect(m.next).toEqual({ amount: 100, count: 1 });
    expect(m.periods.map((p) => p.key)).toEqual(["2026-11", "2027-01"]);
    expect(rentForecast(rows, today, "month", "quarterly").next.count).toBe(0);
  });
  test("nothing due gives no periods", () => {
    expect(rentForecast([], today, "month", "all")).toMatchObject({
      next: { amount: 0, count: 0 },
      periods: [],
    });
  });
});

describe("the angles tally", () => {
  const { frequencyOptions } = require("../src/lib/dashboard-money");
  test("buttons cover every frequency with rent due, so they add up to All", () => {
    const opts = frequencyOptions(rows, today).map((o: { value: string }) => o.value);
    expect(opts).toEqual(["all", "monthly", "bimonthly", "quarterly", "semiannual"]);
    const parts = opts
      .slice(1)
      .reduce((n: number, f: string) => n + rentForecast(rows, today, "month", f).total.amount, 0);
    expect(parts).toBe(rentForecast(rows, today, "month", "all").total.amount);
  });
  test("months and quarters add up to the same total", () => {
    for (const f of ["all", "monthly", "bimonthly"]) {
      const m = rentForecast(rows, today, "month", f),
        q = rentForecast(rows, today, "quarter", f);
      const sum = (ps: { amount: number }[]) => ps.reduce((n, p) => n + p.amount, 0);
      expect(sum(m.periods)).toBe(m.total.amount);
      expect(sum(q.periods)).toBe(m.total.amount);
    }
  });
});
