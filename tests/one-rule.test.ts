import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/*
 * One fact, one place (docs/MISTAKES-TO-AVOID.md, 11 Oct 2026). How a room can
 * be sold - single, twin, a twin let whole, a single made twin - is decided in
 * src/lib/room-offer.ts (roomOffer). A screen that writes its own copy drifts:
 * the booking picker never learnt that an empty twin can be sold as a single,
 * which Homes knew.
 *
 * So screens may not test a room's shape themselves. The lines below were
 * already there when this test was written; the count may go down, never up.
 * A new one fails here: call roomOffer instead, or - if it only draws a label -
 * raise the count on purpose and say why in the commit.
 */
const RULE = /\.occupancy\s*[!=]==\s*"(single|twin)"|isSoldAsSingle\(|"Sold as single"|SOLD_AS_SINGLE/;

const KNOWN: Record<string, number> = {
  "src/components/admin/StayDetailsCard.tsx": 2,
  "src/components/admin/UpdateTenancyDialog.tsx": 1,
  "src/routes/admin.bookings.$id.tsx": 8,
  "src/routes/admin.bookings.$id_.invoice.tsx": 2,
  // the read-only Occupancy label in the unit editor - a label, not a rule (11 Oct 2026)
  "src/routes/admin.homes.units.tsx": 1,
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe("room-selling rules live in src/lib, not on screens", () => {
  const counts: Record<string, number> = {};
  for (const f of [...files("src/routes"), ...files("src/components")]) {
    const n = readFileSync(f, "utf8").split("\n").filter((l) => RULE.test(l)).length;
    if (n) counts[f] = n;
  }
  test("no screen has more room-shape checks than it had", () => {
    const over = Object.entries(counts)
      .filter(([f, n]) => n > (KNOWN[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} (allowed ${KNOWN[f] ?? 0}) - use roomOffer() from src/lib/room-offer.ts`);
    expect(over).toEqual([]);
  });
});

/*
 * One line editor for every money document (Dani, 12 Oct 2026). The booking's
 * invoice, a resident's invoice and the checkout statement each had their own
 * Add line / Remove line table, and they drifted apart. They now all use
 * LineItemsEditor; a new invoice-like screen uses it too, passing what differs
 * (a Type column, Price x Qty, photos) as props instead of copying the table.
 */
describe("money documents share one line editor", () => {
  const EDITOR = "src/components/admin/LineItemsEditor.tsx";
  const LINE_TABLE = /Add line|aria-label="Remove line"/;
  test("only LineItemsEditor draws Add line / Remove line", () => {
    const own = [...files("src/routes"), ...files("src/components")].filter(
      (f) => f !== EDITOR && LINE_TABLE.test(readFileSync(f, "utf8")),
    );
    expect(own).toEqual([]);
  });
});

/*
 * One notice for quiet news on a card (Dani, 14 Oct 2026): the account credit
 * strip and the Tenancy tab's room-change line were drawn apart, one with a
 * close cross and one without. Both use src/components/ui/notice.tsx now; a new
 * one does too, instead of copying the green strip.
 */
describe("quiet notices share one component", () => {
  const NOTICE = "src/components/ui/notice.tsx";
  const STRIP = /bg-emerald-50 px-3 py-2 text-xs text-emerald-900/;
  test("only notice.tsx draws the notice strip", () => {
    const own = [...files("src/routes"), ...files("src/components")].filter(
      (f) => f !== NOTICE && STRIP.test(readFileSync(f, "utf8")),
    );
    expect(own).toEqual([]);
  });
});

/*
 * A document code means one thing (Dani, 14 Oct 2026): AC was Additional
 * charge on invoices and Account credit on credit notes. CS is the one code
 * meant on both sides - checkout settlement, INV/CS owed, CN/CS owed back.
 */
describe("invoice and credit note codes", () => {
  test("no code means two different things", async () => {
    const { INVOICE_CATEGORIES, CREDIT_NOTE_CATEGORIES } = await import("../src/lib/invoice-category");
    const meaning = new Map<string, string>();
    for (const c of [...Object.values(INVOICE_CATEGORIES), ...Object.values(CREDIT_NOTE_CATEGORIES)]) {
      const was = meaning.get(c.code);
      expect(was === undefined || was === c.label).toBe(true);
      meaning.set(c.code, c.label);
    }
    expect(CREDIT_NOTE_CATEGORIES.refund.code).toBe("RF");
  });
});

/*
 * Credit note numbers come only from the database (14 Oct 2026): checkout's was
 * a counter file in Storage, read then written, so two statements started
 * together could share a number, and it wrote CS/ instead of CN/CS/. Both
 * series are database sequences now - CN/CS (next_checkout_note_number) and
 * CN/RF (issue_account_credit_note) - each from 1.
 */
describe("credit note numbers", () => {
  test("no code keeps its own number counter", () => {
    const own = [...files("src/lib"), ...files("src/routes"), ...files("src/components")].filter((f) =>
      /_counter\.json/.test(readFileSync(f, "utf8")),
    );
    expect(own).toEqual([]);
  });
  test("checkout numbers are CN/CS from the database", () => {
    const src = readFileSync("src/lib/checkout.server.ts", "utf8");
    expect(src).toContain('rpc("next_checkout_note_number")');
    expect(readFileSync("supabase/migrations/20261021100000_credit_note_numbers.sql", "utf8")).toContain("'CN/CS/'");
  });
});

/*
 * Who is in a unit is read one way (Dani, 14 Oct 2026): bedStays in
 * placement.ts, drawn by UnitBeds. The booking's room picker and Update
 * Tenancy's each read only the bed row and called a bed a booking held
 * "Vacant"; Homes knew better. No screen reads the bed row for it again.
 */
describe("who is in a unit", () => {
  test("no screen lists a unit's people from the bed row alone", () => {
    const own = [...files("src/routes"), ...files("src/components")].filter((f) =>
      /bd\.residentName \|\| bd\.holdFor|: "Vacant"\}/.test(readFileSync(f, "utf8")),
    );
    expect(own).toEqual([]);
  });
});
