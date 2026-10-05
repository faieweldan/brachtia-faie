import { describe, expect, test } from "bun:test";

import { changeFlags, compareMoney, dateChange, documentsFor, moneyOf, sixMonthsAfter, topUpLines, topUpTotal } from "@/lib/tenancy-change";

// Update Tenancy's rules (Dani, 2-3 Oct 2026)
const base = {
  oldUnitId: "u12",
  newUnitId: "u12",
  oldRoomId: "u12-a",
  newRoomId: "u12-a",
  oldOccupancy: "single",
  newOccupancy: "single",
  oldEnd: "2027-10-31",
  newEnd: "2027-10-31",
};

describe("the date", () => {
  test("6 months from the old end date, month ends kept", () => {
    expect(sixMonthsAfter("2027-10-31")).toBe("2028-04-30");
    expect(sixMonthsAfter("2027-08-31")).toBe("2028-02-29");
  });
  test("later by less than 6 months: extension; 6 months or more: renewal; same or earlier: none", () => {
    expect(dateChange("2027-10-31", "2027-12-31")).toBe("extension");
    expect(dateChange("2027-10-31", "2028-04-29")).toBe("extension");
    expect(dateChange("2027-10-31", "2028-04-30")).toBe("renewal");
    expect(dateChange("2027-10-31", "2027-10-31")).toBe("none");
    expect(dateChange("2027-10-31", "2027-09-30")).toBe("none");
  });
});

describe("the documents, each once", () => {
  test("extension only: Schedule A", () => {
    expect(documentsFor(changeFlags({ ...base, newEnd: "2027-12-31" }))).toEqual({ newAgreement: false, scheduleA: true, scheduleC: false, accessCard: false });
  });
  test("renewal only: a new agreement, no access card form", () => {
    expect(documentsFor(changeFlags({ ...base, newEnd: "2028-10-31" }))).toEqual({ newAgreement: true, scheduleA: false, scheduleC: false, accessCard: false });
  });
  test("room in the same unit: A + C", () => {
    expect(documentsFor(changeFlags({ ...base, newRoomId: "u12-b" }))).toEqual({ newAgreement: false, scheduleA: true, scheduleC: true, accessCard: false });
  });
  test("room in another unit: A + C + access card form", () => {
    const f = changeFlags({ ...base, newUnitId: "u15", newRoomId: "u15-b" });
    expect(f.room && f.unit).toBe(true);
    expect(documentsFor(f)).toEqual({ newAgreement: false, scheduleA: true, scheduleC: true, accessCard: true });
  });
  test("occupancy only: A + C", () => {
    expect(documentsFor(changeFlags({ ...base, newOccupancy: "twin" }))).toEqual({ newAgreement: false, scheduleA: true, scheduleC: true, accessCard: false });
  });
  test("room and extension together: one Schedule A, and C", () => {
    expect(documentsFor(changeFlags({ ...base, newRoomId: "u12-b", newEnd: "2027-12-31" }))).toEqual({ newAgreement: false, scheduleA: true, scheduleC: true, accessCard: false });
  });
  test("unit change and renewal: a new agreement and the access card form", () => {
    expect(documentsFor(changeFlags({ ...base, newUnitId: "u15", newRoomId: "u15-b", newEnd: "2028-10-31" }))).toEqual({ newAgreement: true, scheduleA: false, scheduleC: false, accessCard: true });
  });
});

describe("the money", () => {
  const original = moneyOf([
    { label: "Security deposit (2 months)", amount: 800 },
    { label: "Utilities deposit (½ month)", amount: 200 },
    { label: "Admin + agreement charges", amount: 200 },
    { label: "Access card deposit", amount: 50 },
    { label: "Resident card charges", amount: 20 },
    { label: "Advance rental (1 month)", amount: 400 },
  ]);
  const next = moneyOf([
    { label: "Security deposit (2 months)", amount: 1000 },
    { label: "Utilities deposit (½ month)", amount: 250 },
    { label: "Admin + agreement charges", amount: 100 },
    { label: "Access card deposit", amount: 50 },
    { label: "Resident card charges", amount: 20 },
  ]);
  const rows = compareMoney(original, next, { original: 400, next: 500 });
  test("each item compared; advance rent is not an item", () => {
    expect(rows.map((r) => [r.key, r.difference])).toEqual([
      ["rent", 100],
      ["security", 200],
      ["utility", 50],
      ["card_deposit", 0],
      ["admin", -100],
      ["card_charge", 0],
    ]);
  });
  test("only what went up is paid now; rent and decreases are not", () => {
    expect(topUpLines(rows)).toEqual([
      { label: "Security deposit - difference", amount: 200, kind: "refundable" },
      { label: "Utility deposit - difference", amount: 50, kind: "refundable" },
    ]);
    expect(topUpTotal(rows)).toBe(250);
  });
  test("an item waived is left off the invoice; the others stay", () => {
    expect(topUpLines(rows, ["security"])).toEqual([{ label: "Utility deposit - difference", amount: 50, kind: "refundable" }]);
    expect(topUpTotal(rows, ["security", "utility"])).toBe(0);
  });
});
