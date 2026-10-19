import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// One note, one place (Dani, 19 Oct 2026): once a booking has a resident, the
// booking's Internal notes card and the profile line are the same note.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("a resident's internal note lives in one place", () => {
  test("the booking card shows the resident's note once there is a resident", () => {
    const page = read("src/routes/admin.bookings.$id.tsx");
    expect(page).toContain("<BookingNoteBox");
    expect(page).toContain("residentId={row.resident_id}");
    expect(page).not.toContain("<InternalNoteEditor");
  });

  test("saving a booking note writes to the resident when the booking has one", () => {
    const fns = read("src/lib/admin.functions.ts");
    const at = fns.indexOf("if (data.adminNotes !== undefined)");
    const block = fns.slice(at, at + 700);
    expect(block).toContain('from("residents").update({ admin_notes: data.adminNotes })');
    expect(block).toContain('patch["admin_notes"] = data.adminNotes');
  });
});
