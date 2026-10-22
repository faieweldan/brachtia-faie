import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { findBedForResident, type Unit } from "../src/lib/ops-store";

/*
 * One placement system (Phase 2, 14 Oct 2026). Who is in a bed, who holds it
 * and who is coming to it is written by the placement functions in the
 * database only (place_stay, confirm_paid_placement, release_hold,
 * release_hand_hold, release_after_checkout, activate_at_checkin), and read
 * through one claim list (placement_claims) and one resident lookup
 * (resident_placements). A screen or server function that writes a bed row
 * itself is how Update Tenancy came to hold rooms the bookings could not see.
 *
 * The writes below are what is left, each for a reason - the count may go down,
 * never up. A new one fails here: call place_stay (homes.functions placeStay)
 * or one of the release functions instead.
 */
const KNOWN: Record<string, number> = {
  // saveUnitWith: bed labels and order only (removal is drop_unused_rooms_beds); the two
  // "database not migrated yet" fallbacks of checkout and check-in; syncWholeUnitSlots
  // making the whole-unit line's empty "Unit" bed (22 Oct 2026)
  "src/lib/homes.functions.ts": 4,
  // the rent in force copied onto the bed for display, after a move or a rent change
  "src/lib/tenancy-events.server.ts": 2,
  // the master-list upload building a unit's rooms and beds, and its rent on the bed
  "src/lib/residents.functions.ts": 5,
};
// a tenancy's dates (and its bed) count too: they are written by place_stay, move_stay_dates
// and extend_stay. Creating a tenancy (insert) is not a date change and is not counted.
const WRITE =
  /from\("(beds|placement_holds)"\)\s*\.\s*(update|insert|upsert|delete)\b|from\("tenancies"\)\s*\.\s*(update|upsert)\b/g;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe("placements are written by the database's placement functions only", () => {
  const counts: Record<string, number> = {};
  for (const f of files("src")) {
    const n = [...readFileSync(f, "utf8").matchAll(WRITE)].length;
    if (n) counts[f] = n;
  }
  test("no file writes bed rows or holds more often than it did", () => {
    const over = Object.entries(counts)
      .filter(([f, n]) => n > (KNOWN[f] ?? 0))
      .map(
        ([f, n]) => `${f}: ${n} (allowed ${KNOWN[f] ?? 0}) - use place_stay / release_hold instead`,
      );
    expect(over).toEqual([]);
  });
  test("no screen marks a bed held, booked or vacant itself", () => {
    const own = files("src").filter((f) =>
      /\b(updateBed|vacateBed|convertRoomOccupancy|updateBedRow|reserveBed)\(/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(own).toEqual([]);
  });
});

describe("findBedForResident reads the one lookup", () => {
  const bed = (id: string, residentId?: string) => ({
    id,
    label: "Single",
    status: residentId ? ("active" as const) : ("vacant" as const),
    residentId,
  });
  const unit: Unit = {
    id: "u1",
    code: "U1",
    residenceId: "r",
    residenceName: "",
    residenceSlug: "",
    unitNo: "A-01-01",
    block: "",
    floor: "",
    unitType: "",
    gender: "",
    wholeUnit: false,
    wholeUnitRent: 0,
    notes: "",
    deactivatedAt: "",
    deactivationReason: "",
    rooms: [
      {
        id: "ra",
        letter: "A",
        roomTypeCode: "",
        occupancy: "single",
        rent: 0,
        beds: [bed("b1", "someone-else")],
      },
      { id: "rb", letter: "B", roomTypeCode: "", occupancy: "single", rent: 0, beds: [bed("b2")] },
    ],
  };

  test("it gives the room resident_placements gives, never one worked out on the page", () => {
    const placements = { me: { bedId: "b2", via: "tenancy" as const } };
    const found = findBedForResident([unit], { id: "me" }, placements);
    expect([found?.bed.id, found?.upcoming]).toEqual(["b2", true]);
  });

  test("seated: it is their bed now", () => {
    const found = findBedForResident(
      [unit],
      { id: "someone-else" },
      { "someone-else": { bedId: "b1", via: "seated" } },
    );
    expect([found?.bed.id, found?.upcoming]).toEqual(["b1", undefined]);
  });

  test("not in the lookup once it has loaded: no room, whatever a bed row says", () => {
    expect(findBedForResident([unit], { id: "someone-else" }, {})).toBeUndefined();
  });
});

/*
 * The migration stops - and keeps nothing - unless every guard is in place
 * (review, 14 Oct 2026). Its failure path cannot be run against a database
 * from here (the service role cannot drop a constraint), so its text is
 * checked; the database test checks placement_guard_report on the result.
 */
describe("20261014100000_one_placement.sql guards itself", () => {
  const sql = readFileSync("supabase/migrations/20261014100000_one_placement.sql", "utf8");

  test("it runs as one transaction", () => {
    expect(sql).toMatch(/^begin;$/m);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
  });

  test("overlapping holds stop it with an error, never just a notice", () => {
    expect(sql).not.toMatch(/raise notice/i);
    const block = sql.slice(
      sql.indexOf("placement_holds_no_overlap"),
      sql.indexOf("-- 2. Every claim"),
    );
    expect(block).toMatch(/raise exception 'placement_holds_no_overlap cannot be added/);
  });

  test("it ends by checking every guard, and raises if one is missing", () => {
    const tail = sql.slice(sql.lastIndexOf("-- 12."));
    expect(tail).toContain("placement_guard_report()");
    expect(tail).toMatch(/raise exception 'one_placement did not complete/);
  });

  test("a hold has exactly one owner, and a resident's hold has both dates", () => {
    expect(sql).toContain("check ((enquiry_id is null) <> (resident_id is null))");
    expect(sql).toContain(
      "check (resident_id is null or (start_date is not null and end_date is not null))",
    );
  });

  test("every function it creates is closed to everybody but the server", () => {
    const made = [...sql.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]!);
    const grants = sql.slice(sql.indexOf("foreach f in array array["));
    expect(made.filter((f) => !grants.includes(`'public.${f}(`))).toEqual([]);
  });
});
