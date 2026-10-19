import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { TEMPLATE_FIELDS as FIELDS } from "@/lib/template-fields";

/*
 * Internal notes are admin only (Dani, 19 Oct 2026). residents.admin_notes and
 * the enquiry's message must never reach the resident: not through the
 * Application Form Link, the signing page, checkout or inventory links, nor
 * through a document made from a template.
 */
const RESIDENT_FACING = [
  "src/lib/profile-link.functions.ts",
  "src/lib/signing.functions.ts",
  "src/lib/declaration.functions.ts",
  "src/lib/public.functions.ts",
  "src/lib/checkout.functions.ts",
  "src/lib/inventory.functions.ts",
  "src/routes/my-profile.$token.tsx",
  "src/routes/sign.$token.tsx",
];

describe("internal notes stay admin only", () => {
  for (const file of RESIDENT_FACING) {
    const src = readFileSync(file, "utf8");
    test(`${file} never reads admin_notes`, () => {
      expect(src).not.toContain("admin_notes");
    });
    test(`${file} never reads a whole residents or enquiries row`, () => {
      // confirmViewingFromLink reads the whole booking to book the viewing and
      // returns only { ok } - checked 19 Oct 2026; any other one is new
      const whole = src.match(/from\("(residents|enquiries)"\)\s*\.select\("\*"\)/g) ?? [];
      expect(whole.length).toBe(file === "src/lib/public.functions.ts" ? 1 : 0);
    });
  }

  test("the profile-link data lists its columns, and admin_notes is not one", () => {
    const src = readFileSync("src/lib/profile-link.functions.ts", "utf8");
    const editable = src.slice(src.indexOf("const EDITABLE = ["), src.indexOf("]", src.indexOf("const EDITABLE = [")));
    expect(editable.length).toBeGreaterThan(20);
    expect(editable).not.toContain("admin_notes");
    expect(editable).not.toMatch(/"message"/);
  });

  test("no template field prints the note or the enquiry message", () => {
    const probe = { resident: { admin_notes: "SECRET-NOTE" }, enquiry: { admin_notes: "SECRET-NOTE", message: "SECRET-MSG" } } as any;
    for (const f of FIELDS as any[]) {
      let v: unknown;
      try {
        v = f.get(probe);
      } catch {
        continue;
      }
      expect(String(v ?? "")).not.toContain("SECRET");
    }
  });
});
