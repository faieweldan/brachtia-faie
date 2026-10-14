import { describe, expect, test } from "bun:test";

import { occupancyKey, occupancyPrinted } from "../src/lib/occupancy";
import { soldOccupancy } from "../src/lib/placement";

/*
 * An invoice's Occupancy (14 Oct 2026): written from the placement as sold
 * (invoicePlace -> soldOccupancy), and printed by one rule that reads any
 * spelling an older row has. An Update Tenancy IP saved "Twin" and the PDF,
 * which compared with "twin" alone, printed Single for a twin bed; the rent
 * rows copied the first invoice and said twin for a twin room let whole.
 */
describe("an occupancy, however it was written", () => {
  test("every spelling reads as one key", () => {
    for (const v of ["twin", "Twin", "Twin sharing", "Twin sharing (per pax)"]) expect(occupancyKey(v)).toBe("twin");
    for (const v of ["single", "Single", "Single (whole room)"]) expect(occupancyKey(v)).toBe("single");
    expect(occupancyKey("Whole unit")).toBe("unit");
    expect(occupancyKey("")).toBe("");
  });
  test("the invoice prints it the same whatever the row says", () => {
    expect(occupancyPrinted("Twin")).toBe("Twin sharing (per pax)");
    expect(occupancyPrinted("twin")).toBe("Twin sharing (per pax)");
    expect(occupancyPrinted("single")).toBe("Single");
    expect(occupancyPrinted("unit")).toBe("Whole unit");
  });
  test("a twin room let whole is written, and printed, as the single it was sold as", () => {
    const room = { occupancy: "twin", beds: [{ holdFor: null }, { holdFor: "Sold as single" }] };
    expect(occupancyPrinted(soldOccupancy(room))).toBe("Single");
    expect(occupancyPrinted(soldOccupancy(room, false))).toBe("Twin sharing (per pax)");
    expect(occupancyPrinted(soldOccupancy({ occupancy: "twin", beds: [{}, {}] }, true))).toBe("Single");
  });
});
