import { describe, expect, test } from "bun:test";

import type { Bed, Resident, Unit, UnitRoom } from "../src/lib/ops-store";
import { findBedForResident } from "../src/lib/ops-store";
import { SOLD_AS_SINGLE_MARK, soldBedLabel, soldOccupancy, soldOccupancyLabel } from "../src/lib/placement";
import {
  PERSON_LABEL,
  dayBefore,
  occupiedNote,
  overlaps,
  personStatus,
  placementConflict,
  roomActions,
  roomStatusOf,
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

/*
 * One rule for every shape (Dani, 14 Nov 2026): two stays clash only when their
 * dates overlap AND their space overlaps. Twin = one bed, single = the whole
 * room, whole unit = every room. Not overlapping in dates -> never a clash.
 * B-09-01 Room A: Shadab has it as a single to 21 Nov 2026, Anas has Twin 2
 * from 23 Nov, Ahmed asked for Twin 1 from 23 Nov and was refused.
 */
describe("14. a room let whole is whole only for that stay's dates", () => {
  const male = (id: string, name: string, start: string, end: string, b: Partial<Bed> = {}) =>
    bed(id, b.label ?? "Twin 1", {
      status: "booked",
      residentId: id,
      residentName: name,
      gender: "Male",
      tenancyStart: start,
      tenancyEnd: end,
      ...b,
    });
  const next = (name: string, start: string, end: string, letWhole = false) => ({
    enquiryId: `e-${name}`,
    name,
    gender: "Male",
    start,
    end,
    letWhole,
  });
  const ask = (start: string, end: string, extra: object = {}) => ({
    start,
    end,
    gender: "Male",
    enquiryId: "e-asking",
    ...extra,
  });
  // B-09-01 Room A as it is today
  const b0901 = () =>
    room("ra", "A", "twin", [
      male("shadab", "Shadab", "2026-10-29", "2026-11-21", { letWhole: true }),
      bed("t2", "Twin 2", {
        status: "held",
        holdFor: SOLD_AS_SINGLE_MARK,
        upcoming: [next("Anas", "2026-11-23", "2027-11-30")],
      }),
    ]);

  test("Ahmed gets Twin 1 from 23 Nov: Shadab's single has ended, Anas is twin", () => {
    const ra = b0901();
    expect(placementConflict(unit([ra]), ra, ra.beds[0]!, ask("2026-11-23", "2027-11-30"))).toBe("");
  });
  test("while Shadab has the room as a single, the other bed is still taken", () => {
    const ra = b0901();
    expect(placementConflict(unit([ra]), ra, ra.beds[1]!, ask("2026-11-15", "2026-11-20"))).toContain(
      "Taken by Shadab",
    );
  });
  test("the same bed is taken for overlapping dates, whatever the shape", () => {
    const ra = b0901();
    expect(placementConflict(unit([ra]), ra, ra.beds[0]!, ask("2026-11-20", "2027-01-31"))).toContain(
      "Taken by Shadab",
    );
  });
  test("a single booked for later: whole for its dates, free either side of them", () => {
    const rb = room("rb", "B", "twin", [
      bed("b1", "Twin 1", { upcoming: [next("Faris", "2027-01-01", "2027-06-30", true)] }),
      bed("b2", "Twin 2", { status: "held", holdFor: SOLD_AS_SINGLE_MARK }),
    ]);
    const u = unit([rb]);
    expect(placementConflict(u, rb, rb.beds[1]!, ask("2027-03-01", "2027-08-31"))).toContain(
      "Reserved for Faris",
    );
    expect(placementConflict(u, rb, rb.beds[1]!, ask("2027-07-01", "2027-12-31"))).toBe("");
    expect(placementConflict(u, rb, rb.beds[1]!, ask("2026-07-01", "2026-12-31"))).toBe("");
  });
  test("a twin stay does not make the room whole: the other bed stays free", () => {
    const rb = room("rb", "B", "twin", [
      bed("b1", "Twin 1", { upcoming: [next("Faris", "2027-01-01", "2027-06-30")] }),
      bed("b2", "Twin 2"),
    ]);
    expect(placementConflict(unit([rb]), rb, rb.beds[1]!, ask("2027-01-01", "2027-06-30"))).toBe("");
  });
  test("an old mark with nobody single behind it blocks nothing", () => {
    const rb = room("rb", "B", "twin", [
      male("ali", "Ali", "2027-01-01", "2027-06-30", { letWhole: false }),
      bed("b2", "Twin 2", { status: "held", holdFor: SOLD_AS_SINGLE_MARK }),
    ]);
    expect(placementConflict(unit([rb]), rb, rb.beds[1]!, ask("2027-01-01", "2027-06-30"))).toBe("");
  });
  test("a resident with no tenancy on the bed: the mark still makes the room whole", () => {
    const rb = room("rb", "B", "twin", [
      male("ali", "Ali", "2027-01-01", "2027-06-30"),
      bed("b2", "Twin 2", { status: "held", holdFor: SOLD_AS_SINGLE_MARK }),
    ]);
    expect(placementConflict(unit([rb]), rb, rb.beds[1]!, ask("2027-01-01", "2027-06-30"))).toContain(
      "Taken by Ali",
    );
    expect(placementConflict(unit([rb]), rb, rb.beds[1]!, ask("2027-07-01", "2027-12-31"))).toBe("");
  });
  test("taking a room whole: blocked by a twin stay that overlaps, free after it", () => {
    const rb = room("rb", "B", "twin", [
      bed("b1", "Twin 1", { upcoming: [next("Faris", "2026-12-01", "2027-01-31")] }),
      bed("b2", "Twin 2"),
    ]);
    const u = unit([rb]);
    expect(placementConflict(u, rb, rb.beds[1]!, ask("2027-01-02", "2027-06-30", { whole: true }))).toContain(
      "Reserved for Faris",
    );
    expect(placementConflict(u, rb, rb.beds[1]!, ask("2027-02-01", "2027-06-30", { whole: true }))).toBe("");
  });
  test("whole unit after a room's stay to January: 2 Jan clashes, 1 Feb does not", () => {
    const ra = room("ra", "A", "single", [
      bed("a1", "Single", { upcoming: [next("Faris", "2026-12-01", "2027-01-31")] }),
    ]);
    const wu = room("rw", "Unit", "unit", [bed("w", "Unit")]);
    const u = unit([ra, wu]);
    expect(placementConflict(u, wu, wu.beds[0]!, ask("2027-01-02", "2027-06-30"))).toContain(
      "Reserved for Faris",
    );
    expect(placementConflict(u, wu, wu.beds[0]!, ask("2027-02-01", "2027-06-30"))).toBe("");
  });
  test("a room or twin bed after a whole-unit stay to January: 2 Jan clashes, 1 Feb does not", () => {
    const rt = room("rt", "B", "twin", [bed("t1", "Twin 1"), bed("t2", "Twin 2")]);
    const wu = room("rw", "Unit", "unit", [
      bed("w", "Unit", { upcoming: [next("Faris", "2026-12-01", "2027-01-31")] }),
    ]);
    const u = unit([rt, wu]);
    expect(placementConflict(u, rt, rt.beds[0]!, ask("2027-01-02", "2027-06-30"))).toContain(
      "Reserved for Faris",
    );
    expect(placementConflict(u, rt, rt.beds[0]!, ask("2027-02-01", "2027-06-30"))).toBe("");
    expect(placementConflict(u, rt, rt.beds[0]!, ask("2027-02-01", "2027-06-30", { whole: true }))).toBe("");
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
      "Coming due · ends in 3 days",
    );
    expect(timingLine("active", "2025-08-01", "2027-06-30", "2026-10-09")).toBe("Current");
    // 60 days before the end, as Schedule C's Coming Due (13 Oct 2026)
    expect(timingLine("active", "2025-08-01", "2026-12-08", "2026-10-09")).toBe("Coming due · ends in 60 days");
    expect(timingLine("active", "2025-08-01", "2026-12-09", "2026-10-09")).toBe("Current");
    expect(timingLine("inactive", "2025-08-01", "2026-09-30", "2026-10-09")).toBe("Former");
    expect(timingLine("none", undefined, undefined, "2026-10-09")).toBe("");
  });
});

