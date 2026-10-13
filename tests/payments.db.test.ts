/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

/**
 * Payments and account credit against the database itself (15 Oct 2026): the
 * locking, the rollback and the keys of 20261015100000_atomic_payments.sql can
 * only be proved on a real database - two requests here are two connections and
 * two transactions. test-bratchia only, with made-up invoices on a made-up
 * resident id, removed afterwards. Needs:
 *   - 20261015100000_atomic_payments.sql run on test-bratchia
 *   - SUPABASE_URL (test-bratchia) and SUPABASE_SERVICE_ROLE_KEY in .env
 * Run with:
 *
 *   RUN_DB_TESTS=1 bun --env-file=.env test tests/payments.db.test.ts
 */
const TEST_PROJECT = "zyuadtrqcgocottxyzpk";
const url = process.env["SUPABASE_URL"] ?? "";
const run = process.env["RUN_DB_TESTS"] === "1" && url.includes(TEST_PROJECT);
const d = run ? describe : describe.skip;
const sb: any = run ? createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!) : null;
const tag = `ZZTEST-PAY-${Date.now().toString(36)}`;
const residents: string[] = [];
const invoices: string[] = [];

async function ok<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

/** a made-up resident id - nothing else points at it */
function resident() {
  const id = crypto.randomUUID();
  residents.push(id);
  return id;
}

/** an issued invoice of `total` on `residentId` */
async function invoice(
  total: number,
  residentId = resident(),
  extra: Record<string, unknown> = {},
) {
  const row = await ok<any>(
    sb
      .from("invoices")
      .insert({
        resident_id: residentId,
        full_name: tag,
        total,
        status: "issued",
        invoice_type: "charge",
        ...extra,
      })
      .select("id, number")
      .single(),
  );
  invoices.push(row.id);
  return { id: String(row.id), residentId };
}

const pay = (invoiceId: string, amount: number, o: Record<string, unknown> = {}) =>
  ok<any>(
    sb.rpc("record_invoice_payment", {
      p_invoice: invoiceId,
      p_amount: amount,
      p_paid_on: "2026-10-15",
      p_method: "Cash",
      p_recorded_by: tag,
      ...o,
    }),
  );

async function moneyOn(invoiceId: string) {
  const [p, r, i] = await Promise.all([
    ok<any[]>(sb.from("payments").select("id, amount, method").eq("invoice_id", invoiceId)),
    ok<any[]>(
      sb
        .from("receipts")
        .select("payment_id, balance_after, paid_to_date")
        .eq("invoice_id", invoiceId),
    ),
    ok<any>(sb.from("invoices").select("status").eq("id", invoiceId).single()),
  ]);
  return {
    payments: p,
    receipts: r,
    status: i.status,
    paid: p.reduce((n, x) => n + Number(x.amount), 0),
  };
}

const grant = (residentId: string, entries: Record<string, unknown>[]) =>
  ok<number>(sb.rpc("grant_account_credit", { p_resident: residentId, p_entries: entries }));
const position = (residentId: string) =>
  ok<any>(sb.rpc("account_credit_position", { p_resident: residentId }));
const applyCredit = (residentId: string, o: Record<string, unknown> = {}) =>
  ok<any[]>(
    sb.rpc("apply_account_credit", { p_resident: residentId, p_paid_on: "2026-10-15", ...o }),
  );

