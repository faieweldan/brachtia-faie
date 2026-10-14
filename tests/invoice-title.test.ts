import { describe, expect, test } from "bun:test";

import { invoiceTitle, ipDifferenceNote, ipPurpose } from "../src/lib/invoice-category";

describe("an invoice's heading is one shared name", () => {
  test("the second IP says what it is for, from the note its writer leaves", () => {
    expect(ipPurpose("Initial payment difference - Unit change + Extension 2028-01-01")).toBe("Unit change + Extension");
    expect(ipPurpose("Initial payment difference - room change A-07-03 Room B to A-07-03 Room C")).toBe("Room change");
    expect(ipPurpose("Initial payment difference - dates changed 1 Jan to 1 Mar")).toBe("Date change");
    expect(ipPurpose("Room change A to B")).toBe("");
    expect(ipPurpose("")).toBe("");
    // what the writers write, the reader reads
    expect(ipPurpose(ipDifferenceNote("Date change", "1 Jan to 1 Mar"))).toBe("Date change");
    expect(ipPurpose(ipDifferenceNote("Occupancy change + Renewal", "2028-01-01"))).toBe("Occupancy change + Renewal");
  });
  test("kind in words, purpose, then number or not billed yet - never the code alone", () => {
    expect(invoiceTitle({ number: "SCH-x", type: "initial", scheduled: true, purpose: ipPurpose(ipDifferenceNote("Room change", "2027-12-18")) })).toBe(
      "Initial payment · Room change · Not billed yet",
    );
    expect(invoiceTitle({ number: "INV/IP/00012", type: "initial" })).toBe("Initial payment · INV/IP/00012");
    expect(invoiceTitle({ number: "", type: "rental", scheduled: true })).toBe("Rental payment · Not billed yet");
  });
});

describe("screens never name an invoice themselves", () => {
  test("no hand-written 'IP · not billed' or 'Not billed yet' outside invoice-category.ts", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
      });
    const own = [...files("src/routes"), ...files("src/components")].filter((f) => /["'`](IP · |Not billed yet|not billed yet)/.test(readFileSync(f, "utf8")));
    expect(own).toEqual([]);
  });
});
