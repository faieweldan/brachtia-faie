/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

/**
 * Change Room Before Tenancy Start against the database itself
 * (applyRoomChange in src/lib/admin.functions.ts), on test-bratchia only, with a
 * throwaway unit and made-up bookings that are removed afterwards. Needs
 * 20261009100000_dated_placement.sql on the database. Run with:
 *
 *   RUN_DB_TESTS=1 bun --env-file=.env test tests/room-change.db.test.ts
 */
const TEST_PROJECT = "zyuadtrqcgocottxyzpk";
const url = process.env["SUPABASE_URL"] ?? "";
const run = process.env["RUN_DB_TESTS"] === "1" && url.includes(TEST_PROJECT);
const d = run ? describe : describe.skip;
const sb: any = run ? createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!) : null;
const tag = `ZZTEST-${Date.now().toString(36)}`;
const made = {
  unit: "",
  enquiries: [] as string[],
  residents: [] as string[],
  invoices: [] as string[],
};
const beds: Record<string, string> = {};
let property: any = null;

const START = "2026-12-01";
let STAFF0 = "";
const END = "2027-05-31";

async function ok<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}
const one = (q: any) => ok<any>(q.single());

async function linesFor(rent: number) {
  const { firstInvoiceLines } = await import("../src/lib/invoice-lines");
  return firstInvoiceLines({
    property,
    rent,
    addons: [],
    term: "long",
    moveIn: START,
    moveOut: END,
    frequency: "bimonthly" as any,
  })!;
}

/** a booking on `bed`, with its first invoice at `rent` and `paid` paid on it (a resident from the RM500) */
async function booking(bed: string, rent: number, paid: number, start = START) {
  const e = await one(
    sb
      .from("enquiries")
      .insert({
        full_name: `${tag} b${made.enquiries.length}`,
        gender: "Male",
        move_in: start,
        move_out: END,
        status: "open",
        assigned_staff: STAFF0,
        monthly_rent: rent,
        term: "long",
        payment_term: "bimonthly",
        quote_snapshot: { property },
      })
      .select("id"),
  );
  made.enquiries.push(e.id);
  const placed = await ok<any>(
    sb.rpc("place_stay", { p_enquiry: e.id, p_resident: null, p_bed: bed }),
  );
  if (!placed.ok) throw new Error(placed.error);
  const items = await linesFor(rent);
  const total = items.reduce((n, l) => n + l.amount, 0);
  const inv = await one(
    sb
      .from("invoices")
      .insert({
        number: `${tag}-${made.invoices.length}`,
        enquiry_id: e.id,
        invoice_type: "initial",
        status: paid >= total ? "paid" : paid > 0 ? "part_paid" : "issued",
        total,
        monthly_rent: rent,
        tenancy_start: start,
        tenancy_end: END,
        payment_frequency: "bimonthly",
      })
      .select("id, number"),
  );
  made.invoices.push(inv.id);
  await ok(
    sb.from("invoice_items").insert(
      items.map((l, i) => ({
        invoice_id: inv.id,
        label: l.label,
        kind: l.kind,
        amount: l.amount,
        quantity: 1,
        sort_order: i,
      })),
    ),
  );
  let resident: string | null = null;
  if (paid > 0 && paid < 500) {
    // a part of the fee: the payment is recorded against a resident record, no tenancy yet
    const r = await one(
      sb
        .from("residents")
        .insert({ full_name: `${tag} p${made.residents.length}`, gender: "Male" })
        .select("id"),
    );
    resident = r.id;
    made.residents.push(r.id);
  }
  if (paid >= 500) {
    const r = await one(
      sb
        .from("residents")
        .insert({ full_name: `${tag} r${made.residents.length}`, gender: "Male", enquiry_id: e.id })
        .select("id"),
    );
    resident = r.id;
    made.residents.push(r.id);
    await ok(sb.from("enquiries").update({ resident_id: r.id, status: "booked" }).eq("id", e.id));
    await ok(
      sb.from("beds").update({ resident_id: r.id, status: "booked", hold_for: null }).eq("id", bed),
    );
    await ok(
      sb.from("tenancies").insert({
        resident_id: r.id,
        enquiry_id: e.id,
        bed_id: bed,
        start_date: start,
        end_date: END,
      }),
    );
    await ok(sb.from("invoices").update({ resident_id: r.id }).eq("id", inv.id));
    // paid: the hold became the tenancy (as confirm_paid_placement does)
    await ok(sb.from("placement_holds").delete().eq("enquiry_id", e.id));
  }
  if (paid > 0) {
    await ok(
      sb.from("payments").insert({
        invoice_id: inv.id,
        enquiry_id: e.id,
        resident_id: resident,
        amount: paid,
        paid_on: "2026-10-01",
        method: "Bank Transfer",
        reference: "",
        proof_path: "",
      }),
    );
  }
  return {
    enquiry: e.id as string,
    invoice: inv.id as string,
    number: inv.number as string,
    total,
    resident,
  };
}

