/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

/**
 * One placement system (Phase 2, 14 Oct 2026) - 20261014100000_one_placement.sql
 * and the code that uses it, on test-bratchia only, with a throwaway unit and
 * made-up people that are removed afterwards. Run with:
 *
 *   RUN_DB_TESTS=1 bun --env-file=.env test tests/one-placement.db.test.ts
 *
 * Skipped otherwise - and refused outright against any other database.
 * Each step is done the way the app does it: place_stay for every reservation
 * and move, the booking fee through confirm_paid_placement, Update Tenancy
 * through holdForChange and makeEffective, the unit editor through saveUnitWith.
 */
const TEST_PROJECT = "zyuadtrqcgocottxyzpk";
const url = process.env["SUPABASE_URL"] ?? "";
const run = process.env["RUN_DB_TESTS"] === "1" && url.includes(TEST_PROJECT);
const d = run ? describe : describe.skip;

const sb: any = run ? createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!) : null;
const tag = `ZZTEST-P2-${Date.now().toString(36)}`;
const made = { unit: "", enquiries: [] as string[], residents: [] as string[] };
const ids: Record<string, string> = {};

async function ok<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}
const rpc = (fn: string, args: Record<string, unknown>) => ok<any>(sb.rpc(fn, args));
const bed = (id: string) => ok<any>(sb.from("beds").select("*").eq("id", id).single());
const holdsOn = (bedId: string) =>
  ok<any[]>(sb.from("placement_holds").select("*").eq("bed_id", bedId));
const placementOf = async (residentId: string) =>
  ((await rpc("resident_placements", { p_residents: [residentId] })) as any[])[0];
const place = (
  enquiryId: string | null,
  residentId: string | null,
  bedId: string,
  extra: Record<string, unknown> = {},
) => rpc("place_stay", { p_enquiry: enquiryId, p_resident: residentId, p_bed: bedId, ...extra });

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

/** what residentFromBooking does at the booking fee: the resident and their tenancy, then the database converts the hold */
async function pay(enquiryId: string, name: string, start: string, end: string) {
  const r = await ok<any>(
    sb
      .from("residents")
      .insert({ full_name: `${tag} ${name}`, gender: "Male", enquiry_id: enquiryId })
      .select("id")
      .single(),
  );
  made.residents.push(r.id);
  await ok(
    sb.from("enquiries").update({ resident_id: r.id, status: "booked" }).eq("id", enquiryId),
  );
  await ok(
    sb.from("tenancies").insert({
      resident_id: r.id,
      enquiry_id: enquiryId,
      bed_id: null,
      start_date: start,
      end_date: end,
    }),
  );
  await rpc("confirm_paid_placement", { p_enquiry: enquiryId });
  return r.id as string;
}

/** a booking reserved, then paid - the whole booking flow */
async function book(name: string, bedId: string, start: string, end: string) {
  const e = await enquiry(name, start, end);
  expect((await place(e, null, bedId)).ok).toBe(true);
  return { enquiryId: e, residentId: await pay(e, name, start, end) };
}

