import { describe, expect, test } from "bun:test";

import { STAFF } from "../src/data/form-options";
import {
  MONEY_LABEL,
  changeCreditOutlook,
  eventDeposits,
  eventInvoice,
  fixedCharges,
  periodName,
  type OutlookEvent,
  type OutlookTarget,
} from "../src/lib/tenancy-change";
import {
  applyTenancyChangeWith,
  previewTenancyChangeWith,
  type TenancyChangeRequest,
} from "../src/lib/tenancy-change.functions";
import { fakeDb } from "./fake-db";

/*
 * Update Tenancy's money preview (Dani, 15 Oct 2026): the IP, the account
 * credit and where it goes, and the credit note left over - one calculation for
 * Review and Confirm. All data is made up.
 */

const room = { room: true, unit: false, occupancy: false, date: "none" as const };
const unit = { ...room, unit: true };
const held = { security: 1200, utility: 300, card_deposit: 50 };

const ev = (over: Partial<OutlookEvent> = {}): OutlookEvent => ({
  name: "Room change",
  date: "2027-09-01",
  ipTotal: 0,
  depositCredit: [],
  rentCredit: null,
  adjustment: null,
  ...over,
});
const rent = (month: string, owing: number): OutlookTarget => ({
  id: `rent-${month}`,
  label: `Rent, ${periodName(`${month}-01`, lastDay(month))}`,
  date: `${month}-01`,
  owing,
  kind: "rent",
});
const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

// The Arc's Schedule B prices for the fixed fees (residences.additional_charges)
const ARC = [
  { label: "Resident-requested room/unit change", amount: 100 },
  { label: "Additional access card following room/unit change", amount: 20 },
];

describe("the Initial Payment, from the rules", () => {
  test("1. higher deposit and a room change: top-up + RM100, no RM20", () => {
    const d = eventDeposits(held, { ...held, security: 1500 });
    const ip = eventInvoice(d.ipLines, fixedCharges(room, ARC), 0);
    expect(ip.lines.map((l) => [l.label, l.amount])).toEqual([
      ["Security deposit - difference", 300],
      ["Resident-requested room/unit change", 100],
    ]);
    expect(ip.total).toBe(400);
  });

  test("2. higher deposit and another unit: top-up + RM100 + RM20 = RM420", () => {
    const d = eventDeposits(held, { ...held, security: 1500 });
    expect(eventInvoice(d.ipLines, fixedCharges(unit, ARC), 0).total).toBe(420);
  });

  test("7. no deposit difference: the fee only, no credit", () => {
    const d = eventDeposits(held, held);
    expect(d.credit).toBe(0);
    expect(eventInvoice(d.ipLines, fixedCharges(room, ARC), 0).total).toBe(100);
  });
});

