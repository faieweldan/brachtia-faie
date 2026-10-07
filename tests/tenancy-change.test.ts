import { describe, expect, test } from "bun:test";

import { changeFlags, dateChange, depositsOf, documentsFor, eventDeposits, eventInvoice, fixedCharges, ipBillOn, moneyOf, planEvents, sixMonthsAfter } from "@/lib/tenancy-change";

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
  test("6 months counted from the day after the old end date", () => {
    expect(sixMonthsAfter("2027-10-31")).toBe("2028-04-30");
    expect(sixMonthsAfter("2027-08-31")).toBe("2028-02-29");
    expect(sixMonthsAfter("2026-11-30")).toBe("2027-05-31");
  });
  test("agreed 7 Oct: ends 30 Nov -> 30 Apr is an extension, 31 May a renewal, 30 May still an extension", () => {
    expect(dateChange("2026-11-30", "2027-04-30")).toBe("extension");
    expect(dateChange("2026-11-30", "2027-05-30")).toBe("extension");
    expect(dateChange("2026-11-30", "2027-05-31")).toBe("renewal");
    expect(dateChange("2026-11-30", "2027-08-31")).toBe("renewal");
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

describe("events", () => {
  const f = changeFlags({ ...base, oldEnd: "2026-11-30", newRoomId: "u12-b", newEnd: "2027-05-31" });
  test("a move and a renewal on different days: two events, earliest first", () => {
    const ev = planEvents(f, "2026-11-11", "2026-11-30");
    expect(ev.map((e) => [e.date, e.flags.room, e.flags.date])).toEqual([
      ["2026-11-11", true, "none"],
      ["2026-12-01", false, "renewal"],
    ]);
    // the room event: A + C under the old agreement; the renewal: the new agreement
    expect(documentsFor(ev[0]!.flags)).toEqual({ newAgreement: false, scheduleA: true, scheduleC: true, accessCard: false });
    expect(documentsFor(ev[1]!.flags)).toEqual({ newAgreement: true, scheduleA: false, scheduleC: false, accessCard: false });
  });
  test("the same day: one event, one document set", () => {
    const ev = planEvents(f, "2026-12-01", "2026-11-30");
    expect(ev).toHaveLength(1);
    expect(documentsFor(ev[0]!.flags)).toEqual({ newAgreement: true, scheduleA: false, scheduleC: false, accessCard: false });
  });
  test("RM100 only with a room, unit or occupancy change; RM20 only with another unit", () => {
    expect(fixedCharges(changeFlags({ ...base, newEnd: "2028-10-31" }))).toEqual([]);
    expect(fixedCharges(changeFlags({ ...base, newRoomId: "u12-b" })).map((c) => c.amount)).toEqual([100]);
    expect(fixedCharges(changeFlags({ ...base, newOccupancy: "twin" })).map((c) => c.amount)).toEqual([100]);
    expect(fixedCharges(changeFlags({ ...base, newUnitId: "u15", newRoomId: "u15-b" })).map((c) => c.amount)).toEqual([100, 20]);
  });
  test("the IP is billed 14 days before, or today when that has passed", () => {
    expect(ipBillOn("2026-12-01", "2026-11-10")).toBe("2026-11-17");
    expect(ipBillOn("2026-11-11", "2026-11-10")).toBe("2026-11-10");
  });
});

describe("the money", () => {
  test("held from the invoices: deposits only", () => {
    const m = moneyOf([
      { label: "Security deposit (2 months)", amount: 800 },
      { label: "Utilities deposit (½ month)", amount: 200 },
      { label: "Admin + agreement charges", amount: 200 },
      { label: "Access card deposit", amount: 50 },
    ]);
    expect(depositsOf(m)).toEqual({ security: 800, utility: 200, card_deposit: 50 });
  });
  test("higher deposit: only the difference, plus the change fee (RM200 + RM100 = RM300)", () => {
    const d = eventDeposits(depositsOf({ security: 800 }), depositsOf({ security: 1000 }));
    const ip = eventInvoice(d.ipLines, [{ label: "Change fee", amount: 100 }], d.credit);
    expect(ip.total).toBe(300);
    expect(ip.payable).toBe(300);
  });
  test("lower deposit: account credit, applied to the IP first (RM200 credit, RM120 IP -> RM0, RM80 left)", () => {
    const d = eventDeposits(depositsOf({ security: 1000 }), depositsOf({ security: 800 }));
    expect(d.ipLines).toEqual([]);
    expect(d.credit).toBe(200);
    const ip = eventInvoice(d.ipLines, [{ label: "Change fee", amount: 100 }, { label: "Card", amount: 20 }], d.credit);
    expect([ip.total, ip.creditApplied, ip.payable, ip.creditLeft]).toEqual([120, 120, 0, 80]);
  });
  test("a longer tenancy at the same rent: no difference", () => {
    const d = eventDeposits(depositsOf({ security: 1000 }), depositsOf({ security: 1000 }));
    expect(d.ipLines).toEqual([]);
    expect(d.credit).toBe(0);
  });
  test("a waived difference is left off; the next event starts from the required level", () => {
    const d = eventDeposits(depositsOf({ security: 800 }), depositsOf({ security: 1000 }), ["security"]);
    expect(d.ipLines).toEqual([]);
    expect(d.waived).toEqual([{ key: "security", amount: 200 }]);
    // the renewal after it: RM1,100 required against RM1,000 - RM100, not RM300
    expect(eventDeposits(d.heldAfter, depositsOf({ security: 1100 })).ipLines.map((l) => l.amount)).toEqual([100]);
  });
});
