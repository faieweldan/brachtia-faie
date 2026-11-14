/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

import { placementConflict } from "../src/lib/placement";

/**
 * A room let whole is whole only for that stay's dates (Dani, 14 Nov 2026) -
 * 20261114100000_let_whole_by_dates.sql (run it first) and placementConflict,
 * which the room picker uses. The B-09-01 Room A case, on test-bratchia only,
 * with a throwaway unit and made-up people removed afterwards:
 *
 *   RUN_DB_TESTS=1 bun --env-file=.env test tests/let-whole-dates.db.test.ts
 *
 * Skipped otherwise - and refused outright against any other database.
 */
const TEST_PROJECT = "zyuadtrqcgocottxyzpk";
const url = process.env["SUPABASE_URL"] ?? "";
const run = process.env["RUN_DB_TESTS"] === "1" && url.includes(TEST_PROJECT);
const d = run ? describe : describe.skip;

const sb: any = run ? createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!) : null;
const tag = `ZZTEST-LW-${Date.now().toString(36)}`;
const made = { unit: "", enquiries: [] as string[], residents: [] as string[] };
const ids: Record<string, string> = {};

async function ok<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}
const rpc = (fn: string, args: Record<string, unknown>) => ok<any>(sb.rpc(fn, args));
const place = (enquiryId: string, bedId: string, whole = false) =>
  rpc("place_stay", { p_enquiry: enquiryId, p_resident: null, p_bed: bedId, p_whole: whole });

async function enquiry(name: string, moveIn: string, moveOut: string) {
  const e = await ok<any>(
    sb
      .from("enquiries")
      .insert({ full_name: `${tag} ${name}`, gender: "Male", move_in: moveIn, move_out: moveOut, status: "open" })
      .select("id")
      .single(),
  );
  made.enquiries.push(e.id);
  return e.id as string;
}

/** the booking fee, as residentFromBooking does it: resident and tenancy, then the database converts the hold */
async function pay(enquiryId: string, name: string, start: string, end: string) {
  const r = await ok<any>(
    sb.from("residents").insert({ full_name: `${tag} ${name}`, gender: "Male", enquiry_id: enquiryId }).select("id").single(),
  );
  made.residents.push(r.id);
  await ok(sb.from("enquiries").update({ resident_id: r.id, status: "booked" }).eq("id", enquiryId));
  await ok(
    sb.from("tenancies").insert({ resident_id: r.id, enquiry_id: enquiryId, bed_id: null, start_date: start, end_date: end }),
  );
  await rpc("confirm_paid_placement", { p_enquiry: enquiryId });
  return r.id as string;
}

d("let whole by dates (test-bratchia)", () => {
  beforeAll(async () => {
    const res = await ok<any>(sb.from("residences").select("id").limit(1).single());
    const u = await ok<any>(
      sb.from("units").insert({ residence_id: res.id, code: tag, unit_no: tag, unit_type: "3-bedroom" }).select("id").single(),
    );
    made.unit = u.id;
    const rm = await ok<any>(
      sb.from("rooms").insert({ unit_id: u.id, letter: "A", occupancy: "twin", sort_order: 0 }).select("id").single(),
    );
    const beds = await ok<any[]>(
      sb
        .from("beds")
        .insert([
          { room_id: rm.id, label: "Twin 1", sort_order: 0 },
          { room_id: rm.id, label: "Twin 2", sort_order: 1 },
        ])
        .select("id, label"),
    );
    ids["T1"] = beds.find((b) => b.label === "Twin 1").id;
    ids["T2"] = beds.find((b) => b.label === "Twin 2").id;

    // "Shadab": the room as a single, paid, to 31 Mar 2027
    const s = await enquiry("Single", "2027-01-01", "2027-03-31");
    expect((await place(s, ids["T1"]!, true)).ok).toBe(true);
    await pay(s, "Single", "2027-01-01", "2027-03-31");
    const t2 = await ok<any>(sb.from("beds").select("hold_for").eq("id", ids["T2"]!).single());
    expect(t2.hold_for).toBe("Sold as single");
  });

  afterAll(async () => {
    if (!run) return;
    await sb.from("tenancies").delete().in("resident_id", made.residents);
    await sb.from("residents").delete().in("id", made.residents);
    await sb.from("units").delete().eq("id", made.unit);
    await sb.from("enquiries").delete().in("id", made.enquiries);
  });

  test("while the single lasts, the other bed is refused", async () => {
    const e = await enquiry("During", "2027-02-01", "2027-02-28");
    const out = await place(e, ids["T2"]!);
    expect(out.ok).toBe(false);
    expect(String(out.detail)).toContain("Single");
  });

  test("after it ends, both twin beds go to two people (Anas, then Ahmed)", async () => {
    const anas = await enquiry("Twin A", "2027-04-02", "2027-12-31");
    expect((await place(anas, ids["T2"]!)).ok).toBe(true);
    const ahmed = await enquiry("Twin B", "2027-04-02", "2027-12-31");
    ids["ahmed"] = ahmed;
    // before 20261114100000 the database refused this: "Twin A has it"
    expect((await place(ahmed, ids["T1"]!)).ok).toBe(true);
  });

  test("the room picker reads the same answer from the same data", async () => {
    const { readUnit } = await import("../src/lib/homes.functions");
    const unit = await readUnit(sb, made.unit);
    const room = unit.rooms[0]!;
    const t1 = room.beds.find((b) => b.label === "Twin 1")!;
    const t2 = room.beds.find((b) => b.label === "Twin 2")!;
    expect(t1.letWhole).toBe(true);
    const ask = { start: "2027-04-02", end: "2027-12-31", gender: "Male", enquiryId: ids["ahmed"] };
    expect(placementConflict(unit, room, t1, ask)).toBe("");
    expect(placementConflict(unit, room, t2, { ...ask, enquiryId: "someone-else", start: "2027-02-01", end: "2027-02-28" })).toContain(
      "Single",
    );
  });
});