describe("Room assignment actions (10 Oct 2026)", () => {
  test("Reserved: choose another room or release - never Change room", () => {
    expect(roomActions({ closed: false, hasRoom: true, paid: false, started: false })).toEqual([
      "choose",
      "release",
    ]);
  });
  test("Booked before the stay: Change room", () => {
    expect(roomActions({ closed: false, hasRoom: true, paid: true, started: false })).toEqual([
      "change",
    ]);
  });
  test("started: Update Tenancy only", () => {
    expect(roomActions({ closed: false, hasRoom: true, paid: true, started: true })).toEqual([
      "update_tenancy",
    ]);
  });
  test("closed, or no room yet: nothing on the card", () => {
    expect(roomActions({ closed: true, hasRoom: true, paid: true, started: false })).toEqual([]);
    expect(roomActions({ closed: false, hasRoom: false, paid: false, started: false })).toEqual([]);
  });
});

describe("a bed's room status follows who is in it, then who comes first", () => {
  const empty = (upcoming?: Bed["upcoming"]): Bed => ({
    id: "x",
    label: "Single",
    status: "vacant",
    upcoming,
  });
  test("nobody coming: Vacant", () => expect(roomStatusOf(empty())).toBe("vacant"));
  test("an unpaid hold first: Reserved", () =>
    expect(roomStatusOf(empty([{ name: "Hakim", status: "reserved", start: "2027-01-10" }]))).toBe(
      "held",
    ));
  test("a paid stay first: Booked", () =>
    expect(roomStatusOf(empty([{ name: "Faris", status: "booked", start: "2026-10-20" }]))).toBe(
      "booked",
    ));
  test("somebody in it: their status, whatever is coming", () =>
    expect(
      roomStatusOf({
        ...empty([{ name: "Hakim", status: "reserved" }]),
        status: "active",
        residentId: "m",
      }),
    ).toBe("active"));
  test("Faris then Hakim on one bed: no clash, and each is free of the other", () => {
    const bedC = bed("c", "Single", {
      upcoming: [
        {
          enquiryId: "ef",
          name: "Faris",
          gender: "Male",
          status: "reserved",
          start: "2026-10-20",
          end: "2026-12-31",
        },
      ],
    });
    const rc = room("rc", "C", "single", [bedC]);
    const u = unit([rc]);
    expect(
      placementConflict(u, rc, bedC, {
        start: "2027-01-10",
        end: "2027-02-27",
        gender: "Male",
        enquiryId: "eh",
      }),
    ).toBe("");
    expect(
      placementConflict(u, rc, bedC, {
        start: "2026-12-01",
        end: "2027-02-27",
        gender: "Male",
        enquiryId: "eh",
      }),
    ).toContain("Faris");
  });
});

