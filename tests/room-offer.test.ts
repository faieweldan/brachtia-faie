import { describe, expect, test } from "bun:test";

import type { Bed, UnitRoom } from "../src/lib/ops-store";
import { roomOffer } from "../src/lib/room-offer";

/*
 * The one rule for how a room can be sold (11 Oct 2026). A-07-03: Rooms B and C
 * are twin rooms with both beds empty, and a booking asking for a single was
 * shown Twin 1 and Twin 2 marked "Twin room" - Homes would have sold each as
 * one single. Both screens now ask roomOffer.
 */
const bed = (id: string, b: Partial<Bed> = {}): Bed => ({ id, label: id, status: "vacant", ...b });
const room = (occupancy: UnitRoom["occupancy"], beds: Bed[], letter = "B") => ({ letter, occupancy, beds });

const emptyTwin = room("twin", [bed("t1"), bed("t2")]);
const halfTwin = room("twin", [bed("t1", { status: "active", residentId: "r1" }), bed("t2")]);
// booked for later: its bed is empty today but somebody is coming
const laterTwin = room("twin", [{ ...bed("t1"), upcoming: [{}] }, bed("t2")]);
const emptySingle = room("single", [bed("s1")]);
const takenSingle = room("single", [bed("s1", { status: "active", residentId: "r1" })]);
const unitSlot = room("single", [bed("u1")], "Unit");

describe("roomOffer", () => {
  test("single wanted: an empty twin room is sold whole as one single (A-07-03)", () => {
    expect(roomOffer(emptyTwin, "single", true)).toEqual({ as: "whole" });
  });
  test("single wanted: a twin room with someone in it, or booked later, is not", () => {
    expect(roomOffer(halfTwin, "single", true)).toHaveProperty("blocked");
    expect(roomOffer(laterTwin, "single", true)).toHaveProperty("blocked");
  });
  test("single wanted: a twin room type with no single rate is not", () => {
    expect(roomOffer(emptyTwin, "single", false)).toEqual({ blocked: "Twin room" });
  });
  test("single wanted: a single room is itself", () => {
    expect(roomOffer(emptySingle, "single", true)).toEqual({ as: "bed" });
    expect(roomOffer(takenSingle, "single", true)).toEqual({ as: "bed" });
  });
  test("twin wanted: twin beds as they are, never a single room", () => {
    expect(roomOffer(halfTwin, "twin", true)).toEqual({ as: "bed" });
    // a single room stays single: its shape is Website's (11 Oct 2026)
    expect(roomOffer(emptySingle, "twin", true)).toEqual({ blocked: "Single room" });
    expect(roomOffer(takenSingle, "twin", true)).toEqual({ blocked: "Single room" });
  });
  test("whole unit: only the Unit slot, and the Unit slot only for it", () => {
    expect(roomOffer(unitSlot, "unit", true)).toEqual({ as: "bed" });
    expect(roomOffer(unitSlot, "single", true)).toEqual({ blocked: "Whole unit" });
    expect(roomOffer(emptyTwin, "unit", true)).toEqual({ blocked: "Not a whole unit" });
  });
  test("Homes (nothing wanted): an empty twin is one single row, a half-full one its beds", () => {
    expect(roomOffer(emptyTwin, undefined, true)).toEqual({ as: "whole" });
    expect(roomOffer(halfTwin, undefined, true)).toEqual({ as: "bed" });
    expect(roomOffer(laterTwin, undefined, true)).toEqual({ as: "bed" });
  });
});

import { shapeFromWebsite, wholeUnitOffered } from "../src/lib/room-offer";

describe("shapeFromWebsite", () => {
  test("twin if the room type is sold as twin at all", () => {
    expect(shapeFromWebsite({ occupancies: ["single", "twin"] })).toBe("twin");
    expect(shapeFromWebsite({ occupancies: ["twin"] })).toBe("twin");
    expect(shapeFromWebsite({ occupancies: ["single"] })).toBe("single");
    expect(shapeFromWebsite(undefined)).toBe("single");
  });
});

describe("wholeUnitOffered", () => {
  test("only with a whole-unit rate for the unit type", () => {
    expect(wholeUnitOffered({ unit_rates: {} }, "4-bedroom")).toBe(false);
    expect(wholeUnitOffered({ unit_rates: { "4-bedroom": { long: 0 } } }, "4-bedroom")).toBe(false);
    expect(wholeUnitOffered({ unit_rates: { "4-bedroom": { long: 4800 } } }, "4-bedroom")).toBe(true);
    expect(wholeUnitOffered({ unit_rates: { "4-bedroom": { short: 5200 } } }, "3-bedroom")).toBe(false);
  });
});
