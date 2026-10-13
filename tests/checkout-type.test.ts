import { describe, expect, test } from "bun:test";

import { checkoutTypeFor } from "@/lib/checkout-types";

// the kind of checkout the dates say (Dani, 2 Oct 2026); admin can change it
describe("checkoutTypeFor", () => {
  const start = "2026-11-01";
  const end = "2027-10-31";
  test("before the tenancy starts: cancellation", () => {
    expect(checkoutTypeFor(start, end, "2026-10-02")).toBe("cancellation");
  });
  test("after move-in, more than 2 weeks before the end: early termination", () => {
    expect(checkoutTypeFor(start, end, "2027-03-15")).toBe("early_termination");
    expect(checkoutTypeFor(start, end, "2027-10-16")).toBe("early_termination");
  });
  test("within 2 weeks of the end, or after it: end of tenancy", () => {
    expect(checkoutTypeFor(start, end, "2027-10-17")).toBe("end_of_tenancy");
    expect(checkoutTypeFor(start, end, "2027-11-10")).toBe("end_of_tenancy");
  });
  test("no dates: end of tenancy", () => {
    expect(checkoutTypeFor("", "", "2027-01-01")).toBe("end_of_tenancy");
  });
});

describe("the statement's sums - one rule for the card, the server and the PDF", () => {
  test("held less deducted, to the sen", async () => {
    const { checkoutTotals, checkoutDocKind } = await import("@/lib/checkout-types");
    const t = checkoutTotals([{ amount: 1000 }, { amount: 200.1 }], [{ amount: 12.5 }, { amount: 0.2 }]);
    expect(t).toEqual({ held: 1200.1, deducted: 12.7, net: 1187.4 });
    expect(checkoutDocKind(t.net)).toBe("Credit note");
    expect(checkoutDocKind(0)).toBe("Credit note");
    expect(checkoutDocKind(-0.01)).toBe("Invoice");
  });
});
