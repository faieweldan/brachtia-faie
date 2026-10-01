import { describe, expect, test } from "bun:test";

import { paymentMissing, ruleFor } from "../src/lib/payment-methods";
import { PAY_METHODS } from "../src/lib/ops-store";

describe("what each payment method needs", () => {
  test("every method in the dropdown has its own rule", () => {
    for (const m of PAY_METHODS) expect(ruleFor(m)).toBeTruthy();
  });
  test("cash needs no reference and no proof", () => {
    expect(ruleFor("Cash").reference).toBeNull();
    expect(paymentMissing({ method: "Cash", reference: "", proofPath: "" })).toBe("");
  });
  test("a bank transfer needs both", () => {
    expect(paymentMissing({ method: "Bank Transfer", reference: "", proofPath: "x" })).toBe("Enter the reference no");
    expect(paymentMissing({ method: "Bank Transfer", reference: "REF1", proofPath: "" })).toBe("Attach the payment proof");
    expect(paymentMissing({ method: "Bank Transfer", reference: "REF1", proofPath: "x" })).toBe("");
  });
  test("a cheque asks for its cheque number", () => {
    expect(paymentMissing({ method: "Cheque", reference: "", proofPath: "x" })).toBe("Enter the cheque no");
  });
  test("an unknown method is treated as the strictest", () => {
    expect(paymentMissing({ method: "Crypto", reference: "", proofPath: "" })).toBe("Enter the reference no");
  });
});
