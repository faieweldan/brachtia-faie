import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { voidInvoiceToCredit } from "../src/lib/account-credit.server";
import { releaseBooking } from "../src/lib/booking-lifecycle";
import { roomChangeCreditKey } from "../src/lib/admin.functions";
import { fakeDb } from "./fake-db";

/*
 * Cancelling an invoice in one step with the money on it (16 Oct 2026). These
 * run without a database: every way of cancelling goes through a locked
 * database function, and what the code does with its answer. The locks
 * themselves are proved only against a database - tests/invoice-void.db.test.ts.
 */

const R = "66666666-6666-4666-8666-666666666666";
const INV = "77777777-7777-4777-8777-777777777777";
const E = "88888888-8888-4888-8888-888888888888";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}
const src = (f: string) => readFileSync(f, "utf8");

describe("no invoice is marked void outside a locked database step", () => {
  test("no server code writes status void itself", () => {
    const writers = files("src").filter((f) => /status:\s*"void"/.test(src(f)));
    expect(writers).toEqual([]);
  });

  test("each way of cancelling calls its locked function", () => {
    const admin = src("src/lib/admin.functions.ts");
    // Admin Cancel Invoice, and a room change's unpaid difference invoice
    expect(admin).toMatch(/export const cancelInvoice[\s\S]*?\.rpc\("void_invoice_if_unpaid"/);
    expect(admin).toMatch(
      /for \(const d of plan\.dropping\)[\s\S]*?\.rpc\("void_invoice_if_unpaid"/,
    );
    expect(src("src/lib/booking-lifecycle.ts")).toMatch(
      /releaseBooking[\s\S]*?\.rpc\("void_unpaid_booking_invoices"/,
    );
    expect(src("src/lib/checkout.functions.ts")).toMatch(
      /v\.type === "cancellation"[\s\S]*?\.rpc\("void_invoice_if_unpaid", \{\s*p_invoice: inv\.id,\s*p_expect_paid: paid,?\s*\}\)/,
    );
    expect(src("src/lib/tenancy-events.server.ts")).toMatch(
      /const voidInvoice = [\s\S]*?voidInvoiceToCredit\(sb, residentId/,
    );
  });
});

describe("booking release", () => {
  test("money on the booking, seen under the lock: nothing released, no hold let go", async () => {
    const db = fakeDb({}, {}, { void_unpaid_booking_invoices: () => ({ ok: false, voided: [] }) });
    expect(await releaseBooking(db.sb, E)).toEqual({ ok: false, voided: [] });
    expect(db.rpcs).toEqual(["void_unpaid_booking_invoices"]);
    expect(db.writes.map((w) => w.what)).toEqual(["rpc void_unpaid_booking_invoices"]);
  });

  test("nothing paid: the invoices voided by the database are the ones it says", async () => {
    const db = fakeDb(
      { enquiries: [{ id: E }] },
      {},
      { void_unpaid_booking_invoices: () => ({ ok: true, voided: ["INV/IP/00012"] }) },
    );
    expect(await releaseBooking(db.sb, E)).toEqual({ ok: true, released: 0, voided: ["INV/IP/00012"] });
    expect(db.rpcs).toEqual(["void_unpaid_booking_invoices", "release_hold"]);
  });
});

describe("Update Tenancy cancellation", () => {
  test("one database call: the note and the credit's words as they were, the money worked out under the lock", async () => {
    const db = fakeDb(
      { account_credit_imports: [{ resident_id: R, entries: 0 }] },
      {},
      { void_invoice_to_credit: () => ({ ok: true, voided: true, cash: 120 }) },
    );
    const cash = await voidInvoiceToCredit(db.sb, R, {
      invoiceId: INV,
      note: "Cancelled: Student changed mind · Approved by Syazwani · 16 Oct 2026, 10:00",
      what: "IP",
      tail: "room change cancelled",
      eventId: "ev1",
    });
    expect(cash).toBe(120);
    expect(db.writes).toEqual([
      {
        what: "rpc void_invoice_to_credit",
        op: "call",
        value: {
          p_resident: R,
          p_invoice: INV,
          p_note: "Cancelled: Student changed mind · Approved by Syazwani · 16 Oct 2026, 10:00",
          p_what: "IP",
          p_tail: "room change cancelled",
          p_event_id: "ev1",
        },
      },
    ]);
  });
});

describe("a room change before the start gives its credit once", () => {
  test("one key per credit: the confirmation, the kind, the deposit, the invoice", () => {
    const k = (kind: string, part: string) => roomChangeCreditKey("req-1", kind, part, INV);
    expect(k("deposit", "security")).toBe(`roomchange:req-1:deposit:security:${INV}`);
    // the same confirmation sent again: the same keys
    expect(k("deposit", "security")).toBe(roomChangeCreditKey("req-1", "deposit", "security", INV));
    // each part of one room change its own key
    expect(
      new Set([
        k("deposit", "security"),
        k("deposit", "utility"),
        k("rent", ""),
        k("rent", "revise"),
      ]).size,
    ).toBe(4);
  });

  test("every credit a room change gives carries its key", () => {
    const body = src("src/lib/admin.functions.ts");
    const apply = body.slice(
      body.indexOf("export async function applyRoomChange"),
      body.indexOf("export const cancelInvoice"),
    );
    const grants = [...apply.matchAll(/await addCredit\(/g)].length;
    expect(grants).toBe(2);
    expect([...apply.matchAll(/key: roomChangeCreditKey\(\s*data\.requestKey/g)].length).toBe(
      grants,
    );
  });

  test("the server refuses a confirmation without its key", () => {
    expect(src("src/lib/admin.functions.ts")).toMatch(
      /changeRoomBeforeStart[\s\S]*?if \(!isRequestKey\(data\.requestKey\)\)/,
    );
  });

  test("the review keeps one key while the same room change is confirmed or retried, and a new one for another", () => {
    const review = src("src/components/admin/RoomChangeReview.tsx");
    expect(review).toContain("useState(() => crypto.randomUUID())");
    // renewed only when another room, rent or dates is picked, or once it is done
    expect(review).toContain("const changeId = picked ? `${picked.bedId}|${picked.rent}` : `dates:${dates?.to}`;");
    expect(review).toMatch(
      /if \(keyFor\.current === changeId\) return;[\s\S]*?setRequestKey\(crypto\.randomUUID\(\)\);\n\s+\}, \[changeId\]\);/,
    );
    // the dates path sends it too - it gives credit the same way
    expect(review).toMatch(/changeStayDatesBeforeStart\(\{[\s\S]*?requestKey,/);
    expect(review).toMatch(/setRequestKey\(crypto\.randomUUID\(\)\);\n\s+onDone\(res\);/);
    expect(review).toMatch(/toLabel: picked\.label,\n\s+requestKey,/);
    // not renewed on a failure: the catch and the refused answer leave it
    const confirm = review.slice(
      review.indexOf("async function confirm()"),
      review.indexOf("const line ="),
    );
    expect([...confirm.matchAll(/setRequestKey/g)].length).toBe(1);
  });
});

describe("the migration guards itself", () => {
  const sql = readFileSync("supabase/migrations/20261016100000_atomic_invoice_void.sql", "utf8");
  const made = [...sql.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]!);

  test("three functions: caller's rights, fixed search path, server only", () => {
    expect(made).toEqual([
      "void_invoice_if_unpaid",
      "void_unpaid_booking_invoices",
      "void_invoice_to_credit",
    ]);
    expect(sql).not.toMatch(/security definer/i);
    for (const f of made) {
      const head = sql.slice(sql.indexOf(`function public.${f}(`));
      expect(head.slice(0, head.indexOf("as $$"))).toContain("set search_path = public, pg_temp");
    }
    const grants = sql.slice(sql.indexOf("foreach f in array array["));
    expect(made.filter((f) => !grants.includes(`'public.${f}(`))).toEqual([]);
    expect(grants).toContain("revoke all on function %s from public, anon, authenticated");
  });

  test("each locks the invoice before reading its payments", () => {
    for (const f of made) {
      const body = sql.slice(sql.indexOf(`function public.${f}(`));
      const end = body.indexOf("end $$;");
      expect(body.indexOf("for update")).toBeGreaterThan(-1);
      expect(body.indexOf("for update")).toBeLessThan(body.indexOf("from public.payments"));
      expect(body.indexOf("from public.payments")).toBeLessThan(end);
    }
  });

  test("Update Tenancy's: the credit lock first, then the invoice - apply_account_credit's order", () => {
    const body = sql.slice(sql.indexOf("function public.void_invoice_to_credit("));
    expect(body.indexOf("pg_advisory_xact_lock(hashtextextended('account_credit:'")).toBeLessThan(
      body.indexOf("for update"),
    );
    expect(body).toContain("on conflict (resident_id, grant_key) do nothing");
    expect(body.indexOf("update public.invoices")).toBeLessThan(
      body.indexOf("test_fail_before_credit"),
    );
    expect(body.indexOf("test_fail_before_credit")).toBeLessThan(
      body.indexOf("insert into public.account_credit_entries"),
    );
  });
});

describe("checkout cancellation: what the signed statement counted", () => {
  const deposits = [
    { label: "Booking fee", amount: 60, invoiceNumber: "INV/IP/00001" },
    { label: "Advance rent", amount: 40, invoiceNumber: "INV/IP/00001" },
    { label: "Other booking", amount: 25, invoiceNumber: "INV/IP/00002" },
  ];

  test("several deposit lines of one invoice are added up; other invoices' are not", async () => {
    const { statementPaidFor } = await import("../src/lib/checkout.functions");
    expect(statementPaidFor(deposits, "INV/IP/00001")).toBe(100);
    expect(statementPaidFor(deposits, "INV/IP/00002")).toBe(25);
  });

  test("nothing captured for the invoice: it expects zero", async () => {
    const { statementPaidFor } = await import("../src/lib/checkout.functions");
    expect(statementPaidFor(deposits, "INV/IP/00009")).toBe(0);
    expect(statementPaidFor([], "INV/IP/00001")).toBe(0);
    expect(statementPaidFor(deposits, "")).toBe(0);
  });

  test("the amount comes from the signed statement, never a fresh read of payments", () => {
    const code = src("src/lib/checkout.functions.ts");
    const start = code.indexOf('if (v.type === "cancellation")');
    const block = code.slice(start, code.indexOf("const { writeStatement }", start));
    expect(block).toContain("statementPaidFor(v.deposits, String(inv.number");
    expect(block).not.toMatch(/from\("payments"\)/);
  });
});