describe("timing past the start date", () => {
  test("booked, start passed, not checked in: Check-in overdue - not 'Upcoming'", () => {
    expect(timingLine("booked", "2025-10-01", undefined, "2026-10-10")).toBe("Check-in overdue");
  });
});

describe("a booked check-in day", () => {
  test("booked for after the start: expected that day, not overdue", () => {
    expect(timingLine("booked", "2026-09-22", undefined, "2026-10-10", "2026-10-12")).toBe("Upcoming · check-in in 2 days");
    expect(timingLine("booked", "2026-09-22", undefined, "2026-10-10", "2026-10-10")).toBe("Upcoming · check-in today");
  });
  test("the booked day has passed and nobody recorded it: overdue", () => {
    expect(timingLine("booked", "2026-09-22", undefined, "2026-10-10", "2026-10-09")).toBe("Check-in overdue");
  });
});

/*
 * A twin room let whole is described as the single it was sold as (Dani, 14 Oct
 * 2026): A-15-05 Room A, Twin 1 booked, Twin 2 "Sold as single", read "Twin
 * sharing · Twin 1" on the booking card at the single rate.
 */
describe("a placement is described as sold, not as built", () => {
  const letWhole = { occupancy: "twin", beds: [{ label: "Twin 1" }, { label: "Twin 2", holdFor: "Sold as single" }] };
  const shared = { occupancy: "twin", beds: [{ label: "Twin 1" }, { label: "Twin 2" }] };
  const single = { occupancy: "single", beds: [{ label: "Single" }] };
  test("a twin room let whole is a single", () => {
    expect(soldOccupancy(letWhole)).toBe("single");
    expect(soldOccupancyLabel(letWhole)).toBe("Single");
    expect(soldBedLabel(letWhole, letWhole.beds[0])).toBe("Single");
  });
  test("the server's rows (hold_for) read the same", () => {
    expect(soldOccupancy({ occupancy: "twin", beds: [{ hold_for: null }, { hold_for: "Sold as single" }] })).toBe("single");
  });
  test("the placement's own record wins over the mark on the other bed", () => {
    // stored let_whole: single, even with no mark (and twin, even with one)
    expect(soldOccupancy(shared, true)).toBe("single");
    expect(soldBedLabel(shared, shared.beds[0], true)).toBe("Single");
    expect(soldOccupancy(letWhole, false)).toBe("twin");
    // a single room is never made twin by it
    expect(soldOccupancy(single, true)).toBe("single");
  });
  test("a twin room shared stays twin, a single stays single", () => {
    expect(soldOccupancyLabel(shared)).toBe("Twin Sharing");
    expect(soldBedLabel(shared, shared.beds[1])).toBe("Twin 2");
    expect(soldOccupancy(single)).toBe("single");
    expect(soldBedLabel(single, single.beds[0])).toBe("Single");
  });
});

