import { describe, expect, test } from "bun:test";

import { BRANDS, emptyRecord, inventoryGaps } from "../src/lib/inventory";

/*
 * An item added in a room takes a brand from the same list as the fixed rows
 * (Dani, 14 Oct 2026) - optional, but "Other" with no name typed is unfinished.
 */
describe("an added item's brand", () => {
  const added = (detail?: string) => {
    const r = emptyRecord();
    r.extras.push({ id: "x1", areaId: "yard", name: "Fan", qty: "1", status: "present", remark: "", ...(detail === undefined ? {} : { detail }) });
    return r;
  };
  const extraGap = (r: ReturnType<typeof emptyRecord>) =>
    inventoryGaps(r).some((g) => g.rows.includes("x1") && /brand|detail/i.test(g.label));
  test("the brand list is the fixed rows' list", () => {
    expect(BRANDS).toContain("Midea");
  });
  test("no brand is fine; a brand from the list is fine", () => {
    expect(extraGap(added())).toBe(false);
    expect(extraGap(added("Panasonic"))).toBe(false);
  });
  test("Other with no name typed is unfinished", () => {
    expect(extraGap(added("Other"))).toBe(true);
  });
});
