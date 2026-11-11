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
  test("single wanted: a twin let whole to someone leaving before the stay is sold whole again (C-10-11)", () => {
    // Arthur has Room A to 31 Dec; Gagan asks from 1 Jan - the picker says the room is free then
    const arthurWhole = room("twin", [bed("t1", { status: "active", residentId: "r1" }), bed("t2", { status: "held" })], "A");
    expect(roomOffer(arthurWhole, "single", true, true)).toEqual({ as: "whole" });
    // the dates overlap: still blocked
    expect(roomOffer(arthurWhole, "single", true, false)).toEqual({ blocked: "Twin room" });
    // no dates (Homes): empty today, as before
    expect(roomOffer(arthurWhole, "single", true, "today")).toEqual({ blocked: "Twin room" });
  });
  test("single wanted: an empty twin room is sold whole as one single (A-07-03)", () => {
    expect(roomOffer(emptyTwin, "single", true, "today")).toEqual({ as: "whole" });
  });
  test("single wanted: a twin room with someone in it, or booked later, is not", () => {
    expect(roomOffer(halfTwin, "single", true, "today")).toHaveProperty("blocked");
    expect(roomOffer(laterTwin, "single", true, "today")).toHaveProperty("blocked");
  });
  test("single wanted: a twin room type with no single rate is not", () => {
    expect(roomOffer(emptyTwin, "single", false, "today")).toEqual({ blocked: "Twin room" });
  });
  test("single wanted: a single room is itself", () => {
    expect(roomOffer(emptySingle, "single", true, "today")).toEqual({ as: "bed" });
    expect(roomOffer(takenSingle, "single", true, "today")).toEqual({ as: "bed" });
  });
  test("twin wanted: twin beds as they are, never a single room", () => {
    expect(roomOffer(halfTwin, "twin", true, "today")).toEqual({ as: "bed" });
    // a single room stays single: its shape is Website's (11 Oct 2026)
    expect(roomOffer(emptySingle, "twin", true, "today")).toEqual({ blocked: "Single room" });
    expect(roomOffer(takenSingle, "twin", true, "today")).toEqual({ blocked: "Single room" });
  });
  test("whole unit: only the Unit slot, and the Unit slot only for it", () => {
    expect(roomOffer(unitSlot, "unit", true, "today")).toEqual({ as: "bed" });
    expect(roomOffer(unitSlot, "single", true, "today")).toEqual({ blocked: "Whole unit" });
    expect(roomOffer(emptyTwin, "unit", true, "today")).toEqual({ blocked: "Not a whole unit" });
  });
  test("Homes (nothing wanted): an empty twin is one single row, a half-full one its beds", () => {
    expect(roomOffer(emptyTwin, undefined, true, "today")).toEqual({ as: "whole" });
    expect(roomOffer(halfTwin, undefined, true, "today")).toEqual({ as: "bed" });
    expect(roomOffer(laterTwin, undefined, true, "today")).toEqual({ as: "bed" });
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

import { bedForPlacement } from "../src/lib/room-offer";

describe("bedForPlacement (Dani, 12 Oct 2026)", () => {
  const twin = { occupancy: "twin", beds: [{ label: "Twin 1" }, { label: "Twin 2" }] };
  const single = { occupancy: "single", beds: [{ label: "Single" }] };
  test("a bed named as it is", () => {
    expect(bedForPlacement(twin, "Twin 2")).toEqual({ bed: { label: "Twin 2" }, whole: false });
    expect(bedForPlacement(single, "single")).toEqual({ bed: { label: "Single" }, whole: false });
  });
  test("Single in a twin room is Twin 1, the room let whole", () => {
    expect(bedForPlacement(twin, "Single")).toEqual({ bed: { label: "Twin 1" }, whole: true });
  });
  test("a bed that is not there", () => {
    expect(bedForPlacement(single, "Twin 2")).toBeUndefined();
  });
});