describe("bedStays - who is on a bed, and when", () => {
  const { bedStays } = require("../src/lib/placement");
  test("a booking's hold on an empty bed is Reserved, never Vacant", () => {
    const bed = { id: "b1", label: "Twin 1", status: "vacant", upcoming: [{ enquiryId: "e1", name: "Aisyah", status: "reserved", start: "2026-10-30", end: "2027-06-30" }] };
    const stays = bedStays(bed, []);
    expect(stays.map((s: any) => [s.name, s.status, s.later])).toEqual([["Aisyah", "held", false]]);
  });
  test("someone living there, then a paid stay to come - Occupied, then Next · Booked", () => {
    const bed = {
      id: "b2", label: "Twin 1", status: "active", residentName: "Vedanta", tenancyStart: "2026-09-14", tenancyEnd: "2027-06-30",
      upcoming: [{ residentId: "r2", name: "Hakim", status: "booked", start: "2027-07-01", end: "2027-12-31" }],
    };
    expect(bedStays(bed, []).map((s: any) => [s.name, s.status, s.later])).toEqual([["Vedanta", "active", false], ["Hakim", "booked", true]]);
  });
  test("an empty bed has nobody", () => {
    expect(bedStays({ id: "b3", label: "Twin 2", status: "vacant" }, [])).toEqual([]);
  });
});

/*
 * Louis, B-06-02 Room A, tenancy to 31 Dec 2026, leaves on 17 Dec (Dani, 16
 * Nov 2026): the room can be booked from 18 Dec while he still lives there.
 * The same rule as placement_claims in 20261116100000_leaving_on.sql.
 */
describe("a planned leaving date ends the claim on the room", () => {
  const louis = person("l", "Louis", "Male");
  const roomA = (leavingOn?: string) =>
    room("ra", "A", "single", [
      bed("ba", "Single", {
        status: "active",
        residentId: "l",
        residentName: "Louis",
        gender: "Male",
        tenancyStart: "2026-08-23",
        tenancyEnd: "2026-12-31",
        ...(leavingOn ? { leavingOn } : {}),
      }),
    ]);
  const next = { start: "2026-12-18", end: "2027-06-30", gender: "Male", enquiryId: "en" };

  test("his last day: the leaving date when earlier, else the end", async () => {
    const { occupiedUntil } = await import("../src/lib/placement");
    expect(occupiedUntil({ tenancyEnd: "2026-12-31", leavingOn: "2026-12-17" })).toBe("2026-12-17");
    expect(occupiedUntil({ tenancyEnd: "2026-12-31" })).toBe("2026-12-31");
    expect(occupiedUntil({ tenancyEnd: "2026-12-31", leavingOn: "2027-01-05" })).toBe("2026-12-31");
  });

  test("no leaving date: 18 Dec is still his", () => {
    const r = roomA();
    expect(placementConflict(unit([r]), r, r.beds[0]!, next, [louis])).toContain("Louis");
  });

  test("leaving 17 Dec: free from 18 Dec, not a day earlier", () => {
    const r = roomA("2026-12-17");
    expect(placementConflict(unit([r]), r, r.beds[0]!, next, [louis])).toBe("");
    expect(placementConflict(unit([r]), r, r.beds[0]!, { ...next, start: "2026-12-17" }, [louis])).toContain("Louis");
    expect(occupiedNote(r.beds[0]!, "2026-11-16")).toContain("until 17 Dec 2026");
  });
});
