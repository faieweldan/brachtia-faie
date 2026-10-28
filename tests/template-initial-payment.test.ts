import { describe, expect, test } from "bun:test";

import { FIELD_BY_KEY } from "../src/lib/template-fields";

/*
 * The agreement's deposits and fees come from the billed Initial Payment
 * invoices, the quote saved with the booking only before one is billed (Dani,
 * 28 Oct 2026). Diana Iusupova's pack printed Security deposit 0.00 while her
 * IP billed RM 600: the booking had no deposit line in its saved quote.
 */
const get = (key: string, ctx: any) => FIELD_BY_KEY.get(key)!.get(ctx);

describe("agreement money reads the invoice", () => {
  test("the invoice wins over a saved quote without the line", () => {
    const ctx: any = {
      enquiry: { quote_snapshot: { quote: { firstPayment: [], totalUpfront: 0 } } },
      initialPayment: {
        lines: [
          { label: "First month rent — pro-rated 5/31 days", amount: 274.19 },
          { label: "Security deposit", amount: 600 },
          { label: "Admin charges", amount: 200 },
        ],
        total: 8941.93,
      },
    };
    expect(get("deposit", ctx)).toBe("600.00");
    expect(get("utilities_deposit", ctx)).toBe("0.00");
    expect(get("admin_charges", ctx)).toBe("200.00");
    expect(get("first_month_rent", ctx)).toBe("274.19");
    expect(get("first_payment_total", ctx)).toBe("8,941.93");
  });
  test("a later difference IP adds to the deposit", () => {
    const ctx: any = { initialPayment: { lines: [{ label: "Security deposit", amount: 850 }, { label: "Utility deposit", amount: 150 }], total: 0 } };
    expect(get("deposit", ctx)).toBe("850.00");
    // "Utility" and "Utilities" are the same deposit
    expect(get("utilities_deposit", ctx)).toBe("150.00");
  });
  test("no IP billed yet: the saved quote", () => {
    const ctx: any = { initialPayment: null, enquiry: { quote_snapshot: { quote: { firstPayment: [{ label: "Security deposit (½ month)", amount: 425 }] } } } };
    expect(get("deposit", ctx)).toBe("425.00");
  });
});