d("one placement system (test-bratchia)", () => {
  let stale: any;

  beforeAll(async () => {
    const res = await ok<any>(sb.from("residences").select("id").limit(1).single());
    const u = await ok<any>(
      sb
        .from("units")
        .insert({ residence_id: res.id, code: tag, unit_no: tag, unit_type: "4-bedroom" })
        .select("id")
        .single(),
    );
    made.unit = u.id;
    // G: a room nobody is ever placed in, for the "old tab against a reservation" race
    const letters = ["A", "B", "C", "D", "E", "F", "G"];
    const rooms = await ok<any[]>(
      sb
        .from("rooms")
        .insert(
          letters.map((l, i) => ({
            unit_id: u.id,
            letter: l,
            occupancy: l === "B" ? "twin" : "single",
            sort_order: i,
          })),
        )
        .select("id, letter"),
    );
    const room = (l: string) => rooms.find((r) => r.letter === l).id;
    const beds = await ok<any[]>(
      sb
        .from("beds")
        .insert([
          ...letters
            .filter((l) => l !== "B")
            .map((l) => ({ room_id: room(l), label: "Single", sort_order: 0 })),
          { room_id: room("B"), label: "Twin 1", sort_order: 0 },
          { room_id: room("B"), label: "Twin 2", sort_order: 1 },
        ])
        .select("id, label, room_id"),
    );
    for (const l of letters.filter((x) => x !== "B"))
      ids[l] = beds.find((b) => b.room_id === room(l)).id;
    ids["B1"] = beds.find((b) => b.label === "Twin 1").id;

    // the unit as a page loaded it now - every bed empty - kept for the "old tab" test
    const { readUnit } = await import("../src/lib/homes.functions");
    stale = await readUnit(sb, u.id);

    // Muhammad lives in Room E (checked in) to 28 Feb 2027
    const m = await book("Muhammad", ids["E"]!, "2026-01-01", "2027-02-28");
    ids["M"] = m.residentId;
    expect((await rpc("activate_at_checkin", { p_resident: m.residentId })).ok).toBe(true);
  });

  afterAll(async () => {
    if (!run) return;
    await sb.from("tenancies").delete().in("resident_id", made.residents);
    await sb.from("residents").delete().in("id", made.residents); // holds and moves of theirs go with them
    await sb.from("units").delete().eq("id", made.unit); // rooms, beds and holds on them go with it
    await sb.from("enquiries").delete().in("id", made.enquiries);
  });

  test("1. empty bed: a booking's reservation is a dated hold, and the bed row is not touched", async () => {
    const e = await enquiry("Empty", "2027-01-01", "2027-06-30");
    ids["e1"] = e;
    expect((await place(e, null, ids["A"]!)).ok).toBe(true);
    const h = await holdsOn(ids["A"]!);
    expect(h.length).toBe(1);
    expect([h[0].start_date, h[0].end_date]).toEqual(["2027-01-01", "2027-06-30"]);
    expect((await bed(ids["A"]!)).status).toBe("vacant");
  });

  test("2. paid booking: the fee seats them on the bed, and the one lookup says so", async () => {
    const b = await book("Paid", ids["D"]!, "2027-01-01", "2027-06-30");
    ids["R2"] = b.residentId;
    ids["e2"] = b.enquiryId;
    const row = await bed(ids["D"]!);
    expect([row.resident_id, row.status]).toEqual([b.residentId, "booked"]);
    expect(await holdsOn(ids["D"]!)).toEqual([]);
    const p = await placementOf(b.residentId);
    expect([p.bed_id, p.via]).toEqual([ids["D"], "seated"]);
  });

  test("3. two overlapping reservations: the second is refused, saying who has it and when", async () => {
    const e = await enquiry("Overlap", "2027-03-01", "2027-04-30");
    const res = await place(e, null, ids["A"]!);
    expect(res.ok).toBe(false);
    expect(res.conflict).toBe(true);
    expect(String(res.detail)).toContain("Empty");
    expect(String(res.detail)).toContain("2027");
  });

  test("4. two admins reserving the same bed at the same moment: exactly one wins", async () => {
    const [a, b] = [
      await enquiry("Race A", "2028-01-01", "2028-03-31"),
      await enquiry("Race B", "2028-02-01", "2028-04-30"),
    ];
    const out = await Promise.all([place(a, null, ids["C"]!), place(b, null, ids["C"]!)]);
    expect(out.filter((o) => o.ok).length).toBe(1);
    expect(out.filter((o) => !o.ok && o.conflict).length).toBe(1);
    expect((await holdsOn(ids["C"]!)).length).toBe(1);
  });

  test("5. stays that do not overlap share one bed", async () => {
    const e = await enquiry("Later", "2027-07-01", "2027-12-31");
    ids["e5"] = e;
    expect((await place(e, null, ids["A"]!)).ok).toBe(true);
    expect((await holdsOn(ids["A"]!)).length).toBe(2);
  });

  test("6. the database itself refuses two overlapping holds on one bed, whatever writes them", async () => {
    const e = await enquiry("Sneaky", "2027-02-01", "2027-02-28");
    const { error } = await sb.from("placement_holds").insert({
      enquiry_id: e,
      bed_id: ids["A"],
      start_date: "2027-02-01",
      end_date: "2027-02-28",
    });
    expect(String(error?.message ?? "")).toContain("placement_holds_no_overlap");
  });

  test("7. before-start room change of a paid booking: the tenancy moves, the old room is kept as history", async () => {
    const res = await place(ids["e2"]!, null, ids["B1"]!);
    expect(res.ok).toBe(true);
    expect((await bed(ids["B1"]!)).resident_id).toBe(ids["R2"]);
    expect((await bed(ids["D"]!)).status).toBe("vacant");
    const t = await ok<any>(
      sb.from("tenancies").select("bed_id").eq("enquiry_id", ids["e2"]).single(),
    );
    expect(t.bed_id).toBe(ids["B1"]);
    const moves = await ok<any[]>(
      sb.from("placement_moves").select("from_bed_id, to_bed_id").eq("resident_id", ids["R2"]),
    );
    expect(moves).toEqual([{ from_bed_id: ids["D"], to_bed_id: ids["B1"] }]);
    expect((await placementOf(ids["R2"]!)).bed_id).toBe(ids["B1"]);
  });

  test("8. Update Tenancy: the new room is held with its dates, bookings see it, and the move keeps Occupied", async () => {
    const E = await import("../src/lib/tenancy-events.server");
    // Muhammad moves to Room F from 1 Nov 2026
    expect((await E.holdForChange(sb, ids["M"]!, ids["F"]!, "2026-11-01", "2027-02-28")).ok).toBe(
      true,
    );
    // a booking into those dates is refused, naming him; one before them is accepted
    const into = await place(await enquiry("Into", "2026-12-01", "2027-01-31"), null, ids["F"]!);
    expect(into.ok).toBe(false);
    expect(String(into.detail)).toContain("Muhammad");
    expect(
      (await place(await enquiry("Before", "2026-10-20", "2026-10-31"), null, ids["F"]!)).ok,
    ).toBe(true);
    // somebody has Room E booked after Muhammad - they take it when he moves
    const n = await book("Next", ids["E"]!, "2027-03-01", "2027-08-31");
    ids["N"] = n.residentId;

    const t = await ok<any>(sb.from("tenancies").select("id").eq("resident_id", ids["M"]).single());
    const ev: any = {
      eventId: "test",
      name: "Room change",
      date: "2026-11-01",
      periodEnd: "2027-02-28",
      tenancyId: t.id,
      rent: 0,
      rentBefore: 0,
      flags: { room: true, unit: false, occupancy: false, date: "none" },
      moveTo: { bedId: ids["F"], roomId: "", unitId: made.unit, occupancy: "single" },
      plan: {},
    };
    expect(await E.makeEffective(sb, ids["M"]!, ev)).toBe(true);
    expect(ev.waitingFor).toBeUndefined();

    const f = await bed(ids["F"]!);
    expect([f.resident_id, f.status]).toEqual([ids["M"], "active"]);
    expect((await bed(ids["E"]!)).resident_id).toBe(ids["N"]);
    expect(
      (await ok<any>(sb.from("tenancies").select("bed_id").eq("id", t.id).single())).bed_id,
    ).toBe(ids["F"]);
    expect((await holdsOn(ids["F"]!)).filter((h) => h.resident_id === ids["M"])).toEqual([]);
    const moves = await ok<any[]>(
      sb
        .from("placement_moves")
        .select("from_bed_id, to_bed_id, moved_on")
        .eq("resident_id", ids["M"]),
    );
    expect(moves).toEqual([{ from_bed_id: ids["E"], to_bed_id: ids["F"], moved_on: "2026-11-01" }]);
  });

  test("9. an old browser tab saving the unit cannot undo a reservation or remove a room somebody is in", async () => {
    const { saveUnitWith } = await import("../src/lib/homes.functions");
    // the tab loaded the unit before anybody was placed: every bed empty
    await saveUnitWith(sb, { unit: stale });
    expect((await bed(ids["F"]!)).resident_id).toBe(ids["M"]);
    expect((await bed(ids["B1"]!)).resident_id).toBe(ids["R2"]);
    expect((await holdsOn(ids["A"]!)).length).toBe(2);
    // and a tab that no longer lists Room F
    const withoutF = { ...stale, rooms: stale.rooms.filter((r: any) => r.letter !== "F") };
    await expect(saveUnitWith(sb, { unit: withoutF })).rejects.toThrow("cannot be removed");
    expect((await bed(ids["F"]!)).resident_id).toBe(ids["M"]);
  });

  test("10. releasing one future reservation leaves the other one, and Homes Release never touches a hold", async () => {
    expect((await rpc("release_hand_hold", { p_bed: ids["A"] })).released).toBe(false);
    expect((await holdsOn(ids["A"]!)).length).toBe(2);
    expect(await rpc("release_hold", { p_enquiry: ids["e1"], p_resident: null, p_bed: null })).toBe(
      1,
    );
    const left = await holdsOn(ids["A"]!);
    expect(left.map((h) => h.enquiry_id)).toEqual([ids["e5"]]);
  });

  test("11. current resident plus a future one on the same bed: neither overwrites the other", async () => {
    const p = await book("Future", ids["F"]!, "2027-03-01", "2027-08-31");
    ids["P"] = p.residentId;
    const f = await bed(ids["F"]!);
    expect([f.resident_id, f.status]).toEqual([ids["M"], "active"]);
    expect([(await placementOf(ids["M"]!)).via, (await placementOf(ids["P"]!)).via]).toEqual([
      "seated",
      "tenancy",
    ]);
    expect((await placementOf(ids["P"]!)).bed_id).toBe(ids["F"]);
    const claims = ((await rpc("placement_claims", { p_units: [made.unit] })) as any[]).filter(
      (c) => c.bed_id === ids["F"],
    );
    expect(claims.map((c) => c.source).sort()).toEqual(["hold", "resident", "tenancy"]);
  });

  test("12. the resident page, the documents, Homes and the unit inventory name the same room for everybody", async () => {
    const { readUnit } = await import("../src/lib/homes.functions");
    const { placementForResident } = await import("../src/lib/placement.server");
    const unit = await readUnit(sb, made.unit);
    const beds = unit.rooms.flatMap((r: any) => r.beds);
    for (const who of ["R2", "M", "N", "P"]) {
      const rid = ids[who]!;
      const official = (await placementOf(rid)).bed_id;
      const homes = beds.find(
        (b: any) => b.residentId === rid || b.upcoming?.some((u: any) => u.residentId === rid),
      );
      const docs = await placementForResident(sb, rid);
      expect([who, homes?.id, docs?.bed?.id]).toEqual([who, official, official]);
    }
    // occupancy as the inventory shows it: Muhammad in F now, the future stay after him
    const f = beds.find((b: any) => b.id === ids["F"]);
    expect(f.status).toBe("active");
    expect(f.upcoming.map((u: any) => u.status)).toEqual(["reserved", "booked"]);
  });

  test("13. a booking's new dates racing a new reservation on the same bed: exactly one wins", async () => {
    const { moveStayDates } = await import("../src/lib/booking-lifecycle");
    const x = await enquiry("Stretch", "2029-01-01", "2029-02-28");
    expect((await place(x, null, ids["C"]!)).ok).toBe(true);
    const y = await enquiry("Squeeze", "2029-04-01", "2029-05-31");
    const [moved, placed] = await Promise.all([
      moveStayDates(sb, x, "2029-01-01", "2029-06-30", "Male"),
      place(y, null, ids["C"]!),
    ]);
    expect([moved.ok, placed.ok].filter(Boolean).length).toBe(1);
    const holds = (await holdsOn(ids["C"]!)).filter((h) => String(h.start_date).startsWith("2029"));
    const overlap = holds.some((a) =>
      holds.some((b) => a.id !== b.id && a.start_date <= b.end_date && a.end_date >= b.start_date),
    );
    expect(overlap).toBe(false);
  });

  test("14. a paid stay's new dates racing a new reservation: exactly one wins, the tenancy never overlaps it", async () => {
    const { moveStayDates } = await import("../src/lib/booking-lifecycle");
    const z = await enquiry("Summer", "2027-08-01", "2027-09-30");
    const [moved, placed] = await Promise.all([
      moveStayDates(sb, ids["e2"]!, "2027-01-01", "2027-12-31", "Male"),
      place(z, null, ids["B1"]!),
    ]);
    expect([moved.ok, placed.ok].filter(Boolean).length).toBe(1);
    const t = await ok<any>(
      sb.from("tenancies").select("end_date").eq("enquiry_id", ids["e2"]).single(),
    );
    const h = (await holdsOn(ids["B1"]!)).find((x) => x.enquiry_id === z);
    if (h) expect(t.end_date < h.start_date).toBe(true);
    else expect(t.end_date).toBe("2027-12-31");
  });

  test("15. an old tab removing a room racing a reservation of it: the reservation is never deleted", async () => {
    const { readUnit, saveUnitWith } = await import("../src/lib/homes.functions");
    const now = await readUnit(sb, made.unit);
    const withoutG = { ...now, rooms: now.rooms.filter((r: any) => r.letter !== "G") };
    const w = await enquiry("Gamma", "2030-01-01", "2030-03-31");
    const [saved, placed] = await Promise.all([
      saveUnitWith(sb, { unit: withoutG }).then(
        () => true,
        () => false,
      ),
      place(w, null, ids["G"]!).catch(() => ({ ok: false })),
    ]);
    const roomG = await ok<any[]>(
      sb.from("rooms").select("id").eq("unit_id", made.unit).eq("letter", "G"),
    );
    const hold = await ok<any>(
      sb.from("placement_holds").select("id").eq("enquiry_id", w).maybeSingle(),
    );
    // one or the other - never a reservation that was made and then deleted with its room
    expect([saved, placed.ok].filter(Boolean).length).toBe(1);
    if (placed.ok) expect([roomG.length, !!hold]).toEqual([1, true]);
    else expect([roomG.length, hold]).toEqual([0, null]);
  });

  test("16. a hold belongs to exactly one booking or one resident, and a resident's always has dates", async () => {
    const e = await enquiry("Owner", "2031-01-01", "2031-01-31");
    const both = await sb.from("placement_holds").insert({
      enquiry_id: e,
      resident_id: ids["M"],
      bed_id: ids["D"],
      start_date: "2031-01-01",
      end_date: "2031-01-31",
    });
    expect(String(both.error?.message ?? "")).toContain("placement_holds_owner");
    const neither = await sb
      .from("placement_holds")
      .insert({ bed_id: ids["D"], start_date: "2031-02-01", end_date: "2031-02-28" });
    expect(String(neither.error?.message ?? "")).toContain("placement_holds_owner");
    const open = await sb.from("placement_holds").insert({
      resident_id: ids["M"],
      bed_id: ids["D"],
      start_date: "2031-03-01",
      end_date: null,
    });
    expect(String(open.error?.message ?? "")).toContain("placement_holds_resident_dates");
    const later = await place(null, ids["M"]!, ids["D"]!, { p_later: true, p_start: "2031-04-01" });
    expect([later.ok, later.error]).toEqual([
      false,
      "A room held for a change needs its start and end dates.",
    ]);
  });

  test("17. an extension taking effect is checked against the stay after it on the same bed", async () => {
    const t = await ok<any>(
      sb.from("tenancies").select("id, end_date").eq("resident_id", ids["M"]).single(),
    );
    const into = await rpc("extend_stay", {
      p_resident: ids["M"],
      p_tenancy: t.id,
      p_end: "2027-04-30",
    });
    expect(into.ok).toBe(false);
    expect(String(into.detail)).toContain("Future");
    expect(
      (await ok<any>(sb.from("tenancies").select("end_date").eq("id", t.id).single())).end_date,
    ).toBe(t.end_date);
  });

  test("18. the migration's own guards are all in place (it stops with an error otherwise)", async () => {
    expect(await rpc("placement_guard_report", {})).toEqual({
      no_overlap: true,
      owner_xor: true,
      resident_dates: true,
      overlapping_holds: 0,
    });
  });
});
