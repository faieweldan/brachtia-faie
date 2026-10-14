import { describe, expect, test } from "bun:test";

import {
  beforeTenancyStart,
  depositOf,
  lineDifferences,
  linesTotal,
  planRoomChangeMoney,
  type MoneyLine,
} from "../src/lib/room-change";

/*
 * Change Room Before Tenancy Start (Dani, 9 Oct 2026): what the initial
 * payment becomes, in every payment state.
 */
const lines = (rent: number, security: number, utility = 300): MoneyLine[] => [
  { label: "Advance rental (2 months)", kind: "rent", amount: rent * 2 },
  { label: "Security deposit (1 month)", kind: "refundable", amount: security },
  { label: "Utility deposit", kind: "refundable", amount: utility },
  { label: "Agreement fee", kind: "fee", amount: 100 },
];
const old = lines(650, 650); // 1300 + 650 + 300 + 100 = 2350
const dearer = lines(700, 700); // 1400 + 700 + 300 + 100 = 2500
const cheaper = lines(600, 600); // 1200 + 600 + 300 + 100 = 2200

describe("the boundary", () => {
  test("before the start date and not checked in: this flow", () => {
    expect(beforeTenancyStart("2026-10-20", false, "2026-10-09")).toBe(true);
  });
  test("on or after the start date, or checked in: Update Tenancy", () => {
    expect(beforeTenancyStart("2026-10-09", false, "2026-10-09")).toBe(false);
    expect(beforeTenancyStart("2026-10-01", false, "2026-10-09")).toBe(false);
    expect(beforeTenancyStart("2026-10-20", true, "2026-10-09")).toBe(false);
    expect(beforeTenancyStart("", false, "2026-10-09")).toBe(false);
  });
});

describe("the money", () => {
  test("no invoice yet: nothing to change", () => {
    expect(planRoomChangeMoney({ invoice: null, paid: 0, newLines: dearer }).kind).toBe("none");
  });

  test("same price: same invoice, balance unchanged", () => {
    const m = planRoomChangeMoney({
      invoice: { total: linesTotal(old), lines: old },
      paid: 500,
      newLines: lines(650, 650),
    });
    expect(m).toEqual({ kind: "same", total: 2350, outstanding: 1850 });
  });

  test("dearer, part of the booking fee paid: the same invoice is revised", () => {
    const m = planRoomChangeMoney({
      invoice: { total: 2350, lines: old },
      paid: 250,
      newLines: dearer,
    });
    expect(m).toMatchObject({
      kind: "revise",
      oldTotal: 2350,
      newTotal: 2500,
      outstanding: 2250,
      credit: 0,
    });
  });

  test("dearer, more than the booking fee but not all paid: still revised (RM2,000 / RM800 example)", () => {
    const m = planRoomChangeMoney({
      invoice: { total: 2000, lines: [{ label: "Advance rental", kind: "rent", amount: 2000 }] },
      paid: 800,
      newLines: [{ label: "Advance rental", kind: "rent", amount: 2300 }],
    });
    expect(m).toMatchObject({ kind: "revise", newTotal: 2300, outstanding: 1500 });
  });

  test("dearer, fully paid: an Initial Payment invoice for the difference only, charge by charge", () => {
    const m = planRoomChangeMoney({
      invoice: { total: 2350, lines: old },
      paid: 2350,
      newLines: dearer,
    });
    expect(m.kind).toBe("ip");
    if (m.kind !== "ip") return;
    expect(m.difference).toBe(150);
    expect(m.lines.map((l) => [l.label, l.amount])).toEqual([
      ["Advance rental (2 months) - difference", 100],
      ["Security deposit (1 month) - difference", 50],
    ]);
    // no room-change, admin, agreement or card fee
    expect(m.lines.some((l) => /fee/i.test(l.label))).toBe(false);
    expect(linesTotal(m.lines)).toBe(m.difference);
  });

  test("cheaper, not fully paid: revised down, outstanding reduced", () => {
    const m = planRoomChangeMoney({
      invoice: { total: 2350, lines: old },
      paid: 500,
      newLines: cheaper,
    });
    expect(m).toMatchObject({ kind: "revise", newTotal: 2200, outstanding: 1700, credit: 0 });
  });

  test("cheaper, paid above the revised total but not fully paid: only the excess becomes credit", () => {
    const m = planRoomChangeMoney({
      invoice: { total: 2350, lines: old },
      paid: 2300,
      newLines: cheaper,
    });
    expect(m).toMatchObject({ kind: "revise", newTotal: 2200, outstanding: 0, credit: 100 });
  });

  test("cheaper, fully paid: the difference is account credit, the deposit part kept apart", () => {
    const m = planRoomChangeMoney({
      invoice: { total: 2350, lines: old },
      paid: 2350,
      newLines: cheaper,
    });
    expect(m.kind).toBe("credit");
    if (m.kind !== "credit") return;
    expect(m.difference).toBe(150);
    expect(m.parts).toEqual([
      { amount: 50, deposit: "security", label: "Security deposit (1 month)" },
      { amount: 100, label: "Initial payment - room change" },
    ]);
  });

  test("the month count in a label does not make a different charge", () => {
    const d = lineDifferences(
      [{ label: "Advance rental (2 months)", kind: "rent", amount: 1300 }],
      [{ label: "Advance rental (3 months)", kind: "rent", amount: 1950 }],
    );
    expect(d.map((x) => x.difference)).toEqual([650]);
  });

  test("deposit names", () => {
    expect(depositOf("Security deposit (1 month)")).toBe("security");
    expect(depositOf("Utility deposit")).toBe("utility");
    expect(depositOf("Access card deposit")).toBe("card_deposit");
    expect(depositOf("Advance rental")).toBeUndefined();
  });
});