d("payments and account credit, on test-bratchia", () => {
  beforeAll(async () => {
    // the migration is in: its one-payment step answers
    const { error } = await sb.rpc("account_credit_position", { p_resident: crypto.randomUUID() });
    if (error)
      throw new Error(
        `Run 20261015100000_atomic_payments.sql on test-bratchia first: ${error.message}`,
      );
  });

  afterAll(async () => {
    if (!sb) return;
    if (invoices.length) {
      await sb.from("receipts").delete().in("invoice_id", invoices);
      await sb.from("payments").delete().in("invoice_id", invoices);
      await sb.from("invoices").delete().in("id", invoices);
    }
    if (residents.length) {
      await sb.from("account_credit_entries").delete().in("resident_id", residents);
      await sb.from("account_credit_imports").delete().in("resident_id", residents);
    }
  });

  test("1. zero, negative, NaN and infinite amounts are refused, and nothing is written", async () => {
    const inv = await invoice(100);
    for (const bad of [0, -5, "NaN", "Infinity", "-Infinity", 0.004])
      expect((await pay(inv.id, bad as any)).error).toBe("invalid_amount");
    // and a payment row written by any other path is refused by the table itself
    const { error } = await sb
      .from("payments")
      .insert({ invoice_id: inv.id, amount: 0, method: "Cash" });
    expect(error?.message).toContain("invalid_amount");
    expect(await moneyOn(inv.id)).toMatchObject({ payments: [], receipts: [], status: "issued" });
  });

  test("2. a partial payment: one payment, one receipt, part paid", async () => {
    const inv = await invoice(1000);
    const r = await pay(inv.id, 400);
    expect(r).toMatchObject({
      ok: true,
      replayed: false,
      balance: 600,
      paid_to_date: 400,
      settled: false,
    });
    const m = await moneyOn(inv.id);
    expect([m.payments.length, m.receipts.length, m.status]).toEqual([1, 1, "part_paid"]);
    expect(m.receipts[0]).toMatchObject({
      payment_id: r.payment.id,
      balance_after: 600,
      paid_to_date: 400,
    });
  });

  test("3. a full payment: one payment, one receipt, paid", async () => {
    const inv = await invoice(250);
    const r = await pay(inv.id, 250);
    expect(r).toMatchObject({ ok: true, balance: 0, settled: true });
    const m = await moneyOn(inv.id);
    expect([m.payments.length, m.receipts.length, m.status]).toEqual([1, 1, "paid"]);
  });

  test("4. a failure while the receipt is made leaves no payment and no status change", async () => {
    const inv = await invoice(300);
    const { error } = await sb.rpc("record_invoice_payment", {
      p_invoice: inv.id,
      p_amount: 100,
      p_paid_on: "2026-10-15",
      p_method: "Cash",
      p_fail_before_receipt: true,
    });
    expect(error?.message).toContain("test_fail_before_receipt");
    expect(await moneyOn(inv.id)).toMatchObject({ payments: [], receipts: [], status: "issued" });
  });

  test("5. the same request key, sent again and twice at once, saves one payment", async () => {
    const inv = await invoice(500);
    const key = `${tag}-k5`;
    const [a, b] = await Promise.all([
      pay(inv.id, 200, { p_request_key: key }),
      pay(inv.id, 200, { p_request_key: key }),
    ]);
    const c = await pay(inv.id, 200, { p_request_key: key });
    expect([a.ok, b.ok, c.ok]).toEqual([true, true, true]);
    expect(new Set([a.payment.id, b.payment.id, c.payment.id]).size).toBe(1);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
    expect(c.replayed).toBe(true);
    const m = await moneyOn(inv.id);
    expect([m.payments.length, m.receipts.length, m.paid]).toEqual([1, 1, 200]);
    // the key used for another amount is refused, not saved
    expect((await pay(inv.id, 300, { p_request_key: key })).error).toBe("request_key_reused");
  });

  test("6. two payments at once: both saved, the balance is right", async () => {
    const inv = await invoice(1000);
    const [a, b] = await Promise.all([pay(inv.id, 300), pay(inv.id, 450)]);
    const m = await moneyOn(inv.id);
    expect([m.payments.length, m.receipts.length, m.paid, m.status]).toEqual([
      2,
      2,
      750,
      "part_paid",
    ]);
    // the second to be saved counts the first - neither read a stale total
    const totals = [Number(a.paid_to_date), Number(b.paid_to_date)].sort((x, y) => x - y);
    expect(totals[1]).toBe(750);
    expect([300, 450]).toContain(totals[0]!);
  });

  test("7. credit used by two requests at once is spent once", async () => {
    const who = resident();
    const one = await invoice(300, who);
    const two = await invoice(300, who);
    await grant(who, [{ amount: 300, reason: tag, kind: "rent", key: `${tag}-g7` }]);
    const [a, b] = await Promise.all([applyCredit(who), applyCredit(who)]);
    const used = [...a, ...b].reduce((n, u) => n + Number(u.amount), 0);
    expect(used).toBe(300);
    const paid = (await moneyOn(one.id)).paid + (await moneyOn(two.id)).paid;
    expect(paid).toBe(300);
    expect(await position(who)).toMatchObject({ given: 300, used: 300, balance: 0 });
  });

  test("8. cash and credit at once: credit never pays past what is owed", async () => {
    const who = resident();
    const inv = await invoice(100, who);
    await grant(who, [{ amount: 100, reason: tag, kind: "rent", key: `${tag}-g8` }]);
    await Promise.all([pay(inv.id, 60), applyCredit(who)]);
    const receipts = await ok<any[]>(
      sb.from("receipts").select("balance_after, payments!inner(method)").eq("invoice_id", inv.id),
    );
    const credit = receipts.find((r) => r.payments.method === "Account credit");
    // credit first: it paid 100 and cash came after (kept as before: admin may overpay);
    // cash first: credit paid the 40 left. Never credit counted against a stale balance
    if (credit) expect(Number(credit.balance_after)).toBeGreaterThanOrEqual(0);
    const m = await moneyOn(inv.id);
    expect(m.paid === 100 || m.paid === 160).toBe(true);
    expect(m.status).toBe("paid");
  });

  test("9. the same event's credit, given twice (and twice at once), is given once", async () => {
    const who = resident();
    const entry = {
      amount: 120,
      reason: tag,
      kind: "deposit",
      depositKey: "security",
      eventId: "ev9",
      key: "event:ev9-" + tag + ":deposit:security",
    };
    const [a, b] = await Promise.all([grant(who, [entry]), grant(who, [entry])]);
    const c = await grant(who, [entry]);
    expect(a + b + c).toBe(1);
    expect(await position(who)).toMatchObject({ given: 120, balance: 120 });
  });

  test("10. a reversal is kept in the history", async () => {
    const who = resident();
    await grant(who, [
      { amount: 80, reason: tag, kind: "rent", eventId: "ev10", key: `event:ev10-${tag}:rent:` },
    ]);
    expect(
      await ok<number>(
        sb.rpc("reverse_account_credit", {
          p_resident: who,
          p_event_ids: ["ev10"],
          p_reason: "cancelled",
        }),
      ),
    ).toBe(1);
    const rows = await ok<any[]>(
      sb.from("account_credit_entries").select("*").eq("resident_id", who),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 80, reversed_reason: "cancelled" });
    expect(rows[0].reversed_at).toBeTruthy();
    expect(await position(who)).toMatchObject({ given: 0, balance: 0 });
  });

  test("11. voiding an invoice gives back the credit used on it", async () => {
    const who = resident();
    const inv = await invoice(50, who);
    await grant(who, [{ amount: 50, reason: tag, kind: "rent", key: `${tag}-g11` }]);
    expect(await applyCredit(who)).toHaveLength(1);
    expect(await position(who)).toMatchObject({ balance: 0 });
    await ok(sb.from("invoices").update({ status: "void" }).eq("id", inv.id));
    expect(await position(who)).toMatchObject({ given: 50, used: 0, balance: 50 });
  });

  test("12. the old Storage credit is brought over once, however often and however many at once", async () => {
    const who = resident();
    const legacy = [
      {
        id: "aaaa1111",
        at: "2026-10-08T01:00:00.000Z",
        amount: 150,
        reason: "Cheaper room",
        kind: "rent",
        eventId: "evL1",
      } as Record<string, unknown>,
      {
        id: "bbbb2222",
        at: "2026-10-09T01:00:00.000Z",
        amount: 40,
        reason: "Utility deposit reduced",
        kind: "deposit",
        depositKey: "utility",
        depositLabel: "Utility deposit",
        eventId: "evL2",
        reversedAt: "2026-10-10T01:00:00.000Z",
        reversedReason: "Room change cancelled",
      },
    ];
    const imp = () =>
      ok<any>(sb.rpc("import_legacy_account_credit", { p_resident: who, p_entries: legacy }));
    const [a, b] = await Promise.all([imp(), imp()]);
    const c = await imp();
    expect([a.imported, b.imported].sort()).toEqual([false, true]);
    expect(c.imported).toBe(false);
    const rows = await ok<any[]>(
      sb.from("account_credit_entries").select("*").eq("resident_id", who).order("created_at"),
    );
    expect(rows.map((r) => [Number(r.amount), r.kind, r.source, !!r.reversed_at])).toEqual([
      [150, "rent", "legacy_json", false],
      [40, "deposit", "legacy_json", true],
    ]);
    expect(rows[1]).toMatchObject({
      deposit_key: "utility",
      deposit_label: "Utility deposit",
      reversed_reason: "Room change cancelled",
    });
    // the same event's credit given again after the move is not given twice
    expect(
      await grant(who, [{ amount: 150, reason: "again", kind: "rent", key: "event:evL1:rent:" }]),
    ).toBe(0);
    expect(await position(who)).toMatchObject({ given: 150, balance: 150 });
  });

  test("an Update Tenancy IP not billed yet takes credit and stays scheduled; rent not billed refuses money", async () => {
    const who = resident();
    const ip = await invoice(70, who, { status: "scheduled", invoice_type: "initial" });
    await grant(who, [{ amount: 70, reason: tag, kind: "rent", key: `${tag}-gS` }]);
    expect(await applyCredit(who, { p_first: ip.id, p_only: true })).toHaveLength(1);
    expect((await moneyOn(ip.id)).status).toBe("scheduled");
    const rent = await invoice(500, who, { status: "scheduled", invoice_type: "rental" });
    expect((await pay(rent.id, 100)).error).toBe("not_billed");
  });
});
