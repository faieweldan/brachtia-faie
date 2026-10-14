/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

/**
 * Credit notes on the account-credit ledger (14 Oct 2026,
 * 20261018100000_account_credit_notes.sql): credit goes onto what is still to
 * pay first, only the leftover becomes a note, the balance counts the note, two
 * clicks give one note, and a refund is kept once. test-bratchia only, on
 * made-up resident ids, removed afterwards. Run with:
 *
 *   RUN_DB_TESTS=1 bun --env-file=.env test tests/credit-notes.db.test.ts
 */
const TEST_PROJECT = "zyuadtrqcgocottxyzpk";
const url = process.env["SUPABASE_URL"] ?? "";
const run = process.env["RUN_DB_TESTS"] === "1" && url.includes(TEST_PROJECT);
const d = run ? describe : describe.skip;
const sb: any = run ? createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!) : null;
const tag = `ZZTEST-CN-${Date.now().toString(36)}`;
const residents: string[] = [];
const invoices: string[] = [];

function resident() {
  const id = crypto.randomUUID();
  residents.push(id);
  return id;
}

/** an open invoice of `total`, nothing paid; `scheduled` is rent not billed yet */
async function invoice(residentId: string, total: number, status = "issued") {
  const { data, error } = await sb
    .from("invoices")
    .insert({ resident_id: residentId, full_name: tag, total, status, invoice_type: "rental" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  invoices.push(data.id);
  return String(data.id);
}

const credit = () => import("../src/lib/account-credit.server");
const give = async (r: string, amount: number) =>
  (await credit()).addCredit(sb, r, [{ amount, reason: tag, kind: "rent" }]);

d("credit notes on the account-credit ledger (test-bratchia)", () => {
  afterAll(async () => {
    if (!sb) return;
    if (invoices.length) {
      await sb.from("receipts").delete().in("invoice_id", invoices);
      await sb.from("payments").delete().in("invoice_id", invoices);
      await sb.from("invoices").delete().in("id", invoices);
    }
    if (residents.length) {
      await sb.from("account_credit_notes").delete().in("resident_id", residents);
      await sb.from("account_credit_entries").delete().in("resident_id", residents);
      await sb.from("account_credit_imports").delete().in("resident_id", residents);
    }
  });

  test("the leftover is what no open invoice can take - rent not billed yet included", async () => {
    const r = resident();
    await give(r, 300);
    await invoice(r, 80, "scheduled");
    await invoice(r, 20);
    const o = await (await credit()).creditOutlook(sb, r);
    expect(o.balance).toBe(300);
    expect(o.leftover).toBe(200);
    // the screen's spread of the balance takes the same 100
    expect(o.plan.reduce((n, p) => n + p.credit, 0)).toBe(100);
  });

  test("a note is issued for the leftover only, and the balance counts it", async () => {
    const r = resident();
    await give(r, 250);
    await invoice(r, 50, "scheduled");
    const c = await credit();
    const note = await c.issueCreditNote(sb, r, "Staff");
    expect(note.amount).toBe(200);
    expect(note.number).toMatch(/^CN\/AC\/\d{5}$/);
    expect(await c.creditBalance(sb, r)).toMatchObject({ given: 250, noted: 200, balance: 50 });
    // nothing left over now: a second note is refused
    await expect(c.issueCreditNote(sb, r, "Staff")).rejects.toThrow("no credit left over");
    // the credit left still goes onto the rent, never more than is left
    expect((await c.creditOutlook(sb, r)).leftover).toBe(0);
  });

  test("two clicks at once give one note", async () => {
    const r = resident();
    await give(r, 120);
    const c = await credit();
    const both = await Promise.allSettled([c.issueCreditNote(sb, r, "A"), c.issueCreditNote(sb, r, "B")]);
    expect(both.filter((x) => x.status === "fulfilled").length).toBe(1);
    expect((await c.creditNotes(sb, r)).map((n) => n.amount)).toEqual([120]);
  });

  test("a note's refund is kept once, and Payables lists it as To pay then Paid", async () => {
    const r = resident();
    await give(r, 75);
    const c = await credit();
    const { number } = await c.issueCreditNote(sb, r, "Staff");
    expect(await c.creditResidents(sb)).toContain(r);
    const refund = { amount: 75, paidOn: "2026-10-14", method: "Bank Transfer", reference: tag, proofPath: "x", recordedBy: "Staff", recordedAt: new Date().toISOString() };
    await c.recordCreditNoteRefund(sb, r, number, refund);
    await expect(c.recordCreditNoteRefund(sb, r, number, refund)).rejects.toThrow("already recorded");
    const [n] = await c.creditNotes(sb, r);
    expect(n?.refund?.amount).toBe(75);
  });
});