describe("where the account credit goes", () => {
  test("3. a lower deposit that covers only the change fee", () => {
    const o = changeCreditOutlook(
      0,
      [ev({ ipTotal: 100, depositCredit: [{ label: "Security deposit", amount: 100 }] })],
      [rent("2027-10", 850)],
    );
    expect(o.events[0]).toMatchObject({ ipTotal: 100, creditApplied: 100, balanceDue: 0 });
    expect(o.credited).toEqual([]);
    expect(o.leftover).toBe(0);
  });

  test("4. RM500 credit: RM100 on the fee, RM400 off October - RM450 to pay", () => {
    const o = changeCreditOutlook(
      0,
      [ev({ ipTotal: 100, depositCredit: [{ label: "Security deposit", amount: 500 }] })],
      [rent("2027-10", 850), rent("2027-11", 850)],
    );
    expect(o.events[0]!.balanceDue).toBe(0);
    expect(o.credited).toMatchObject([{ label: "Rent, October 2027", credit: 400, after: 450 }]);
    expect(o.leftover).toBe(0);
  });

  test("5. credit over several months: September and October paid, RM400 off November", () => {
    const o = changeCreditOutlook(
      2100,
      [ev()],
      [rent("2027-11", 850), rent("2027-09", 850), rent("2027-10", 850)],
    );
    // oldest first, whatever order they came in
    expect(o.credited.map((c) => [c.label, c.credit, c.after])).toEqual([
      ["Rent, September 2027", 850, 0],
      ["Rent, October 2027", 850, 0],
      ["Rent, November 2027", 400, 450],
    ]);
  });

  test("6. full term paid in advance - nothing left to bill: all of it is the credit note", () => {
    const o = changeCreditOutlook(
      0,
      [ev({ ipTotal: 100, depositCredit: [{ label: "Security deposit", amount: 300 }] })],
      [],
    );
    expect(o.events[0]!.creditApplied).toBe(100);
    expect(o.leftover).toBe(200);
    // what was given, less what took from it, is the credit note - to the sen
    const used =
      o.events.reduce((n, e) => n + e.creditApplied, 0) +
      o.credited.reduce((n, c) => n + c.credit, 0);
    expect(o.totalGiven - used).toBe(o.leftover);
  });

  test("one event's credit pays the next one's fee - named as arising from Event 1", () => {
    const o = changeCreditOutlook(
      0,
      [
        ev({ depositCredit: [{ label: "Security deposit", amount: 150 }] }),
        ev({ name: "Renewal", date: "2027-12-01", ipTotal: 100 }),
      ],
      [],
    );
    expect(o.events[1]).toMatchObject({ creditApplied: 100, balanceDue: 0, fromEvents: [0] });
    expect(o.leftover).toBe(50);
  });

  test("cheaper rent already billed is credit too, given after its own IP", () => {
    const o = changeCreditOutlook(
      0,
      [
        ev({
          ipTotal: 100,
          rentCredit: { label: MONEY_LABEL.billedRentCredit("September 2027"), amount: 120 },
        }),
      ],
      [rent("2027-10", 850)],
    );
    // the billed-rent credit comes when the IP is settled, so it cannot pay that IP
    expect(o.events[0]!.creditApplied).toBe(0);
    expect(o.credited).toMatchObject([{ credit: 120, after: 730 }]);
  });
});

describe("one set of words", () => {
  test("13. the review and the invoice PDF use the same credit and balance labels", async () => {
    const src = await Bun.file("src/lib/invoice-pdf.ts").text();
    expect(src).toContain("MONEY_LABEL.creditApplied");
    expect(src).toContain("MONEY_LABEL.balanceDue");
    const review = await Bun.file("src/components/admin/TenancyChangeMoney.tsx").text();
    // the screen writes none of these itself
    for (const words of ["Less: account credit applied", "Balance due", "Remaining credit"])
      expect(review).not.toContain(`"${words}"`);
  });
});

/* ---------------------------------------------------- against the server code */

const R = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";
const A = "44444444-4444-4444-8444-444444444444";

function world() {
  return {
    tenancies: [
      {
        id: T,
        resident_id: R,
        start_date: "2026-07-01",
        end_date: "2027-06-30",
        created_at: "2026-06-01T00:00:00Z",
      },
    ],
    residents: [{ id: R, full_name: "Test Resident" }],
    beds: [{ id: "bed-1", resident_id: R, status: "active", rent: 900 }],
    invoices: [
      {
        id: "inv-1",
        number: "INV-1",
        resident_id: R,
        tenancy_id: T,
        invoice_type: "initial",
        status: "paid",
        total: 0,
        created_at: "2026-06-01T00:00:00Z",
      },
    ],
    rental_schedules: [{ tenancy_id: T, monthly_rent: 900 }],
    tenancy_agreements: [
      {
        id: A,
        resident_id: R,
        agreement_no: "TA00001-1",
        kind: "initial",
        created_at: "2026-06-02T00:00:00Z",
      },
    ],
    agreement_documents: ["agreement", "sched_a", "sched_b", "sched_c"].map((t) => ({
      id: `doc-${t}`,
      agreement_id: A,
      doc_type: t,
      version: 1,
      status: "signed",
      merge_values: {},
    })),
    account_credit_imports: [{ resident_id: R, entries: 0 }],
  };
}

