/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

/**
 * Moved out before the checkout is settled (22 Oct 2026) -
 * 20261026100000_moved_out.sql, on test-bratchia only, with a throwaway unit
 * and made-up people removed afterwards. The real case: Adnaan, early
 * termination, left ST1-09-04; Max checks in the next day while Adnaan's
 * statement is still open. Run with:
 *
 *   RUN_DB_TESTS=1 bun --env-file=.env test tests/moved-out.db.test.ts
 *
 * Skipped otherwise - and refused outright against any other database.
 */
const TEST_PROJECT = "zyuadtrqcgocottxyzpk";
const url = process.env["SUPABASE_URL"] ?? "";
const run = process.env["RUN_DB_TESTS"] === "1" && url.includes(TEST_PROJECT);
const d = run ? describe : describe.skip;

const sb: any = run ? createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!) : null;
const tag = `ZZTEST-MO-${Date.now().toString(36)}`;
const made = { unit: "", enquiries: [] as string[], residents: [] as string[] };
const ids: Record<string, string> = {};

const dayFrom = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const today = dayFrom(0);
const end = dayFrom(300);

async function ok<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}
const rpc = (fn: string, args: Record<string, unknown>) => ok<any>(sb.rpc(fn, args));
const bed = (id: string) => ok<any>(sb.from("beds").select("*").eq("id", id).single());
const claimsOn = async (bedId: string) =>
  ((await rpc("placement_claims", { p_units: [made.unit] })) as any[]).filter((c) => c.bed_id === bedId);
const place = (enquiryId: string, bedId: string) =>
  rpc("place_stay", { p_enquiry: enquiryId, p_resident: null, p_bed: bedId });

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

/** the booking fee, as residentFromBooking does it */
async function pay(enquiryId: string, name: string, start: string, stop: string) {
  const r = await ok<any>(
    sb.from("residents").insert({ full_name: `${tag} ${name}`, gender: "Male", enquiry_id: enquiryId }).select("id").single(),
  );
  made.residents.push(r.id);
  await ok(sb.from("enquiries").update({ resident_id: r.id, status: "booked" }).eq("id", enquiryId));
  await ok(
    sb.from("tenancies").insert({ resident_id: r.id, enquiry_id: enquiryId, bed_id: null, start_date: start, end_date: stop }),
  );
  await rpc("confirm_paid_placement", { p_enquiry: enquiryId });
  return r.id as string;
}

d("moved out before the checkout is settled (test-bratchia)", () => {
  beforeAll(async () => {
    const res = await ok<any>(sb.from("residences").select("id").limit(1).single());
    const u = await ok<any>(
      sb.from("units").insert({ residence_id: res.id, code: tag, unit_no: tag, unit_type: "1-bedroom" }).select("id").single(),
    );
    made.unit = u.id;
    const room = await ok<any>(
      sb.from("rooms").insert({ unit_id: u.id, letter: "A", occupancy: "single", sort_order: 0 }).select("id").single(),
    );
    const b = await ok<any>(sb.from("beds").insert({ room_id: room.id, label: "Single", sort_order: 0 }).select("id").single());
    ids["A"] = b.id;

    // Adnaan: booked, paid and checked in, to the end of the tenancy
    const e = await enquiry("Adnaan", dayFrom(-14), end);
    expect((await place(e, ids["A"]!)).ok).toBe(true);
    ids["adnaan"] = await pay(e, "Adnaan", dayFrom(-14), end);
    expect((await rpc("activate_at_checkin", { p_resident: ids["adnaan"] })).ok).toBe(true);
  });

  afterAll(async () => {
    if (!run) return;
    await sb.from("tenancies").delete().in("resident_id", made.residents);
    await sb.from("residents").delete().in("id", made.residents);
    await sb.from("units").delete().eq("id", made.unit);
    await sb.from("enquiries").delete().in("id", made.enquiries);
  });

  test("1. while Adnaan lives there, Max cannot be reserved into his room", async () => {
    ids["max_e"] = await enquiry("Max", dayFrom(1), end);
    expect((await place(ids["max_e"]!, ids["A"]!)).ok).toBe(false);
  });

  test("2. Moved out: the day is on his tenancy and the room is Vacant - nobody is promoted", async () => {
    const out = await rpc("move_out", { p_resident: ids["adnaan"], p_on: today });
    expect(out.ok).toBe(true);
    const t = await ok<any>(sb.from("tenancies").select("*").eq("resident_id", ids["adnaan"]).single());
    expect(t.moved_out_on).toBe(today);
    // the tenancy keeps its dates and its bed - the statement still says where and for what term
    expect([t.end_date, t.bed_id]).toEqual([end, ids["A"]]);
    const a = await bed(ids["A"]!);
    expect([a.status, a.resident_id]).toEqual(["vacant", null]);
    expect(await claimsOn(ids["A"]!)).toEqual([]);
  });

  test("3. Max can now be reserved: the room shows his hold, not Adnaan", async () => {
    expect((await place(ids["max_e"]!, ids["A"]!)).ok).toBe(true);
    const claims = await claimsOn(ids["A"]!);
    expect(claims.map((c) => c.source)).toEqual(["hold"]);
    expect(claims[0].who).toContain("Max");
  });

  test("4. Max pays and checks in: he is the bed's resident, Occupied", async () => {
    ids["max"] = await pay(ids["max_e"]!, "Max", dayFrom(1), end);
    const a = await bed(ids["A"]!);
    expect([a.resident_id, a.status]).toEqual([ids["max"], "booked"]);
    expect((await rpc("activate_at_checkin", { p_resident: ids["max"] })).ok).toBe(true);
    expect((await bed(ids["A"]!)).status).toBe("active");
  });

  test("5. Adnaan's stay never comes back: not seated, not waiting ahead of Max, not handed the bed after him", async () => {
    const t = await ok<any>(sb.from("tenancies").select("id").eq("resident_id", ids["adnaan"]).single());
    expect(await rpc("seat_if_first", { p_bed: ids["A"], p_tenancy: t.id })).toBe(false);
    // Max leaves too: the bed is emptied, never given back to Adnaan
    await rpc("release_after_checkout", { p_resident: ids["max"] });
    const a = await bed(ids["A"]!);
    expect([a.status, a.resident_id]).toEqual(["vacant", null]);
  });

  test("6. his page still names the room he lived in (resident_placements keeps the tenancy's bed)", async () => {
    const p = ((await rpc("resident_placements", { p_residents: [ids["adnaan"]] })) as any[])[0];
    expect(p.bed_id).toBe(ids["A"]);
  });

  test("7. a move-out day before the tenancy starts is refused", async () => {
    const out = await rpc("move_out", { p_resident: ids["adnaan"], p_on: dayFrom(-100) });
    expect(out.ok).toBe(false);
  });
});
