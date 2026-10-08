/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

/**
 * The placement functions in the database itself (20261009100000_dated_placement.sql),
 * on test-bratchia only, with a throwaway unit and made-up people that are
 * removed afterwards. Run with:
 *
 *   RUN_DB_TESTS=1 bun --env-file=.env test tests/placement.db.test.ts
 *
 * Skipped otherwise - and refused outright against any other database.
 */
const TEST_PROJECT = "zyuadtrqcgocottxyzpk";
const url = process.env["SUPABASE_URL"] ?? "";
const run = process.env["RUN_DB_TESTS"] === "1" && url.includes(TEST_PROJECT);
const d = run ? describe : describe.skip;

const sb: any = run ? createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!) : null;
const tag = `ZZTEST-${Date.now().toString(36)}`;
const made = { unit: "", enquiries: [] as string[], residents: [] as string[] };
const ids: Record<string, string> = {};

async function ok<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}
const rpc = (fn: string, args: Record<string, unknown>) => ok<any>(sb.rpc(fn, args));
const bed = (id: string) => ok<any>(sb.from("beds").select("*").eq("id", id).single());
const tenancy = (enquiryId: string) =>
  ok<any>(sb.from("tenancies").select("*").eq("enquiry_id", enquiryId).single());

async function enquiry(name: string, gender: string, moveIn: string, moveOut: string) {
  const e = await ok<any>(
    sb
      .from("enquiries")
      .insert({
        full_name: `${tag} ${name}`,
        gender,
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

/** what residentFromBooking does at RM500: a resident and their tenancy, bed left for the database */
async function pay(enquiryId: string, name: string, gender: string, start: string, end: string) {
  const r = await ok<any>(
    sb
      .from("residents")
      .insert({ full_name: `${tag} ${name}`, gender, enquiry_id: enquiryId })
      .select("id")
      .single(),
  );
  made.residents.push(r.id);
  await ok(
    sb.from("enquiries").update({ resident_id: r.id, status: "booked" }).eq("id", enquiryId),
  );
  const owned = await ok<any[]>(
    sb.from("beds").select("id, resident_id").eq("enquiry_id", enquiryId),
  );
  const free = owned.find((b) => !b.resident_id);
  if (free) {
    await ok(
      sb
        .from("beds")
        .update({
          resident_id: r.id,
          resident_name: `${tag} ${name}`,
          status: "booked",
          hold_for: null,
          tenancy_start: start,
          tenancy_end: end,
        })
        .eq("id", free.id),
    );
  }
  await ok(
    sb.from("tenancies").insert({
      resident_id: r.id,
      enquiry_id: enquiryId,
      bed_id: free?.id ?? null,
      start_date: start,
      end_date: end,
    }),
  );
  await rpc("confirm_paid_placement", { p_enquiry: enquiryId });
  return r.id as string;
}

d("placement in the database (test-bratchia)", () => {
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
        .insert([
          { unit_id: u.id, letter: "A", occupancy: "single", sort_order: 0 },
          { unit_id: u.id, letter: "B", occupancy: "twin", sort_order: 1 },
          { unit_id: u.id, letter: "C", occupancy: "single", sort_order: 2 },
        ])
        .select("id, letter"),
    );
    const room = (l: string) => rooms.find((r) => r.letter === l).id;
    const beds = await ok<any[]>(
      sb
        .from("beds")
        .insert([
          { room_id: room("A"), label: "Single", sort_order: 0 },
          { room_id: room("B"), label: "Twin 1", sort_order: 0 },
          { room_id: room("B"), label: "Twin 2", sort_order: 1 },
          { room_id: room("C"), label: "Single", sort_order: 0 },
        ])
        .select("id, label, room_id"),
    );
    ids["A"] = beds.find((b) => b.room_id === room("A")).id;
    ids["B1"] = beds.find((b) => b.label === "Twin 1").id;
    ids["B2"] = beds.find((b) => b.label === "Twin 2").id;
    ids["C"] = beds.find((b) => b.room_id === room("C")).id;

    // Muhammad in Room C to 30 Sep, checked in, not checked out
    const em = await enquiry("Muhammad", "Male", "2025-08-01", "2026-09-30");
    ids["M"] = await pay(em, "Muhammad", "Male", "2025-08-01", "2026-09-30");
    ids["eM"] = em;
    await ok(
      sb
        .from("beds")
        .update({
          resident_id: ids["M"],
          resident_name: `${tag} Muhammad`,
          gender: "Male",
          status: "active",
          tenancy_start: "2025-08-01",
          tenancy_end: "2026-09-30",
        })
        .eq("id", ids["C"]),
    );
  });

  afterAll(async () => {
    if (!run) return;
    await sb.from("tenancies").delete().in("enquiry_id", made.enquiries);
    await sb.from("residents").delete().in("id", made.residents);
    await sb.from("units").delete().eq("id", made.unit); // rooms and beds go with it
    await sb.from("enquiries").delete().in("id", made.enquiries);
  });

  test("1. empty room + unpaid booking -> Reserved", async () => {
    const e = await enquiry("Unpaid", "Male", "2026-11-01", "2027-04-30");
    ids["eU"] = e;
    expect((await rpc("place_stay", { p_enquiry: e, p_resident: null, p_bed: ids["A"] })).ok).toBe(
      true,
    );
    const b = await bed(ids["A"]!);
    expect([b.status, b.enquiry_id, b.resident_id]).toEqual(["held", e, null]);
  });

  test("2. empty room + fee paid -> Booked", async () => {
    const r = await pay(ids["eU"]!, "Unpaid", "Male", "2026-11-01", "2027-04-30");
    const b = await bed(ids["A"]!);
    expect([b.status, b.resident_id]).toEqual(["booked", r]);
    expect((await tenancy(ids["eU"]!)).bed_id).toBe(ids["A"]);
  });

  test("3. Aisha books Room C from 20 Oct while Muhammad is in it: both keep their place", async () => {
    const e = await enquiry("Aisha", "Male", "2026-10-20", "2026-12-31");
    ids["eA"] = e;
    // unpaid: a hold on Muhammad's bed, Muhammad untouched
    expect(
      (await rpc("place_stay", { p_enquiry: e, p_resident: null, p_bed: ids["C"] })).placed,
    ).toBe("later");
    let b = await bed(ids["C"]!);
    expect([b.resident_id, b.status, b.enquiry_id]).toEqual([ids["M"], "active", e]);
    // paid: the tenancy takes the bed, the hold goes, Muhammad still untouched
    ids["A_"] = await pay(e, "Aisha", "Male", "2026-10-20", "2026-12-31");
    b = await bed(ids["C"]!);
    expect([b.resident_id, b.status, b.enquiry_id]).toEqual([ids["M"], "active", null]);
    expect((await tenancy(e)).bed_id).toBe(ids["C"]);
  });

  test("6/7. Muhammad's extension: before 20 Oct allowed, into her dates refused", async () => {
    const before = await rpc("placement_conflict", {
      p_bed: ids["C"],
      p_enquiry: ids["eM"],
      p_resident: ids["M"],
      p_start: "2026-10-01",
      p_end: "2026-10-19",
      p_gender: "Male",
      p_whole: false,
    });
    expect(before).toBeNull();
    const into = await rpc("placement_conflict", {
      p_bed: ids["C"],
      p_enquiry: ids["eM"],
      p_resident: ids["M"],
      p_start: "2026-10-01",
      p_end: "2026-10-31",
      p_gender: "Male",
      p_whole: false,
    });
    expect(String(into)).toContain("Aisha");
  });

  test("8. moving Aisha before check-in keeps her tenancy; Muhammad is not touched", async () => {
    const t0 = await tenancy(ids["eA"]!);
    expect(
      (await rpc("place_stay", { p_enquiry: ids["eA"], p_resident: null, p_bed: ids["B1"] })).ok,
    ).toBe(true);
    const t1 = await tenancy(ids["eA"]!);
    expect(t1.id).toBe(t0.id);
    expect([t1.bed_id, t1.start_date, t1.end_date]).toEqual([
      ids["B1"],
      t0.start_date,
      t0.end_date,
    ]);
    const c = await bed(ids["C"]!);
    expect([c.resident_id, c.status]).toEqual([ids["M"], "active"]);
    const tens = await ok<any[]>(sb.from("tenancies").select("id").eq("enquiry_id", ids["eA"]));
    expect(tens.length).toBe(1);
    // and back, for the checkout below
    expect(
      (await rpc("place_stay", { p_enquiry: ids["eA"], p_resident: null, p_bed: ids["C"] })).ok,
    ).toBe(true);
    expect((await bed(ids["B1"]!)).status).toBe("vacant");
  });

  test("9. two admins, same bed, overlapping dates: exactly one wins", async () => {
    const e1 = await enquiry("Race1", "Male", "2027-02-01", "2027-06-30");
    const e2 = await enquiry("Race2", "Male", "2027-03-01", "2027-07-31");
    const [a, b] = await Promise.all([
      rpc("place_stay", { p_enquiry: e1, p_resident: null, p_bed: ids["B2"] }),
      rpc("place_stay", { p_enquiry: e2, p_resident: null, p_bed: ids["B2"] }),
    ]);
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
    expect([a, b].find((x) => !x.ok).error).toBe(
      "This room was just reserved. Choose another room.",
    );
    ids["eR"] = a.ok ? e1 : e2;
  });

  test("11. cancelling an unpaid hold removes only that hold", async () => {
    const { releaseBooking } = await import("../src/lib/booking-lifecycle");
    const e = await enquiry("Hold", "Male", "2027-01-01", "2027-03-31");
    // Room C's next free dates after Aisha
    expect((await rpc("place_stay", { p_enquiry: e, p_resident: null, p_bed: ids["C"] })).ok).toBe(
      true,
    );
    expect((await bed(ids["C"]!)).enquiry_id).toBe(e);
    expect((await releaseBooking(sb, e)).ok).toBe(true);
    const c = await bed(ids["C"]!);
    expect([c.resident_id, c.status, c.enquiry_id]).toEqual([ids["M"], "active", null]);
    expect((await tenancy(ids["eA"]!)).bed_id).toBe(ids["C"]);
  });

  test("4/10. Muhammad checks out: Aisha takes Room C as Booked, his papers keep Room C", async () => {
    const out = await rpc("release_after_checkout", { p_resident: ids["M"] });
    expect(out.ok).toBe(true);
    const c = await bed(ids["C"]!);
    expect([c.resident_id, c.status, c.tenancy_start, c.tenancy_end]).toEqual([
      ids["A_"],
      "booked",
      "2026-10-20",
      "2026-12-31",
    ]);
    expect((await tenancy(ids["eM"]!)).bed_id).toBe(ids["C"]);
    const { placementForResident } = await import("../src/lib/placement.server");
    const his = await placementForResident(sb, ids["M"]!);
    expect([his?.room?.letter, his?.via]).toEqual(["C", "tenancy"]);
    const hers = await placementForResident(sb, ids["A_"]!);
    expect([hers?.room?.letter, hers?.via]).toEqual(["C", "live"]);
  });

  test("5. Aisha checks in: Booked -> Active; refused before the bed is hers", async () => {
    // somebody booked into a bed another person still occupies cannot be activated
    const blocked = await rpc("activate_at_checkin", {
      p_resident: ids["U"] ?? "00000000-0000-0000-0000-000000000000",
    });
    expect(blocked.ok).toBe(false);
    expect((await rpc("activate_at_checkin", { p_resident: ids["A_"] })).ok).toBe(true);
    expect((await bed(ids["C"]!)).status).toBe("active");
  });

  test("12. a paid upcoming stay that ends (resident inactive) frees its dates, nobody else moves", async () => {
    const e = await enquiry("Later", "Male", "2027-01-15", "2027-05-31");
    expect(
      (await rpc("place_stay", { p_enquiry: e, p_resident: null, p_bed: ids["C"] })).placed,
    ).toBe("later");
    const r = await pay(e, "Later", "Male", "2027-01-15", "2027-05-31");
    await ok(sb.from("residents").update({ status: "Inactive" }).eq("id", r));
    const free = await rpc("placement_conflict", {
      p_bed: ids["C"],
      p_enquiry: null,
      p_resident: null,
      p_start: "2027-02-01",
      p_end: "2027-02-28",
      p_gender: "Male",
      p_whole: false,
    });
    expect(free).toBeNull();
    const c = await bed(ids["C"]!);
    expect([c.resident_id, c.status]).toEqual([ids["A_"], "active"]);
  });
});
