import { describe, expect, test } from "bun:test";
import { inBillingOrder } from "@/data/properties";

describe("inBillingOrder", () => {
  test("a quote saved in the old order is shown in Brachtia's order", () => {
    const saved = [
      "First month rent — pro-rated 1/30 days",
      "Advance rental (1 month)",
      "Utilities deposit (½ month)",
      "Security deposit (2 months)",
      "Access card deposit",
      "Resident card charges",
      "Admin + agreement charges",
      "Starter kit",
    ].map((label) => ({ label }));
    expect(inBillingOrder(saved).map((l) => l.label)).toEqual([
      "First month rent — pro-rated 1/30 days",
      "Advance rental (1 month)",
      "Security deposit (2 months)",
      "Utilities deposit (½ month)",
      "Admin + agreement charges",
      "Access card deposit",
      "Resident card charges",
      "Starter kit",
    ]);
  });

  test("additional advance rental stays right after the advance rental", () => {
    const saved = ["Advance rental (1 month)", "Additional advance rental (1 month)", "Admin charges"];
    expect(inBillingOrder(saved.map((label) => ({ label }))).map((l) => l.label)).toEqual(saved);
  });
});
