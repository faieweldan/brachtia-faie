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
  // saveUnitWith: bed labels and order only; removing a bed nobody is placed on;
  // the two "database not migrated yet" fallbacks of checkout and check-in
  "src/lib/homes.functions.ts": 4,
  // the rent in force and the longer end date, copied onto the bed for display
  "src/lib/tenancy-events.server.ts": 3,
  // syncPaidStay: the paid stay's dates and rent copied onto its bed for display
  "src/lib/booking-lifecycle.ts": 1,
  // the master-list upload building a unit's rooms and beds, and its rent on the bed
  "src/lib/residents.functions.ts": 5,
  // Stay details: an unpaid booking's hold follows its dates, after placement_conflict
  "src/lib/admin.functions.ts": 1,
};
const WRITE = /from\("(beds|placement_holds)"\)\s*\.\s*(update|insert|upsert|delete)\b/g;

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
