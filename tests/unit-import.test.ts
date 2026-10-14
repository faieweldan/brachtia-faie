import { describe, expect, test } from "bun:test";

import type { Bed, Unit, UnitRoom } from "../src/lib/ops-store";
import { findResidence, mergeUnitFromFile, normalUnitNo } from "../src/lib/unit-import";

/*
 * The units upload updates the units it names (Dani, 12 Oct 2026). Uploading
 * the master list again must not empty a bed somebody is in.
 */
const bed = (id: string, b: Partial<Bed> = {}): Bed => ({ id, label: id, status: "vacant", ...b });
const room = (letter: string, occupancy: UnitRoom["occupancy"], beds: Bed[], code = ""): UnitRoom => ({
  id: `room-${letter}`, letter, roomTypeCode: code, occupancy, rent: 0, beds,
});
const unit = (rooms: UnitRoom[], u: Partial<Unit> = {}): Unit =>
  ({ id: "u1", code: "U068", residenceId: "arc", residenceName: "The Arc, Cyberjaya", residenceSlug: "arc",
     unitNo: "B-20-08", block: "", floor: "", unitType: "1-bedroom", gender: "", wholeUnit: false,
     wholeUnitRent: 0, notes: "", rooms, ...u }) as Unit;

const fileUnit = unit(
  ["A", "B", "C"].map((l) => room(l, "twin", [bed(`n${l}1`), bed(`n${l}2`)], `arc-3br-${l.toLowerCase()}`)),
  { id: "new", code: "", unitType: "3-bedroom" },
);

describe("mergeUnitFromFile", () => {
  test("a new unit is the file's", () => {
    expect(mergeUnitFromFile(undefined, fileUnit).unit).toBe(fileUnit);
  });
  test("an existing unit keeps its id; empty rooms follow the file", () => {
    const old = unit([room("A", "single", [bed("a")], "arc-3br-a")]);
    const { unit: u, kept } = mergeUnitFromFile(old, fileUnit);
    expect(u.id).toBe("u1");
    expect(u.unitType).toBe("3-bedroom");
    expect(u.rooms.map((r) => `${r.letter}:${r.occupancy}`)).toEqual(["A:twin", "B:twin", "C:twin"]);
    expect(u.rooms[0]!.id).toBe("room-A");
    expect(kept).toEqual([]);
  });
  test("a room somebody is in keeps its beds and shape, and is listed", () => {
    const old = unit([room("A", "single", [bed("a", { status: "active", residentId: "r1" })], "arc-3br-a")]);
    const { unit: u, kept } = mergeUnitFromFile(old, fileUnit);
    expect(u.rooms[0]!.beds[0]!.residentId).toBe("r1");
    expect(u.rooms[0]!.occupancy).toBe("single");
    expect(kept[0]).toContain("Room A");
  });
  test("a room left out of the file goes when empty, stays when somebody is in it", () => {
    const old = unit([
      room("D", "twin", [bed("d1"), bed("d2")]),
      room("E", "single", [bed("e", { status: "booked", residentId: "r2" })]),
    ]);
    const { unit: u, kept } = mergeUnitFromFile(old, fileUnit);
    expect(u.rooms.map((r) => r.letter)).toEqual(["A", "B", "C", "E"]);
    expect(kept.some((k) => k.includes("Room E"))).toBe(true);
  });
  test("a unit let whole to somebody is left alone", () => {
    const old = unit([room("Unit", "unit", [bed("w", { status: "active", residentId: "r3" })])], { wholeUnit: true });
    const { unit: u, kept } = mergeUnitFromFile(old, fileUnit);
    expect(u.rooms[0]!.letter).toBe("Unit");
    expect(kept[0]).toContain("whole unit");
  });
});

describe("reading the master list", () => {
  test("a short residence name finds Website's", () => {
    const list = [{ name: "The Arc, Cyberjaya" }, { name: "Solstice Residence, Cyberjaya" }];
    expect(findResidence(list, "The Arc")?.name).toBe("The Arc, Cyberjaya");
    expect(findResidence(list, "solstice residence")?.name).toBe("Solstice Residence, Cyberjaya");
    expect(findResidence(list, "Arc")).toBeUndefined();
  });
  test("3A is written 03A", () => {
    expect(normalUnitNo("B-08-3A")).toBe("B-08-03A");
    expect(normalUnitNo("a-23a-05")).toBe("A-23A-05");
  });
});
