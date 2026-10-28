import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { LEGACY_BRANDS, LEGACY_INVENTORY, areasOf, emptyRecord, inventoryGaps, listFromResidence } from "../src/lib/inventory";

// the lists the migration fills each residence with (28 Oct 2026)
const sql = readFileSync("supabase/migrations/20261028130000_residence_inventory.sql", "utf8");
const seeded = [...sql.matchAll(/set inventory = '(.+?)'::jsonb\s+where slug = '([^']+)'/gs)].map((m) => ({
  slug: m[2]!,
  inventory: JSON.parse(m[1]!.replace(/''/g, "'")),
}));
const of = (slug: string) => listFromResidence(seeded.find((s) => s.slug === slug)!)!;

describe("Schedule C, each residence its own", () => {
  test("The Arc's list reads exactly as the form the records already made were answered against", () => {
    expect(of("the-arc-cyberjaya")).toEqual({ areas: LEGACY_INVENTORY, brands: LEGACY_BRANDS });
  });

  test("Solstice has its own rooms and items, and Other last on its brands", () => {
    const sol = of("solstice-residence-cyberjaya");
    expect(sol.areas.map((a) => a.name)).toEqual(["Living & Dining Area", "Kitchen", "Bath", "Room", "Others"]);
    expect(sol.areas.flatMap((a) => a.items).find((i) => i.name === "Curtain")?.qty).toBe(2);
    expect(sol.brands.at(-1)).toBe("Other");
    expect(sol.brands).toContain("Acson");
  });

  test("a record answered against Solstice's list asks Solstice's items, not The Arc's", () => {
    const r = emptyRecord(of("solstice-residence-cyberjaya"));
    expect(areasOf(r)[0]!.name).toBe("Living & Dining Area");
    expect(inventoryGaps(r)[0]!.label).toBe("27 items not checked yet");
  });

  test("a record with no list (sent before 28 Oct 2026) is read with The Arc's form", () => {
    expect(areasOf(emptyRecord())).toBe(LEGACY_INVENTORY);
  });

  test("a residence with no list set has none", () => {
    expect(listFromResidence({ inventory: {} })).toBeNull();
    expect(listFromResidence(null)).toBeNull();
  });
});
