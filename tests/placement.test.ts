import { describe, expect, test } from "bun:test";

import type { Bed, Resident, Unit, UnitRoom } from "../src/lib/ops-store";
import { bedFreeForPeriod, findBedForResident } from "../src/lib/ops-store";
import {
  PERSON_LABEL,
  dayBefore,
  occupiedNote,
  overlaps,
  personStatus,
  placementConflict,
  timingLine,
} from "../src/lib/placement";

/*
 * B-08-05, Room C (Dani, 8 Oct 2026): Muhammad lives there 1 Aug 2025 - 30 Sep
 * 2026 and has not checked out; Aisha has booked it 20 Oct - 31 Dec 2026.
 */
const bed = (id: string, label: string, b: Partial<Bed> = {}): Bed => ({
  id,
  label,
  status: "vacant",
  ...b,
});
const room = (
  id: string,
  letter: string,
  occupancy: UnitRoom["occupancy"],
  beds: Bed[],
): UnitRoom => ({
  id,
  letter,
  roomTypeCode: "",
  occupancy,
  rent: 1000,
  beds,
});
const unit = (rooms: UnitRoom[], u: Partial<Unit> = {}): Unit => ({
  id: "u1",
  code: "U001",
  residenceId: "r1",
  residenceName: "The Arc",
  residenceSlug: "the-arc",
  unitNo: "B-08-05",
  block: "B",
  floor: "08",
  unitType: "3-bedroom",
  gender: "",
  wholeUnit: false,
  wholeUnitRent: 0,
  notes: "",
  deactivatedAt: "",
  deactivationReason: "",
  rooms,
  ...u,
});
const person = (id: string, fullName: string, gender: string): Resident =>
  ({ id, fullName, gender }) as Resident;

const muhammad = person("m", "Muhammad Khatry", "Male");
const aishaRes = person("a", "Aisha", "Female");
const roomC = () =>
  room("rc", "C", "single", [
    bed("bc", "Single", {
      status: "active",
      residentId: "m",
      residentName: "Muhammad Khatry",
      gender: "Male",
      tenancyStart: "2025-08-01",
      tenancyEnd: "2026-09-30",
    }),
  ]);
const aisha = { start: "2026-10-20", end: "2026-12-31", gender: "Female", enquiryId: "ea" };

describe("dates decide, not the bed row", () => {
  test("stays that do not overlap are free of each other", () => {
    expect(
      overlaps(
        { start: "2026-01-01", end: "2026-02-02" },
        { start: "2026-03-03", end: "2026-06-01" },
      ),
    ).toBe(false);
    expect(overlaps({ start: "2026-01-01", end: "2026-03-03" }, { start: "2026-03-03" })).toBe(
      true,
    );
    expect(overlaps({ start: "2026-01-01" }, { start: "2030-01-01", end: "2030-02-01" })).toBe(
      true,
    );
  });

  test("1. Room C is free for Aisha while Muhammad is still in it", () => {
    const rc = roomC();
    const u = unit([rc]);
    expect(placementConflict(u, rc, rc.beds[0]!, aisha, [muhammad])).toBe("");
    const note = occupiedNote(rc.beds[0]!, "2026-10-08");
    expect(note).toContain("Currently occupied by Muhammad Khatry until 30 Sep");
    expect(note).toContain("Checkout pending");
  });

  test("C. an overlapping current tenancy is unavailable, with who and when", () => {
    const rc = roomC();
    const u = unit([rc]);
    const clash = placementConflict(
      u,
      rc,
      rc.beds[0]!,
      { ...aisha, gender: "Male", start: "2026-09-01" },
      [muhammad],
    );
    expect(clash).toContain("Taken by Muhammad Khatry");
  });

  test("D. an overlapping future reservation is unavailable", () => {
    const rc = roomC();
    rc.beds[0]!.upcoming = [
      {
        enquiryId: "ea",
        residentId: "a",
        name: "Aisha",
        gender: "Female",
        start: "2026-10-20",
        end: "2026-12-31",
        status: "booked",
      },
    ];
    const u = unit([rc]);
    const other = { start: "2026-11-01", end: "2027-01-31", gender: "Female", enquiryId: "ez" };
    expect(placementConflict(u, rc, rc.beds[0]!, other, [muhammad, aishaRes])).toContain(
      "Reserved for Aisha",
    );
    // and the browser's quick check agrees
    expect(bedFreeForPeriod({ ...rc.beds[0]!, status: "vacant" }, "2026-11-01", "2027-01-31")).toBe(
      false,
    );
    // Aisha's own reservation never blocks Aisha
    expect(placementConflict(u, rc, rc.beds[0]!, aisha, [muhammad, aishaRes])).toBe("");
  });
});

describe("gender is judged on overlapping dates only", () => {
  test("12. a man leaving before she arrives does not keep the unit male", () => {
    const rc = roomC();
    const ra = room("ra", "A", "single", [bed("ba", "Single")]);
    const u = unit([ra, rc]);
    expect(placementConflict(u, ra, ra.beds[0]!, aisha, [muhammad])).toBe("");
  });
  test("a man still there during her dates does", () => {
    const rc = roomC();
    rc.beds[0]!.tenancyEnd = "2026-12-31";
    const ra = room("ra", "A", "single", [bed("ba", "Single")]);
    const u = unit([ra, rc]);
    expect(placementConflict(u, ra, ra.beds[0]!, aisha, [muhammad])).toContain(
      "(male) in this unit",
    );
  });
  test("a unit kept for men is never offered to a woman", () => {
    const ra = room("ra", "A", "single", [bed("ba", "Single")]);
    expect(placementConflict(unit([ra], { gender: "Male" }), ra, ra.beds[0]!, aisha)).toContain(
      "Kept for Male",
    );
  });
});

