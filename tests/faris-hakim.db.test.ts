/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

/**
 * The UAT case of 10 Oct 2026, against the database (test-bratchia only, a
 * throwaway unit, made-up people, removed afterwards):
 *
 *   Faris  A-22-06 Room C  20 Oct - 31 Dec 2026
 *   Hakim  same room       10 Jan - 27 Feb 2027 - must be allowed; it did not overlap
 *
 * Run with: RUN_DB_TESTS=1 bun --env-file=.env test tests/faris-hakim.db.test.ts
 */
const TEST_PROJECT = "zyuadtrqcgocottxyzpk";
const url = process.env["SUPABASE_URL"] ?? "";
const run = process.env["RUN_DB_TESTS"] === "1" && url.includes(TEST_PROJECT);
const d = run ? describe : describe.skip;
const sb: any = run ? createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!) : null;
const tag = `ZZTEST-${Date.now().toString(36)}`;
const made = { unit: "", enquiries: [] as string[], residents: [] as string[] };
const beds: Record<string, string> = {};
const who: Record<string, string> = {};

async function ok<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}
const rpc = (fn: string, args: Record<string, unknown>) => ok<any>(sb.rpc(fn, args));
const place = (enquiry: string, bed: string) =>
  rpc("place_stay", { p_enquiry: enquiry, p_resident: null, p_bed: bed });
const bed = (id: string) => ok<any>(sb.from("beds").select("*").eq("id", id).single());
const hold = (e: string) =>
  ok<any>(sb.from("placement_holds").select("*").eq("enquiry_id", e).maybeSingle());

async function enquiry(name: string, moveIn: string, moveOut: string) {
  const e = await ok<any>(
    sb
      .from("enquiries")
      .insert({
        full_name: `${tag} ${name}`,
        gender: "Male",
        move_in: moveIn,
        move_out: moveOut,
        status: "open",
      })
      .select("id")
      .single(),
  );
  made.enquiries.push(e.id);
  return e.id as string;
}

/** the RM500: a resident, a tenancy with no bed, then the database converts the hold */
async function pay(e: string, name: string) {
  const en = await ok<any>(sb.from("enquiries").select("move_in, move_out").eq("id", e).single());
  const r = await ok<any>(
    sb
      .from("residents")
      .insert({ full_name: `${tag} ${name}`, gender: "Male", enquiry_id: e })
      .select("id")
      .single(),
  );
  made.residents.push(r.id);
  await ok(sb.from("enquiries").update({ resident_id: r.id, status: "booked" }).eq("id", e));
  await ok(
    sb.from("tenancies").insert({
      resident_id: r.id,
      enquiry_id: e,
      bed_id: null,
      start_date: en.move_in,
      end_date: en.move_out,
    }),
  );
  await rpc("confirm_paid_placement", { p_enquiry: e });
  return r.id as string;
}

