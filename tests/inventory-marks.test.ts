import { describe, expect, test } from "bun:test";

import { finalMark } from "@/lib/inventory-pdf";

// the Schedule C PDF's mark after Brachtia's answer (Dani and Lav, 5 Oct 2026)
describe("finalMark", () => {
  test("present: tick", () => expect(finalMark("present")).toBe("tick"));
  test("defect resolved: tick; accepted: circle", () => {
    expect(finalMark("defect", "resolved")).toBe("tick");
    expect(finalMark("defect", "accepted")).toBe("circle");
  });
  test("not provided resolved: tick; accepted: dash", () => {
    expect(finalMark("not_provided", "resolved")).toBe("tick");
    expect(finalMark("not_provided", "accepted")).toBe("dash");
  });
  test("never a cross", () => {
    for (const s of ["present", "defect", "not_provided"]) for (const v of ["resolved", "accepted"] as const) expect(finalMark(s, v)).not.toBe("cross");
  });
});