function extension(security = 100): TenancyChangeRequest {
  return {
    residentId: R,
    tenancyId: T,
    change: {
      oldUnitId: "u1",
      newUnitId: "u1",
      oldRoomId: "r1",
      newRoomId: "r1",
      oldOccupancy: "single",
      newOccupancy: "single",
      oldEnd: "2027-06-30",
      newEnd: "2027-09-30",
    },
    moveOn: "",
    moveTo: null,
    approvedBy: STAFF[0]!,
    events: [
      {
        date: "2027-07-01",
        rent: 900,
        required: { security, utility: 0, card_deposit: 0 },
        waived: [],
        waivedFees: [],
        mergeValues: {},
        periodEnd: "2027-09-30",
        roomName: "Room A",
        occupancy: "single",
      },
    ],
  };
}

// the credit position is read through the database's own reader
const answers = {
  account_credit_position: () => ({ given: 0, used: 0, noted: 0, balance: 0 }),
  place_stay: () => ({ ok: true }),
};

describe("the preview, on the server", () => {
  test("14. opening the preview writes nothing - no invoice, credit, event, room or file", async () => {
    const db = fakeDb(world(), {}, answers);
    const { approvedBy: _a, ...plan } = extension();
    void _a;
    const p = await previewTenancyChangeWith(db.sb, plan);
    expect(p.events[0]!.ip).toMatchObject({ total: 100, creditApplied: 0, balanceDue: 100 });
    expect(p.events[0]!.invoice?.number).toBe("DRAFT");
    expect(p.creditNote).toBeNull();
    expect(db.writes.filter((w) => !String(w.what).includes("account_credit_position"))).toEqual(
      [],
    );
  });

  test("11. the draft invoice's total is the review's", async () => {
    const db = fakeDb(world(), {}, answers);
    const { approvedBy: _a, ...plan } = extension(250);
    void _a;
    const p = await previewTenancyChangeWith(db.sb, plan);
    expect(p.events[0]!.invoice?.total).toBe(p.events[0]!.ip.total);
    expect(p.events[0]!.invoice?.items.reduce((n, i) => n + i.amount, 0)).toBe(250);
  });

  test("9. the same request gives the same key; other figures, another key", async () => {
    const { approvedBy: _a, ...plan } = extension();
    void _a;
    const one = await previewTenancyChangeWith(fakeDb(world(), {}, answers).sb, plan);
    const two = await previewTenancyChangeWith(fakeDb(world(), {}, answers).sb, plan);
    expect(one.key).toBe(two.key);
    const credit = {
      ...answers,
      account_credit_position: () => ({ given: 50, used: 0, noted: 0, balance: 50 }),
    };
    expect((await previewTenancyChangeWith(fakeDb(world(), {}, credit).sb, plan)).key).not.toBe(
      one.key,
    );
  });

  test("9. Confirm with a key from figures that have moved is refused before anything is written", async () => {
    const db = fakeDb(world(), {}, answers);
    await expect(
      applyTenancyChangeWith(db.sb, { ...extension(), previewKey: "stale" }),
    ).rejects.toThrow("The figures changed while the review was open");
    expect(db.writes.filter((w) => !String(w.what).includes("account_credit_position"))).toEqual(
      [],
    );
  });

  test("Confirm with the key the review showed goes ahead, and saves the IP it previewed", async () => {
    const { approvedBy: _a, ...plan } = extension();
    void _a;
    const key = (await previewTenancyChangeWith(fakeDb(world(), {}, answers).sb, plan)).key;
    const db = fakeDb(world(), {}, answers);
    const out = await applyTenancyChangeWith(db.sb, { ...extension(), previewKey: key });
    expect(out.events).toMatchObject([{ name: "Extension", ipTotal: 100 }]);
  });
});