describe("13. twin, sold-as-single and whole-unit capacity", () => {
  const taken = (id: string, label: string) =>
    bed(id, label, {
      status: "booked",
      residentId: "x",
      residentName: "Siti",
      gender: "Female",
      tenancyStart: "2026-10-01",
      tenancyEnd: "2027-03-31",
    });

  test("the other twin bed is free for its own student", () => {
    const rt = room("rt", "B", "twin", [taken("t1", "Twin 1"), bed("t2", "Twin 2")]);
    expect(placementConflict(unit([rt]), rt, rt.beds[1]!, aisha)).toBe("");
  });
  test("a room sold as single blocks its other bed", () => {
    const rt = room("rt", "B", "twin", [
      taken("t1", "Twin 1"),
      bed("t2", "Twin 2", { status: "held", holdFor: "Sold as single" }),
    ]);
    expect(placementConflict(unit([rt]), rt, rt.beds[1]!, aisha)).toContain("Taken by Siti");
  });
  test("taking a room whole needs both beds free", () => {
    const rt = room("rt", "B", "twin", [taken("t1", "Twin 1"), bed("t2", "Twin 2")]);
    expect(placementConflict(unit([rt]), rt, rt.beds[1]!, { ...aisha, whole: true })).toContain(
      "Taken by Siti",
    );
  });
  test("the whole unit is blocked by any room let in those dates, and blocks every room", () => {
    const rt = room("rt", "B", "twin", [taken("t1", "Twin 1"), bed("t2", "Twin 2")]);
    const whole = room("rw", "Unit", "unit", [bed("w", "Unit")]);
    expect(placementConflict(unit([rt, whole]), whole, whole.beds[0]!, aisha)).toContain(
      "Taken by Siti",
    );
    const let_ = room("rw", "Unit", "unit", [taken("w", "Unit")]);
    const ra = room("ra", "A", "single", [bed("ba", "Single")]);
    expect(placementConflict(unit([ra, let_]), ra, ra.beds[0]!, aisha)).toContain("Taken by Siti");
    // after the whole-unit stay ends, the room is free again
    expect(
      placementConflict(unit([ra, let_]), ra, ra.beds[0]!, {
        ...aisha,
        start: "2027-04-01",
        end: "2027-06-30",
      }),
    ).toBe("");
  });
});

describe("11. show-all cannot get past a real clash", () => {
  test("the clash comes from dates and capacity, which show-all never relaxes", () => {
    // the picker's show-all only skips residence, room type and sharing preference;
    // every row still goes through placementConflict, which knows none of those
    const rc = roomC();
    expect(
      placementConflict(unit([rc]), rc, rc.beds[0]!, { ...aisha, start: "2026-09-15" }),
    ).not.toBe("");
  });
});

describe("2/5. where the upcoming resident is placed", () => {
  test("Aisha is found in Room C through the bed's next booking - Upcoming, not Unassigned", () => {
    const rc = roomC();
    rc.beds[0]!.upcoming = [
      {
        enquiryId: "ea",
        residentId: "a",
        name: "Aisha",
        start: "2026-10-20",
        end: "2026-12-31",
        status: "booked",
      },
    ];
    const placed = findBedForResident([unit([rc])], { id: "a" });
    expect(placed?.room.letter).toBe("C");
    expect(placed?.upcoming).toBe(true);
    // Muhammad is still the bed's own resident
    expect(findBedForResident([unit([rc])], { id: "m" })?.upcoming).toBeUndefined();
  });
  test("4. Room C is vacant until the day before she starts", () => {
    expect(dayBefore("2026-10-20")).toBe("2026-10-19");
  });
});

describe("status and timing are two answers, never stored", () => {
  test("status follows payment, check-in and checkout", () => {
    expect(personStatus({})).toBe("none");
    expect(personStatus({ bedStatus: "held" })).toBe("held");
    expect(personStatus({ bedStatus: "booked" })).toBe("booked");
    expect(personStatus({ bedStatus: "active" })).toBe("active");
    expect(personStatus({ inactive: true, bedStatus: "active" })).toBe("inactive");
    // Aisha before Muhammad leaves: Booked through her tenancy, not Muhammad's Occupied bed
    expect(personStatus({ bedStatus: "active", upcomingAs: "booked" })).toBe("booked");
    expect(personStatus({ upcomingAs: "reserved" })).toBe("held");
    expect(PERSON_LABEL.held).toBe("Reserved");
    expect(PERSON_LABEL.active).toBe("Occupied");
  });
  test("timing sits under the dates and says when", () => {
    expect(timingLine("booked", "2026-10-20", "2026-12-31", "2026-10-09")).toBe(
      "Upcoming · in 11 days",
    );
    expect(timingLine("held", "2026-10-10", "2026-12-31", "2026-10-09")).toBe(
      "Upcoming · tomorrow",
    );
    expect(timingLine("active", "2025-08-01", "2026-09-30", "2026-10-09")).toBe("Checkout overdue");
    expect(timingLine("active", "2025-08-01", "2026-10-12", "2026-10-09")).toBe(
      "Current · ends in 3 days",
    );
    expect(timingLine("active", "2025-08-01", "2027-06-30", "2026-10-09")).toBe("Current");
    expect(timingLine("inactive", "2025-08-01", "2026-09-30", "2026-10-09")).toBe("Former");
    expect(timingLine("none", undefined, undefined, "2026-10-09")).toBe("");
  });
});