async function change(enquiryId: string, bedId: string, newRent: number) {
  const { applyRoomChange } = await import("../src/lib/admin.functions");
  return applyRoomChange(sb, {
    enquiryId,
    bedId,
    newRent,
    approvedBy: (await import("../src/data/form-options")).STAFF[0]!,
    reason: "Resident requested another room",
    fromLabel: "old",
    toLabel: "new",
  });
}

const liveFor = async (enquiryId: string) =>
  ok<any[]>(
    sb
      .from("invoices")
      .select("id, total, status, invoice_type")
      .eq("enquiry_id", enquiryId)
      .not("status", "in", "(void,scheduled)"),
  );
const paymentsOn = async (invoiceId: string) =>
  ok<any[]>(sb.from("payments").select("id, amount").eq("invoice_id", invoiceId));
const versions = async (invoiceId: string) =>
  ok<any[]>(sb.from("invoice_versions").select("version").eq("root_invoice_id", invoiceId));

d("change room before the tenancy starts (test-bratchia)", () => {
  beforeAll(async () => {
    const e = await one(
      sb.from("enquiries").select("quote_snapshot").not("quote_snapshot", "is", null).limit(1),
    );
    property = e.quote_snapshot.property;
    STAFF0 = (await import("../src/data/form-options")).STAFF[0]!;
    const res = await one(sb.from("residences").select("id").limit(1));
    const u = await one(
      sb
        .from("units")
        .insert({ residence_id: res.id, code: tag, unit_no: tag, unit_type: "3-bedroom" })
        .select("id"),
    );
    made.unit = u.id;
    const letters = "ABCDEFGHIJKLMNOPQR".split("");
    const rooms = await ok<any[]>(
      sb
        .from("rooms")
        .insert(
          letters.map((l, i) => ({ unit_id: u.id, letter: l, occupancy: "single", sort_order: i })),
        )
        .select("id, letter"),
    );
    const made_ = await ok<any[]>(
      sb
        .from("beds")
        .insert(rooms.map((r) => ({ room_id: r.id, label: "Single", sort_order: 0 })))
        .select("id, room_id"),
    );
    for (const r of rooms) beds[r.letter] = made_.find((b) => b.room_id === r.id).id;
  });

  afterAll(async () => {
    if (!run) return;
    const { data: ips } = await sb.from("invoices").select("id").in("enquiry_id", made.enquiries);
    const all = [...new Set([...made.invoices, ...((ips ?? []) as any[]).map((i) => i.id)])];
    await sb.from("payments").delete().in("invoice_id", all);
    await sb.from("invoice_items").delete().in("invoice_id", all);
    await sb.from("invoice_versions").delete().in("root_invoice_id", all);
    await sb.from("invoices").delete().in("id", all);
    const { data: ags } = await sb
      .from("tenancy_agreements")
      .select("id")
      .in("resident_id", made.residents);
    const agIds = ((ags ?? []) as any[]).map((a) => a.id);
    if (agIds.length) {
      await sb.from("agreement_documents").delete().in("agreement_id", agIds);
      await sb.from("tenancy_agreements").delete().in("id", agIds);
    }
    await sb
      .from("rental_schedules")
      .delete()
      .in(
        "tenancy_id",
        ((await sb.from("tenancies").select("id").in("enquiry_id", made.enquiries)).data ?? []).map(
          (t: any) => t.id,
        ),
      );
    await sb.from("placement_holds").delete().in("enquiry_id", made.enquiries);
    await sb.from("tenancies").delete().in("enquiry_id", made.enquiries);
    await sb.from("residents").delete().in("id", made.residents);
    await sb.from("units").delete().eq("id", made.unit);
    await sb.from("booking_events").delete().in("enquiry_id", made.enquiries);
    await sb.from("enquiries").delete().in("id", made.enquiries);
    // account credit is kept as files beside the documents
    await sb.storage
      .from("resident-documents")
      .remove(made.residents.map((r) => `account-credit/${r}.json`));
    const { data: idx } = await sb.storage
      .from("resident-documents")
      .download("account-credit/index.json");
    if (idx) {
      const list = (JSON.parse(await idx.text()) as string[]).filter(
        (r) => !made.residents.includes(r),
      );
      await sb.storage
        .from("resident-documents")
        .upload(
          "account-credit/index.json",
          new Blob([JSON.stringify(list)], { type: "application/json" }),
          { upsert: true },
        );
    }
  }, 60000);

  test("same price: same invoice, a new version, payments and balance unchanged", async () => {
    const b = await booking(beds["A"]!, 650, 500);
    const v0 = (await versions(b.invoice)).length;
    const res = await change(b.enquiry, beds["B"]!, 650);
    expect(res.ok && res.kind).toBe("same");
    const live = await liveFor(b.enquiry);
    expect(live.map((i) => [i.id, Number(i.total)])).toEqual([[b.invoice, b.total]]);
    expect((await versions(b.invoice)).length).toBe(v0 + 1);
    // the Room line names the unit and room, never the room type
    const inv = await one(sb.from("invoices").select("room_name").eq("id", b.invoice));
    expect(String(inv.room_name)).toMatch(/^Unit .+ · Room B$/);
    expect((await paymentsOn(b.invoice)).length).toBe(1);
    expect(
      (await one(sb.from("tenancies").select("bed_id").eq("enquiry_id", b.enquiry))).bed_id,
    ).toBe(beds["B"]);
  }, 60000);

  test("dearer, part of the booking fee paid: the same invoice is revised", async () => {
    const b = await booking(beds["C"]!, 650, 250);
    const res = await change(b.enquiry, beds["D"]!, 700);
    expect(res.ok && res.kind).toBe("revise");
    const live = await liveFor(b.enquiry);
    expect(live.length).toBe(1);
    expect(live[0].id).toBe(b.invoice);
    expect(Number(live[0].total)).toBeGreaterThan(b.total);
    expect(live[0].status).toBe("part_paid");
    expect((await paymentsOn(b.invoice)).length).toBe(1);
  }, 60000);

  test("dearer, more than the fee but not all paid: revised, outstanding = new total - paid", async () => {
    const b = await booking(beds["E"]!, 650, 800);
    const res: any = await change(b.enquiry, beds["F"]!, 700);
    expect(res.kind).toBe("revise");
    const inv = await one(sb.from("invoices").select("total").eq("id", b.invoice));
    expect(res.outstanding).toBeCloseTo(Number(inv.total) - 800, 2);
  }, 60000);

  test("dearer, fully paid: the paid invoice stays; an Initial Payment invoice for the difference only", async () => {
    const b = await booking(beds["G"]!, 650, 0);
    const paidAll = b.total;
    // paid in full (made a resident first, as the fee would)
    const r = await one(
      sb
        .from("residents")
        .insert({ full_name: `${tag} full`, gender: "Male", enquiry_id: b.enquiry })
        .select("id"),
    );
    made.residents.push(r.id);
    await ok(
      sb.from("enquiries").update({ resident_id: r.id, status: "booked" }).eq("id", b.enquiry),
    );
    await ok(sb.from("beds").update({ resident_id: r.id, status: "booked" }).eq("id", beds["G"]));
    await ok(
      sb.from("tenancies").insert({
        resident_id: r.id,
        enquiry_id: b.enquiry,
        bed_id: beds["G"],
        start_date: START,
        end_date: END,
      }),
    );
    await ok(sb.from("invoices").update({ resident_id: r.id, status: "paid" }).eq("id", b.invoice));
    await ok(sb.from("placement_holds").delete().eq("enquiry_id", b.enquiry));
    await ok(
      sb.from("payments").insert({
        invoice_id: b.invoice,
        enquiry_id: b.enquiry,
        resident_id: r.id,
        amount: paidAll,
        paid_on: "2026-10-01",
        method: "Bank Transfer",
        reference: "",
        proof_path: "",
      }),
    );

    const res: any = await change(b.enquiry, beds["H"]!, 700);
    expect(res.kind).toBe("ip");
    const orig = await one(sb.from("invoices").select("status, total").eq("id", b.invoice));
    expect([orig.status, Number(orig.total)]).toEqual(["paid", b.total]);
    const live = await liveFor(b.enquiry);
    const ip = live.find((i) => i.id !== b.invoice);
    expect(ip?.invoice_type).toBe("initial");
    expect(Number(ip?.total)).toBeCloseTo(res.ipAmount, 2);
    // receivables: the paid invoice and the difference, nothing counted twice
    expect(live.length).toBe(2);
    expect((await paymentsOn(b.invoice)).length).toBe(1);
  }, 60000);

  test("up then back down, difference paid: the paid difference comes back as credit", async () => {
    // G -> H raised an Initial Payment invoice for the difference; pay it, then move back
    const b = (await one(sb.from("tenancies").select("enquiry_id, resident_id").eq("bed_id", beds["H"]!))) as any;
    const { data: ips } = await sb.from("invoices").select("id, total, enquiry_id").eq("enquiry_id", b.enquiry_id).order("created_at", { ascending: true });
    const ip = (ips as any[])[1];
    await ok(sb.from("payments").insert({ invoice_id: ip.id, enquiry_id: b.enquiry_id, resident_id: b.resident_id, amount: ip.total, paid_on: "2026-10-01", method: "Bank Transfer", reference: "", proof_path: "" }));
    await ok(sb.from("invoices").update({ status: "paid" }).eq("id", ip.id));
    const res: any = await change(b.enquiry_id, beds["G"]!, 650);
    expect(res.kind).toBe("credit");
    expect(res.credit).toBeCloseTo(Number(ip.total), 2);
  }, 60000);

  test("cheaper, not fully paid: revised down", async () => {
    const b = await booking(beds["I"]!, 700, 500);
    const res: any = await change(b.enquiry, beds["J"]!, 650);
    expect(res.kind).toBe("revise");
    expect(
      Number((await one(sb.from("invoices").select("total").eq("id", b.invoice))).total),
    ).toBeLessThan(b.total);
  }, 60000);

  test("cheaper, fully paid: the paid invoice stays; the difference is account credit", async () => {
    const b = await booking(beds["K"]!, 700, 0);
    const r = await one(
      sb
        .from("residents")
        .insert({ full_name: `${tag} cheap`, gender: "Male", enquiry_id: b.enquiry })
        .select("id"),
    );
    made.residents.push(r.id);
    await ok(
      sb.from("enquiries").update({ resident_id: r.id, status: "booked" }).eq("id", b.enquiry),
    );
    await ok(sb.from("beds").update({ resident_id: r.id, status: "booked" }).eq("id", beds["K"]));
    await ok(
      sb.from("tenancies").insert({
        resident_id: r.id,
        enquiry_id: b.enquiry,
        bed_id: beds["K"],
        start_date: START,
        end_date: END,
      }),
    );
    await ok(sb.from("invoices").update({ resident_id: r.id, status: "paid" }).eq("id", b.invoice));
    await ok(sb.from("placement_holds").delete().eq("enquiry_id", b.enquiry));
    await ok(
      sb.from("payments").insert({
        invoice_id: b.invoice,
        enquiry_id: b.enquiry,
        resident_id: r.id,
        amount: b.total,
        paid_on: "2026-10-01",
        method: "Bank Transfer",
        reference: "",
        proof_path: "",
      }),
    );

    const res: any = await change(b.enquiry, beds["L"]!, 650);
    expect(res.kind).toBe("credit");
    const { creditEntries } = await import("../src/lib/account-credit.server");
    const given = (await creditEntries(sb, r.id)).reduce((n, c) => n + c.amount, 0);
    expect(given).toBeCloseTo(res.credit, 2);
    expect((await one(sb.from("invoices").select("status").eq("id", b.invoice))).status).toBe(
      "paid",
    );
  }, 60000);

  async function pack(resident: string, status: string) {
    const ag = await one(
      sb
        .from("tenancy_agreements")
        .insert({ resident_id: resident, agreement_no: `${tag}-${status}`, kind: "initial" })
        .select("id"),
    );
    await ok(
      sb.from("agreement_documents").insert({
        agreement_id: ag.id,
        doc_type: "agreement",
        version: 1,
        status,
        period_start: START,
        period_end: END,
        merge_values: {},
      }),
    );
    return ag.id as string;
  }

  test("a TA nothing has happened to is reset, to be made again for the new room", async () => {
    const b = await booking(beds["M"]!, 650, 500);
    const ag = await pack(b.resident!, "generated");
    const res: any = await change(b.enquiry, beds["N"]!, 650);
    expect(res.ta).toBe("reset");
    expect((await ok<any[]>(sb.from("tenancy_agreements").select("id").eq("id", ag))).length).toBe(
      0,
    );
  }, 60000);

  test("a signed TA is kept, never overwritten", async () => {
    const b = await booking(beds["O"]!, 650, 500);
    const ag = await pack(b.resident!, "signed");
    const res: any = await change(b.enquiry, beds["P"]!, 650);
    expect(res.ta).toBe("kept");
    const docs = await ok<any[]>(
      sb.from("agreement_documents").select("status").eq("agreement_id", ag),
    );
    expect(docs.map((x) => x.status)).toEqual(["signed"]);
  }, 60000);

  test("a room someone else has for overlapping dates is refused", async () => {
    const a = await booking(beds["Q"]!, 650, 0);
    await booking(beds["R"]!, 650, 0);
    const res: any = await change(a.enquiry, beds["R"]!, 650);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("This room is not free for these dates.");
  }, 60000);

  test("on or after the tenancy start: refused, Update Tenancy instead", async () => {
    const { klToday } = await import("../src/lib/kl-date");
    const free = beds["A"]!; // left by the first test's move
    const b = await booking(free, 650, 0, klToday());
    await expect(change(b.enquiry, beds["C"]!, 650)).rejects.toThrow(/Update Tenancy/);
  });
});
