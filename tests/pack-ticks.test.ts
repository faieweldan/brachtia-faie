import { describe, expect, test } from "bun:test";

import { valuesFor } from "../src/lib/templates.functions";

// a resident with their IC copy on file: the system ticks Box_7 by itself
const ctx = { resident: { docs: [{ key: "id", path: "r/id.jpg" }] }, enquiry: null, bed: null, room: null, unit: null, residence: null, tenancy: null };
const maps = { Box_7: { kind: "field" as const, key: "has_id_copy" }, Name: { kind: "field" as const, key: "resident_full_name" } };

describe("access card ticks in the draft (2 Oct 2026)", () => {
  test("the system ticks what it knows", async () => {
    expect((await valuesFor(["Box_7"], ctx, maps))["Box_7"]).toBe("yes");
  });
  test("unticked by admin stays unticked - an empty value is a choice", async () => {
    expect((await valuesFor(["Box_7"], ctx, maps, { Box_7: "" }))["Box_7"]).toBe("");
  });
  test("ticked by admin when the system would not", async () => {
    const none = { ...ctx, resident: { docs: [] } };
    expect((await valuesFor(["Box_7"], none, maps, { Box_7: "yes" }))["Box_7"]).toBe("yes");
  });
});
