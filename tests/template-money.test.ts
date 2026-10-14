import { describe, expect, test } from "bun:test";

import { FIELD_BY_KEY, money } from "../src/lib/template-fields";

/*
 * No amount is RM0.00 in a document, never a bare "RM" (Dani, 14 Oct 2026): a
 * resident who paid the full term has no utilities deposit line.
 */
describe("money in documents", () => {
  test("a missing amount prints 0.00", () => {
    for (const v of [undefined, null, "", "abc"]) expect(money(v)).toBe("0.00");
  });
  test("an amount prints with two decimals and thousands", () => {
    expect(money(1200)).toBe("1,200.00");
    expect(money("425")).toBe("425.00");
  });
  test("a deposit the quote has no line for is 0.00", () => {
    const ctx: any = { enquiry: { quote_snapshot: { quote: { firstPayment: [{ label: "Security deposit (½ month)", amount: 425 }] } } } };
    expect(FIELD_BY_KEY.get("deposit")!.get(ctx)).toBe("425.00");
    expect(FIELD_BY_KEY.get("utilities_deposit")!.get(ctx)).toBe("0.00");
  });
});
