/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

/**
 * Cancelling an invoice against the database itself (16 Oct 2026): a payment
 * and a cancellation sent at once are two connections and two transactions,
 * and only a real database shows which waited for which. Whichever order they
 * land in, an invoice is never void with money on it, and an Update Tenancy
 * cancellation moves to credit exactly the cash paid - once. test-bratchia only,
 * with made-up invoices, removed afterwards. Needs:
 *   - 20261015100000_atomic_payments.sql and 20261016100000_atomic_invoice_void.sql on test-bratchia
 *   - SUPABASE_URL (test-bratchia) and SUPABASE_SERVICE_ROLE_KEY in .env
 * Run with:
 *
 *   RUN_DB_TESTS=1 bun --env-file=.env test tests/invoice-void.db.test.ts
 */
const TEST_PROJECT = "zyuadtrqcgocottxyzpk";
const url = process.env["SUPABASE_URL"] ?? "";
const run = process.env["RUN_DB_TESTS"] === "1" && url.includes(TEST_PROJECT);
const d = run ? describe : describe.skip;
const sb: any = run ? createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!) : null;
const tag = `ZZTEST-VOID-${Date.now().toString(36)}`;
const residents: string[] = [];
const invoices: string[] = [];
const enquiries: string[] = [];

async function ok<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}
function resident() {
  const id = crypto.randomUUID();
  residents.push(id);
  return id;
}
async function invoice(total: number, extra: Record<string, unknown> = {}) {
  const row = await ok<any>(
    sb
      .from("invoices")
      .insert({
        resident_id: resident(),
        full_name: tag,
        total,
        status: "issued",
        invoice_type: "charge",
        ...extra,
      })
      .select("id, number, resident_id")
      .single(),
  );
  invoices.push(row.id);
  return { id: String(row.id), residentId: String(row.resident_id), number: String(row.number) };
}
const pay = (invoiceId: string, amount: number) =>
  ok<any>(
    sb.rpc("record_invoice_payment", {
      p_invoice: invoiceId,
      p_amount: amount,
      p_paid_on: "2026-10-16",
      p_method: "Cash",
      p_recorded_by: tag,
    }),
  );
async function state(invoiceId: string) {
  const [i, p] = await Promise.all([
    ok<any>(sb.from("invoices").select("status, notes").eq("id", invoiceId).single()),
    ok<any[]>(sb.from("payments").select("amount, method").eq("invoice_id", invoiceId)),
  ]);
  return {
    status: i.status,
    notes: i.notes,
    payments: p.length,
    cash: p.filter((x) => x.method !== "Account credit").reduce((n, x) => n + Number(x.amount), 0),
  };
}
const cancelCredit = (residentId: string, invoiceId: string, eventId: string, fail = false) =>
  ok<any>(
    sb.rpc("void_invoice_to_credit", {
      p_resident: residentId,
      p_invoice: invoiceId,
      p_note: `Cancelled: ${tag} · Approved by Test · now`,
      p_what: "IP",
      p_tail: "room change cancelled",
      p_event_id: eventId,
      p_fail_before_credit: fail,
    }),
  );
const cancelCredits = (residentId: string) =>
  ok<any[]>(
    sb
      .from("account_credit_entries")
      .select("amount, reason, grant_key")
      .eq("resident_id", residentId)
      .eq("kind", "cancel"),
  );

