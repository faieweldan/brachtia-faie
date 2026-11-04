import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { staffChoices } from "../src/lib/staff";
import { loadStaff, requireSigner, requireStaff, saveStaffFile } from "../src/lib/staff.server";
import { fakeDb } from "./fake-db";


/*
 * Settings → Staff (Dani, 4 Nov 2026): one staff list, each person with their
 * own signature; whoever is chosen as Prepared by / Approved by / Issued by
 * signs. All data is made up.
 */
const SIG = "@signature:0123456789abcdef";

describe("the staff list", () => {
  test("before anything is saved: the team as it was, with the old signatory's signature on the person of that name", async () => {
    const db = fakeDb({}, { "signatory/current.json": { name: "norfadirah ", title: "Admin", token: SIG } });
    const list = await loadStaff(db.sb);
    expect(list.map((s) => s.name)).toEqual(["Syazwani", "Norfadirah", "Valsala"]);
    expect(list.find((s) => s.name === "Norfadirah")).toMatchObject({ title: "Admin", token: SIG, active: true });
    expect(list.find((s) => s.name === "Syazwani")?.token).toBe("");
  });

  test("once saved, the saved list is the list", async () => {
    const db = fakeDb();
    await saveStaffFile(db.sb, [{ name: "Aina", title: "Admin", token: SIG, active: true }]);
    expect((await loadStaff(db.sb)).map((s) => s.name)).toEqual(["Aina"]);
  });

  test("someone who has left is not offered - unless a record already names them", () => {
    const list = [
      { name: "Syazwani", active: true },
      { name: "Valsala", active: false },
    ];
    expect(staffChoices(list)).toEqual(["Syazwani"]);
    expect(staffChoices(list, "Valsala")).toEqual(["Syazwani", "Valsala"]);
  });

  test("the server takes only someone working here now", async () => {
    const db = fakeDb({}, { "staff/list.json": { staff: [{ name: "Valsala", title: "", token: "", active: false }, { name: "Aina", title: "", token: "", active: true }] } });
    await expect(requireStaff(db.sb, "Valsala", "Choose who")).rejects.toThrow("Choose who");
    await expect(requireStaff(db.sb, "Somebody", "Choose who")).rejects.toThrow("Choose who");
    await expect(requireStaff(db.sb, "", "Choose who")).rejects.toThrow("Choose who");
    expect(await requireStaff(db.sb, "Aina", "Choose who")).toBe("Aina");
  });

  test("whoever signs must have a signature - the message names them", async () => {
    const db = fakeDb({}, { "staff/list.json": { staff: [{ name: "Aina", title: "Admin", token: "", active: true }, { name: "Mira", title: "Manager", token: SIG, active: true }] } });
    await expect(requireSigner(db.sb, "Aina")).rejects.toThrow("Save Aina's signature in Settings → Staff first.");
    expect(await requireSigner(db.sb, "Mira")).toEqual({ name: "Mira", title: "Manager", token: SIG });
  });
});

describe("one list, not one per screen", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });

  test("no screen or server function keeps its own list of staff names", () => {
    const offenders = files("src").filter((f) => f !== join("src", "lib", "staff.ts") && /["']Syazwani["'][^\n]*["']Valsala["']/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  test("every document that carries Brachtia's signature takes it from the person chosen, not one fixed signatory", () => {
    const readers = files("src").filter((f) => /\bloadSignatory\(/.test(readFileSync(f, "utf8")));
    // the old signatory is read only to start the list, and for checkout versions issued before Issued by existed
    expect(readers.sort()).toEqual([join("src", "lib", "checkout.server.ts"), join("src", "lib", "signatory.server.ts"), join("src", "lib", "staff.server.ts")]);
  });
});
