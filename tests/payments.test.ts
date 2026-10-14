import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { isValidAmount, recordInvoicePayment } from "../src/lib/payments.server";
import {
  addCredit,
  applyAccountCredit,
  creditBalance,
  grantKey,
} from "../src/lib/account-credit.server";
import { fakeDb } from "./fake-db";

/*
 * Payments and account credit, each saved in one step (15 Oct 2026). These run
 * without a database: what is refused before the database is reached, which
 * code calls the one payment step, and the migration's own guards. That the
 * database locks and rolls back is proved only by tests/payments.db.test.ts,
 * against test-bratchia - a stand-in cannot prove locking.
 */

const R = "11111111-1111-4111-8111-111111111111";
const INV = "55555555-5555-4555-8555-555555555555";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe("1. an amount that is not money is refused before anything is written", () => {
  for (const bad of [
    0,
    -50,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    0.004,
    "100" as any,
    null as any,
  ]) {
    test(String(bad), async () => {
      const db = fakeDb({ invoices: [{ id: INV, total: 100, status: "issued" }] });
      await expect(
        recordInvoicePayment(db.sb, {
          invoiceId: INV,
          amount: bad,
          paidOn: "2026-10-15",
          method: "Cash",
        }),
      ).rejects.toThrow("Enter the amount received");
      expect(db.writes).toEqual([]);
      expect(db.rpcs).toEqual([]);
    });
  }
  test("one sen and up is money", () => {
    expect([0.01, 1, 500, 1586.67].every(isValidAmount)).toBe(true);
  });
});