d("Faris and Hakim on one room (test-bratchia)", () => {
  beforeAll(async () => {
    const res = await ok<any>(sb.from("residences").select("id").limit(1).single());
    const u = await ok<any>(
      sb
        .from("units")
        .insert({ residence_id: res.id, code: tag, unit_no: tag, unit_type: "3-bedroom" })
        .select("id")
        .single(),
    );
    made.unit = u.id;
    const rooms = await ok<any[]>(
      sb
        .from("rooms")
        .insert(
          ["C", "D", "E"].map((l, i) => ({
            unit_id: u.id,
            letter: l,
            occupancy: "single",
            sort_order: i,
          })),
        )
        .select("id, letter"),
    );
    const bs = await ok<any[]>(
      sb
        .from("beds")
        .insert(rooms.map((r) => ({ room_id: r.id, label: "Single", sort_order: 0 })))
        .select("id, room_id"),
    );
    for (const r of rooms) beds[r.letter] = bs.find((b) => b.room_id === r.id).id;
  });

  afterAll(async () => {
    if (!run) return;
    await sb.from("placement_holds").delete().in("enquiry_id", made.enquiries);
    await sb.from("tenancies").delete().in("enquiry_id", made.enquiries);
    await sb.from("residents").delete().in("id", made.residents);
    await sb.from("units").delete().eq("id", made.unit);
    await sb.from("booking_events").delete().in("enquiry_id", made.enquiries);
    await sb.from("enquiries").delete().in("id", made.enquiries);
  });

  test("1. Faris reserves Room C, 20 Oct - 31 Dec", async () => {
    who["eF"] = await enquiry("Faris", "2026-10-20", "2026-12-31");
    expect((await place(who["eF"]!, beds["C"]!)).ok).toBe(true);
    expect((await hold(who["eF"]!))?.bed_id).toBe(beds["C"]);
  });

  test("2. Hakim on overlapping dates: refused, with who and when", async () => {
    who["eH"] = await enquiry("Hakim", "2026-12-01", "2027-02-27");
    const r = await place(who["eH"]!, beds["C"]!);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("Faris");
  });

  test("3. Hakim moved to 10 Jan - 27 Feb: accepted on the same room; Faris still Reserved", async () => {
    await ok(
      sb
        .from("enquiries")
        .update({ move_in: "2027-01-10", move_out: "2027-02-27" })
        .eq("id", who["eH"]),
    );
    expect((await place(who["eH"]!, beds["C"]!)).ok).toBe(true);
    expect((await hold(who["eF"]!))?.bed_id).toBe(beds["C"]);
    expect((await hold(who["eH"]!))?.bed_id).toBe(beds["C"]);
  });

  test("4/5. again with Faris Booked: Hakim still fits; Faris is the room's Booked resident", async () => {
    const { releaseBooking } = await import("../src/lib/booking-lifecycle");
    expect((await releaseBooking(sb, who["eH"]!)).ok).toBe(true);
    who["F"] = await pay(who["eF"]!, "Faris");
    const c = await bed(beds["C"]!);
    expect([c.resident_id, c.status]).toEqual([who["F"], "booked"]);
    expect(await hold(who["eF"]!)).toBeNull();
    expect((await place(who["eH"]!, beds["C"]!)).ok).toBe(true);
  });

  test("6/7. Hakim is a Reserved hold; the room's claims run Faris then Hakim", async () => {
    expect((await hold(who["eH"]!))?.bed_id).toBe(beds["C"]);
    const claims = await rpc("unit_claims", { p_unit: made.unit });
    const onC = (claims as any[])
      .filter((c) => c.bed_id === beds["C"])
      .sort((a, b) => String(a.starts).localeCompare(String(b.starts)));
    expect(onC.map((c) => String(c.who).replace(`${tag} `, ""))).toEqual(["Faris", "Hakim"]);
  });

  test("8/9. Hakim pays: Booked, on Room C through his tenancy - Faris is not overwritten", async () => {
    who["H"] = await pay(who["eH"]!, "Hakim");
    const c = await bed(beds["C"]!);
    expect(c.resident_id).toBe(who["F"]);
    const t = await ok<any>(
      sb.from("tenancies").select("bed_id").eq("enquiry_id", who["eH"]).single(),
    );
    expect(t.bed_id).toBe(beds["C"]);
    const { placementForResident } = await import("../src/lib/placement.server");
    expect((await placementForResident(sb, who["F"]!))?.room?.letter).toBe("C");
    expect((await placementForResident(sb, who["H"]!))?.room?.letter).toBe("C");
  });

  test("10. Faris leaves: Hakim becomes the room's Booked resident, not cleared", async () => {
    // as the Make inactive button does: Inactive first, then the bed is freed
    await ok(sb.from("residents").update({ status: "Inactive" }).eq("id", who["F"]));
    await rpc("release_after_checkout", { p_resident: who["F"] });
    const c = await bed(beds["C"]!);
    expect([c.resident_id, c.status, c.tenancy_start]).toEqual([who["H"], "booked", "2027-01-10"]);
  });

  test("11/12. a third stay after Hakim is accepted; one overlapping him is refused", async () => {
    who["e3"] = await enquiry("Third", "2027-03-01", "2027-04-30");
    expect((await place(who["e3"]!, beds["C"]!)).ok).toBe(true);
    const e4 = await enquiry("Clash", "2027-02-01", "2027-03-15");
    expect((await place(e4, beds["C"]!)).ok).toBe(false);
  });

  test("13. releasing one future booking removes only that one", async () => {
    const { releaseBooking } = await import("../src/lib/booking-lifecycle");
    expect((await releaseBooking(sb, who["e3"]!)).ok).toBe(true);
    expect(await hold(who["e3"]!)).toBeNull();
    expect((await bed(beds["C"]!)).resident_id).toBe(who["H"]);
  });

  test("14. two admins, same dates, same room: one wins, the other gets a real conflict", async () => {
    const a = await enquiry("Race A", "2027-06-01", "2027-08-31");
    const b = await enquiry("Race B", "2027-07-01", "2027-09-30");
    const [ra, rb] = await Promise.all([place(a, beds["E"]!), place(b, beds["E"]!)]);
    expect([ra.ok, rb.ok].filter(Boolean).length).toBe(1);
    expect((ra.ok ? rb : ra).detail).toContain("Race");
    who["eR"] = ra.ok ? a : b;
  });

  test("15. a booking moved to another room no longer holds its first one", async () => {
    expect((await place(who["eR"]!, beds["D"]!)).ok).toBe(true);
    expect((await hold(who["eR"]!))?.bed_id).toBe(beds["D"]);
    const left = await ok<any[]>(sb.from("placement_holds").select("id").eq("bed_id", beds["E"]));
    expect(left.length).toBe(0);
  });
});
