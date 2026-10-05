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