d("cancelling an invoice, on test-bratchia", () => {
  beforeAll(async () => {
    const { error } = await sb.rpc("void_invoice_if_unpaid", { p_invoice: crypto.randomUUID() });
    if (error)
      throw new Error(
        `Run 20261016100000_atomic_invoice_void.sql on test-bratchia first: ${error.message}`,
      );
  });

  afterAll(async () => {
    if (!sb) return;
    if (invoices.length) {
      await sb.from("receipts").delete().in("invoice_id", invoices);
      await sb.from("payments").delete().in("invoice_id", invoices);
      await sb.from("invoices").delete().in("id", invoices);
    }
    if (enquiries.length) await sb.from("enquiries").delete().in("id", enquiries);
    if (residents.length) {
      await sb.from("account_credit_entries").delete().in("resident_id", residents);
      await sb.from("account_credit_imports").delete().in("resident_id", residents);
    }
  });

  test("a payment and Admin Cancel Invoice at once: never void with money on it", async () => {
    for (let i = 0; i < 5; i++) {
      const inv = await invoice(100);
      const [p, c] = await Promise.all([
        pay(inv.id, 40),
        ok<any>(sb.rpc("void_invoice_if_unpaid", { p_invoice: inv.id })),
      ]);
      const s = await state(inv.id);
      // exactly one of them won
      expect([p.ok, c.ok].filter(Boolean)).toHaveLength(1);
      expect(s.status === "void" ? s.payments : 0).toBe(0);
      if (c.ok) expect(p.error).toBe("invoice_void");
      else expect([c.error, s.status]).toEqual(["paid", "part_paid"]);
    }
  });

  test("a payment and a booking's release at once: never void with money on it", async () => {
    for (let i = 0; i < 5; i++) {
      const e = await ok<any>(
        sb
          .from("enquiries")
          .insert({ full_name: `${tag} b${i}`, status: "open" })
          .select("id")
          .single(),
      );
      enquiries.push(e.id);
      const inv = await invoice(500, { enquiry_id: e.id, invoice_type: "initial" });
      const [p, r] = await Promise.all([
        pay(inv.id, 500),
        ok<any>(sb.rpc("void_unpaid_booking_invoices", { p_enquiry: e.id })),
      ]);
      const s = await state(inv.id);
      expect([p.ok, r.ok].filter(Boolean)).toHaveLength(1);
      expect(s.status === "void" ? s.payments : 0).toBe(0);
      if (r.ok) expect(r.voided).toEqual([inv.number]);
    }
  });

  test("a payment and an Update Tenancy cancellation at once: the credit is the cash paid, once", async () => {
    for (let i = 0; i < 5; i++) {
      const inv = await invoice(300, { status: "scheduled", invoice_type: "initial" });
      const [p, c] = await Promise.all([
        pay(inv.id, 120),
        cancelCredit(inv.residentId, inv.id, `ev${i}-${tag}`),
      ]);
      const s = await state(inv.id);
      expect(s.status).toBe("void");
      const credits = await cancelCredits(inv.residentId);
      // payment first: counted and given back; cancellation first: the payment refused
      if (p.ok) {
        expect(Number(c.cash)).toBe(120);
        expect(credits.map((x) => Number(x.amount))).toEqual([120]);
      } else {
        expect([p.error, Number(c.cash), credits.length]).toEqual(["invoice_void", 0, 0]);
      }
      expect(s.cash).toBe(credits.reduce((n, x) => n + Number(x.amount), 0));
    }
  });

  test("a failure before the credit is given: neither the void nor the credit stays", async () => {
    const inv = await invoice(300, { status: "scheduled", invoice_type: "initial" });
    await pay(inv.id, 70);
    const { error } = await sb.rpc("void_invoice_to_credit", {
      p_resident: inv.residentId,
      p_invoice: inv.id,
      p_note: "n",
      p_what: "IP",
      p_tail: "t",
      p_event_id: "evF",
      p_fail_before_credit: true,
    });
    expect(error?.message).toContain("test_fail_before_credit");
    expect((await state(inv.id)).status).toBe("scheduled");
    expect(await cancelCredits(inv.residentId)).toEqual([]);
  });

  test("a cancellation run again, and twice at once: exactly one credit, the note written once", async () => {
    const inv = await invoice(300, { status: "scheduled", invoice_type: "initial" });
    await pay(inv.id, 90);
    const [a, b] = await Promise.all([
      cancelCredit(inv.residentId, inv.id, "evR"),
      cancelCredit(inv.residentId, inv.id, "evR"),
    ]);
    const c = await cancelCredit(inv.residentId, inv.id, "evR");
    expect([a.voided, b.voided].sort()).toEqual([false, true]);
    expect(c).toMatchObject({ voided: false, cash: 0 });
    const credits = await cancelCredits(inv.residentId);
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ amount: 90, grant_key: `cancel:evR:${inv.id}` });
    const s = await state(inv.id);
    expect(s.notes.match(/moved to account credit/g)).toHaveLength(1);
    expect(s.notes).toContain("RM 90.00 moved to account credit");
  });
});