describe("13. one payment form, one payment step", () => {
  test("Booking, Resident Payments and Collections all open the shared RecordPaymentDialog", () => {
    for (const f of [
      "src/routes/admin.bookings.$id.tsx",
      "src/components/admin/ResidentPayments.tsx",
      "src/routes/admin.residents.payments.tsx",
    ])
      expect(readFileSync(f, "utf8")).toMatch(
        /import \{[^}]*RecordPaymentDialog[^}]*\} from "@\/components\/admin\/RecordPaymentDialog"/,
      );
  });

  test("only that dialog calls recordPayment, and it sends one request key per payment", () => {
    const callers = files("src").filter((f) => /\brecordPayment\(/.test(readFileSync(f, "utf8")));
    expect(callers).toEqual(["src/components/admin/RecordPaymentDialog.tsx"]);
    const dialog = readFileSync("src/components/admin/RecordPaymentDialog.tsx", "utf8");
    expect(dialog).toContain("useState(() => crypto.randomUUID())");
    expect(dialog).toMatch(
      /requestKey,\n\s+\},\n\s+\}\);\n\s+setRequestKey\(crypto\.randomUUID\(\)\)/,
    );
  });

  test("admin's payments, account credit and checkout all save through record_invoice_payment", () => {
    expect(readFileSync("src/lib/admin.functions.ts", "utf8")).toMatch(
      /recordPayment = createServerFn[\s\S]*?recordInvoicePayment\(supabase/,
    );
    expect(readFileSync("src/lib/checkout.functions.ts", "utf8")).toMatch(
      /async function applyPayment[\s\S]*?recordInvoicePayment\(sb/,
    );
    expect(readFileSync("supabase/migrations/20261015100000_atomic_payments.sql", "utf8")).toMatch(
      /function public\.apply_account_credit[\s\S]*?public\.record_invoice_payment\(/,
    );
  });

  test("no server code writes a payment or a receipt by itself - only the master-list import, as before", () => {
    const writers = files("src").filter((f) =>
      /from\("(payments|receipts)"\)\s*\.\s*(insert|upsert)\b/.test(readFileSync(f, "utf8")),
    );
    expect(writers).toEqual(["src/lib/migration/import.server.ts"]);
  });
});

describe("9. account credit is given once", () => {
  test("an Update Tenancy event's credit has the event's key - the same event, kind and deposit give one key", () => {
    const g = {
      amount: 100,
      reason: "x",
      kind: "deposit" as const,
      depositKey: "security",
      eventId: "ev1",
    };
    expect(grantKey(g)).toBe("event:ev1:deposit:security");
    expect(grantKey({ ...g, reason: "said differently" })).toBe(grantKey(g));
    expect(grantKey({ ...g, depositKey: "utility" })).not.toBe(grantKey(g));
    expect(
      grantKey({ amount: 5, reason: "", kind: "cancel", eventId: "ev1", key: "cancel:ev1:inv9" }),
    ).toBe("cancel:ev1:inv9");
    // a grant of no event (a room change before the start) is once, as it always was
    expect(grantKey({ amount: 5, reason: "", kind: "rent" })).not.toBe(
      grantKey({ amount: 5, reason: "", kind: "rent" }),
    );
  });

  test("credit goes to the database by its key - never to the old Storage file", async () => {
    const db = fakeDb({ account_credit_imports: [{ resident_id: R, entries: 0 }] });
    await addCredit(db.sb, R, [
      {
        amount: 120,
        reason: "Security deposit reduced",
        kind: "deposit",
        depositKey: "security",
        eventId: "ev1",
      },
    ]);
    expect(db.rpcs).toEqual(["grant_account_credit"]);
    expect((db.writes[0]!.value as any).p_entries).toEqual([
      {
        amount: 120,
        reason: "Security deposit reduced",
        kind: "deposit",
        depositKey: "security",
        depositLabel: "",
        eventId: "ev1",
        key: "event:ev1:deposit:security",
      },
    ]);
    expect(db.writes.filter((w) => w.what.startsWith("file "))).toEqual([]);
  });
});

describe("12. the old Storage credit is brought over once", () => {
  const legacy = [
    {
      id: "a1b2c3d4",
      at: "2026-10-08T01:00:00.000Z",
      amount: 150,
      reason: "Cheaper room",
      kind: "rent",
      eventId: "ev7",
    },
  ];

  test("not brought over yet: its file is handed to the database's one-time import, then read from the database", async () => {
    const S = "44444444-4444-4444-8444-444444444444";
    const db = fakeDb({}, { [`account-credit/${S}.json`]: legacy });
    await creditBalance(db.sb, S);
    expect(db.rpcs).toEqual(["import_legacy_account_credit", "account_credit_position"]);
    expect((db.writes[0]!.value as any).p_entries).toEqual(legacy);
    // the file itself is not changed or removed
    expect(db.writes.filter((w) => w.what.startsWith("file"))).toEqual([]);
  });

  test("brought over already: no import, whatever the file says", async () => {
    const S = "22222222-2222-4222-8222-222222222222";
    const db = fakeDb(
      { account_credit_imports: [{ resident_id: S, entries: 1 }] },
      { [`account-credit/${S}.json`]: legacy },
    );
    await creditBalance(db.sb, S);
    expect(db.rpcs).toEqual(["account_credit_position"]);
  });

  test("a file that cannot be read stops it - it is never marked brought over empty", async () => {
    const S = "33333333-3333-4333-8333-333333333333";
    const db = fakeDb({}, { [`account-credit/${S}.json`]: { not: "a list" } });
    await expect(applyAccountCredit(db.sb, S)).rejects.toThrow("cannot be read");
    expect(db.rpcs).toEqual([]);
  });
});

describe("the migration guards itself", () => {
  const sql = readFileSync("supabase/migrations/20261015100000_atomic_payments.sql", "utf8");
  const made = [...sql.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]!);

  test("one transaction, and it stops unless every step is in place", () => {
    expect(sql).toMatch(/^begin;$/m);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql).toMatch(/raise exception 'atomic_payments did not complete'/);
  });

  test("every function it makes: its search path set, run as its caller, callable by the server only", () => {
    expect(made.length).toBeGreaterThanOrEqual(7);
    expect(sql).not.toMatch(/security definer/i);
    for (const f of made) {
      const body = sql.slice(sql.indexOf(`function public.${f}(`));
      expect(body.slice(0, body.indexOf("as $$"))).toContain("set search_path = public, pg_temp");
    }
    const grants = sql.slice(sql.indexOf("foreach f in array array["));
    expect(made.filter((f) => !grants.includes(`'public.${f}(`))).toEqual([]);
    expect(grants).toContain("revoke all on function %s from public, anon, authenticated");
    expect(grants).toContain("grant execute on function %s to service_role");
  });

  test("the credit tables: row security on, nobody but the server", () => {
    expect(sql).toContain("alter table public.account_credit_entries enable row level security;");
    expect(sql).toContain("alter table public.account_credit_imports enable row level security;");
    expect(sql).toContain(
      "revoke all on public.account_credit_entries, public.account_credit_imports from public, anon, authenticated;",
    );
    expect(sql).not.toMatch(/create policy/i);
  });

  test("history is not deleted or rewritten: no delete, no update of a payment or receipt", () => {
    expect(sql).not.toMatch(/delete from public\.(payments|receipts|account_credit_entries)/i);
    expect(sql).not.toMatch(/update public\.(payments|receipts)\b/i);
    // two receipts on one payment stop it and say how to find them
    expect(sql).toMatch(
      /raise exception 'atomic_payments: % payment\(s\) have more than one receipt/,
    );
  });

  test("a payment's receipt is written in the same function, with no handler that could swallow a failure", () => {
    const body = sql.slice(
      sql.indexOf("function public.record_invoice_payment("),
      sql.indexOf("function public.account_credit_position("),
    );
    expect(body).toContain("for update");
    expect(body.indexOf("insert into public.payments")).toBeLessThan(
      body.indexOf("insert into public.receipts"),
    );
    expect(body.indexOf("insert into public.receipts")).toBeLessThan(
      body.indexOf("update public.invoices"),
    );
    expect(body).not.toMatch(/\bexception\s+when\b/i);
  });
});
