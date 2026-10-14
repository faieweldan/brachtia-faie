import { describe, expect, test } from "bun:test";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { STAFF } from "../src/data/form-options";
import {
  applyTenancyChangeWith,
  type TenancyChangeRequest,
} from "../src/lib/tenancy-change.functions";
import {
  agreementSource,
  planDocumentSteps,
  updateTenancyDocumentPreflight,
} from "../src/lib/tenancy-docs.functions";
import {
  officialStay,
  pickStay,
  rentInForce,
  rentInForceFrom,
} from "../src/lib/tenancy-facts.server";
import { beforeTenancyStart } from "../src/lib/room-change";
import { documentsFor, changeFlags, planEvents, eventName } from "../src/lib/tenancy-change";
import { testMappingFor, type MappingContext } from "../src/lib/template-fields";
import { fakeDb, type Row } from "./fake-db";

/*
 * Update Tenancy safety (14 Oct 2026):
 *   - the documents a request needs are checked against the agreement on file
 *     before anything is saved (updateTenancyDocumentPreflight)
 *   - a paid stay's dates are the tenancy's, an unpaid booking's its hold's
 *     (officialStay); the rent is the rent terms' with their changes (rentInForce)
 * Run on a stand-in database (fake-db.ts) that records every write. All data is made up.
 */

const R = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";
const Q = "33333333-3333-4333-8333-333333333333";
const A = "44444444-4444-4444-8444-444444444444";
const NO_DEPOSITS = { security: 0, utility: 0, card_deposit: 0 };

const generatedPack = (): Row[] =>
  ["agreement", "sched_a", "sched_b", "sched_c"].map((t) => ({
    id: `doc-${t}`,
    agreement_id: A,
    doc_type: t,
    version: 1,
    status: "signed",
    merge_values: { prepared_by: "Staff" },
  }));

/**
 * A paid resident whose copies all disagree with their tenancy: the bed, the
 * booking, its hold and the move-in invoice say other dates and rents.
 */
function world(docs: Row[] | null = generatedPack()) {
  return {
    tenancies: [
      {
        id: T,
        resident_id: R,
        enquiry_id: Q,
        start_date: "2026-07-01",
        end_date: "2027-06-30",
        created_at: "2026-06-01T00:00:00Z",
      },
    ],
    residents: [{ id: R, enquiry_id: Q, full_name: "Test Resident", move_in: "2026-08-15" }],
    enquiries: [{ id: Q, move_in: "2026-08-01", move_out: "2027-12-31", monthly_rent: 600 }],
    placement_holds: [
      { enquiry_id: Q, bed_id: "bed-1", start_date: "2026-09-01", end_date: "2028-01-31" },
    ],
    beds: [
      {
        id: "bed-1",
        resident_id: R,
        status: "active",
        tenancy_start: "2026-08-01",
        tenancy_end: "2027-12-31",
        rent: 700,
      },
    ],
    invoices: [
      {
        id: "inv-1",
        number: "INV-1",
        resident_id: R,
        enquiry_id: Q,
        tenancy_id: T,
        invoice_type: "initial",
        status: "paid",
        tenancy_start: "2026-08-01",
        tenancy_end: "2027-12-31",
        monthly_rent: 650,
        total: 0,
        created_at: "2026-06-01T00:00:00Z",
      },
    ],
    rental_schedules: [{ tenancy_id: T, monthly_rent: 900 }],
    tenancy_agreements: docs
      ? [
          {
            id: A,
            resident_id: R,
            agreement_no: "TA00001-1",
            kind: "initial",
            created_at: "2026-06-02T00:00:00Z",
          },
        ]
      : [],
    agreement_documents: docs ?? [],
    // their old Storage credit brought over already - no one-time import in these tests
    account_credit_imports: [{ resident_id: R, entries: 0 }],
  };
}

/** an extension of three months, as the window sends it */
function extension(
  over: Partial<TenancyChangeRequest["change"]> = {},
  security = 0,
): TenancyChangeRequest {
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
      ...over,
    },
    moveOn: "",
    moveTo: null,
    // who approved it - required (Dani, 14 Oct 2026)
    approvedBy: STAFF[0]!,
    events: [
      {
        date: "2027-07-01",
        rent: 900,
        required: { ...NO_DEPOSITS, security },
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

const plans = (oldEnd: string, newEnd: string, move: { room?: boolean } = {}) => {
  const flags = changeFlags({
    oldUnitId: "u1",
    newUnitId: "u1",
    oldRoomId: "r1",
    newRoomId: move.room ? "r2" : "r1",
    oldOccupancy: "single",
    newOccupancy: "single",
    oldEnd,
    newEnd,
  });
  return planEvents(flags, move.room ? "2026-12-01" : "", oldEnd).map((p) => ({
    date: p.date,
    name: eventName(p.flags),
    plan: documentsFor(p.flags),
  }));
};
const RENEWAL_DOCS = {
  docTypes: ["agreement", "sched_a", "sched_b", "sched_c"] as (
    "agreement" | "sched_a" | "sched_b" | "sched_c"
  )[],
  missingFiles: "",
};

describe("1-4. the document preflight", () => {
  test("1. a generated agreement passes: Schedule A is revised as version 2", async () => {
    const db = fakeDb(world());
    const out = await updateTenancyDocumentPreflight(db.sb, R, plans("2027-06-30", "2027-09-30"));
    expect(out).toMatchObject({
      ok: true,
      agreementId: A,
      steps: [
        {
          document: "Schedule A",
          action: "revise",
          version: 2,
          source: "generated",
          agreementNo: "TA00001-1",
        },
      ],
    });
    expect(db.writes).toEqual([]);
  });

  test("1. a room change revises Schedules A and C of the same agreement", () => {
    const out = planDocumentSteps(
      { id: A, agreementNo: "TA00001-1", docs: generatedPack() },
      plans("2027-06-30", "2027-06-30", { room: true }),
      RENEWAL_DOCS,
    );
    expect(out.ok).toBe(true);
    expect(out.steps.map((s) => `${s.document} v${s.version}`)).toEqual([
      "Schedule A v2",
      "Schedule C v2",
    ]);
  });

  test("2. a migrated agreement (the old TA as one file) is recognised: its first Schedule A is version 1", async () => {
    const migrated = [
      {
        agreement_id: A,
        doc_type: "agreement",
        version: 1,
        merge_values: { source: "migrated", original_url: "https://example.invalid/ta.pdf" },
      },
    ];
    expect(agreementSource(migrated)).toBe("migrated");
    const db = fakeDb(world(migrated));
    const out = await updateTenancyDocumentPreflight(db.sb, R, plans("2027-06-30", "2027-09-30"));
    expect(out).toMatchObject({
      ok: true,
      steps: [{ document: "Schedule A", action: "first_version", version: 1, source: "migrated" }],
    });
  });

  test("3. a paper agreement uploaded with its Schedule A: recognised, and that scan is revised like any other", () => {
    const uploaded = ["agreement", "sched_a"].map((t) => ({
      agreement_id: A,
      doc_type: t,
      version: 1,
      merge_values: { source: "uploaded" },
    }));
    expect(agreementSource(uploaded)).toBe("uploaded");
    const out = planDocumentSteps(
      { id: A, agreementNo: "TA00001-1", docs: uploaded },
      plans("2027-06-30", "2027-09-30"),
      RENEWAL_DOCS,
    );
    expect(out).toMatchObject({
      ok: true,
      steps: [{ document: "Schedule A", action: "revise", version: 2, source: "uploaded" }],
    });
  });

  test("3. a paper agreement uploaded without its own Schedule C cannot have one revised - said, not guessed", () => {
    const uploaded = ["agreement", "sched_a"].map((t) => ({
      agreement_id: A,
      doc_type: t,
      version: 1,
      merge_values: { source: "uploaded" },
    }));
    const out = planDocumentSteps(
      { id: A, agreementNo: "TA00001-1", docs: uploaded },
      plans("2027-06-30", "2027-06-30", { room: true }),
      RENEWAL_DOCS,
    );
    expect(out.ok).toBe(false);
    if (!out.ok)
      expect(out.error).toBe(
        "Update Tenancy cannot be confirmed: agreement TA00001-1 was uploaded as a signed paper agreement without its own Schedule C, so there is no Schedule C to revise for the room change. Nothing was saved.",
      );
  });

  test("4. no agreement on record: refused", () => {
    const out = planDocumentSteps(null, plans("2027-06-30", "2027-09-30"), RENEWAL_DOCS);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("there is no tenancy agreement on record");
  });

  test("4. a renewal whose template files are missing: refused with the same words generating does", () => {
    const out = planDocumentSteps(
      { id: A, agreementNo: "TA00001-1", docs: generatedPack() },
      plans("2027-06-30", "2028-06-30"),
      {
        ...RENEWAL_DOCS,
        missingFiles:
          "No file uploaded yet for: Schedule A. Upload and activate it in Settings → Templates first.",
      },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("No file uploaded yet for: Schedule A");
  });

  test("4. a renewal then a room change: the move revises the renewal's new agreement, not the old one", () => {
    const flags = changeFlags({
      oldUnitId: "u1",
      newUnitId: "u1",
      oldRoomId: "r1",
      newRoomId: "r2",
      oldOccupancy: "single",
      newOccupancy: "single",
      oldEnd: "2027-06-30",
      newEnd: "2028-06-30",
    });
    const events = planEvents(flags, "2027-08-01", "2027-06-30").map((p) => ({
      date: p.date,
      name: eventName(p.flags),
      plan: documentsFor(p.flags),
    }));
    const out = planDocumentSteps(
      { id: A, agreementNo: "TA00001-1", docs: generatedPack() },
      events,
      RENEWAL_DOCS,
    );
    expect(out.steps.map((s) => [s.document, s.action, s.agreementId])).toEqual([
      ["New agreement", "new_agreement", null],
      ["Schedule A", "revise", null],
      ["Schedule C", "revise", null],
    ]);
    // the renewal's agreement made without Schedule C (its template deactivated): the move after it is refused
    const noC = planDocumentSteps(
      { id: A, agreementNo: "TA00001-1", docs: generatedPack() },
      events,
      { docTypes: ["agreement", "sched_a", "sched_b"], missingFiles: "" },
    );
    expect(noC.ok).toBe(false);
  });
});

describe("4. a refused request writes nothing - no invoice, credit, event, room or tenancy", () => {
  test("a request with no approver, or one not on the staff list, is refused before anything is written", async () => {
    await expect(applyTenancyChangeWith({} as any, { ...extension(), approvedBy: "" })).rejects.toThrow("Choose who approved the change.");
    await expect(applyTenancyChangeWith({} as any, { ...extension(), approvedBy: "Somebody" })).rejects.toThrow("Choose who approved the change.");
  });

  const nothingWritten = (db: ReturnType<typeof fakeDb>) => {
    expect(db.writes).toEqual([]);
    expect(db.rpcs.filter((r) => r !== "resident_placements")).toEqual([]);
  };

  test("an uploaded agreement without Schedule A, extended", async () => {
    const db = fakeDb(
      world([
        {
          agreement_id: A,
          doc_type: "agreement",
          version: 1,
          merge_values: { source: "uploaded" },
        },
      ]),
    );
    await expect(applyTenancyChangeWith(db.sb, extension())).rejects.toThrow(
      "uploaded as a signed paper agreement without its own Schedule A",
    );
    nothingWritten(db);
  });

  test("no agreement at all, extended", async () => {
    const db = fakeDb(world(null));
    await expect(applyTenancyChangeWith(db.sb, extension())).rejects.toThrow(
      "there is no tenancy agreement on record",
    );
    nothingWritten(db);
  });

  test("a renewal whose templates have no file", async () => {
    const db = fakeDb(world());
    const renewal = extension({ newEnd: "2028-06-30" });
    renewal.events[0]!.periodEnd = "2028-06-30";
    await expect(applyTenancyChangeWith(db.sb, renewal)).rejects.toThrow(
      "No file uploaded yet for:",
    );
    nothingWritten(db);
  });

  test("an accepted request reads everything - the documents included - before its first write", async () => {
    const db = fakeDb(world(), {}, { place_stay: () => ({ ok: true }) });
    // a security deposit to top up: the event gets an IP, so nothing settles in the test
    const out = await applyTenancyChangeWith(db.sb, extension({}, 100));
    expect(out.events).toMatchObject([
      { name: "Extension", date: "2027-07-01", ipTotal: 100, settled: false },
    ]);
    const first = db.log.findIndex((l) => !l.startsWith("read"));
    expect(db.log.lastIndexOf("read agreement_documents")).toBeLessThan(first);
    expect(db.log.lastIndexOf("read rental_schedules")).toBeLessThan(first);
    // the first write is the room held on for the longer stay, as before
    expect(db.log[first]).toBe("call rpc place_stay");
    // the event revises the agreement the preflight checked, and the request records what it will make
    const events = db.files[`tenancy-change/${R}/events.json`] as any[];
    expect(events[0]).toMatchObject({
      agreementId: A,
      rentBefore: 900,
      rent: 900,
      plan: { scheduleA: true },
    });
    const request = Object.entries(db.files).find(([p]) =>
      /tenancy-change\/[^/]+\/\d{4}-.*\.json$/.test(p),
    )?.[1] as any;
    expect(request.documents).toMatchObject([
      { document: "Schedule A", action: "revise", version: 2 },
    ]);
  });
});

describe("5-6. the official stay dates", () => {
  test("5. a paid stay is the tenancy's dates, whatever the bed, booking, hold and invoice say", async () => {
    const db = fakeDb(world());
    const stay = await officialStay(db.sb, { residentId: R });
    expect([stay.source, stay.tenancyId, stay.start, stay.end]).toEqual([
      "tenancy",
      T,
      "2026-07-01",
      "2027-06-30",
    ]);
  });

  test("5. Update Tenancy refuses an end date the window read from a copy", async () => {
    const db = fakeDb(world());
    // the bed and the booking both say 31 Dec 2027; the tenancy says 30 Jun 2027. The
    // request is otherwise whole - its event is on the day after the end it was shown
    const stale = extension({ oldEnd: "2027-12-31", newEnd: "2028-03-31" });
    stale.events[0] = { ...stale.events[0]!, date: "2028-01-01", periodEnd: "2028-03-31" };
    await expect(applyTenancyChangeWith(db.sb, stale)).rejects.toThrow(
      "The change was read differently - close the window and start again.",
    );
    expect(db.writes).toEqual([]);
  });

  test("5. a tenancy that is not this resident's is no stay of theirs", async () => {
    const w = world();
    w.tenancies[0]!.resident_id = "someone-else";
    const db = fakeDb(w);
    expect((await officialStay(db.sb, { residentId: R, tenancyId: T })).source).toBe("none");
  });

  test("6. an unpaid booking is its hold's dates, then its own", async () => {
    const w = world();
    w.tenancies = [];
    const db = fakeDb(w);
    const stay = await officialStay(db.sb, { residentId: R });
    expect([stay.source, stay.start, stay.end]).toEqual(["booking", "2026-09-01", "2028-01-31"]);
    expect(
      pickStay({ enquiry: { id: Q, move_in: "2026-08-01", move_out: "2027-12-31" }, hold: null }),
    ).toMatchObject({ start: "2026-08-01", end: "2027-12-31" });
  });

  test("the documents print the official dates and rent before any copy", () => {
    const ctx: MappingContext = {
      resident: { move_in: "2026-08-15" },
      enquiry: { move_out: "2027-12-31", monthly_rent: 600 },
      bed: { tenancy_start: "2026-08-01", tenancy_end: "2027-12-31", rent: 700 },
      room: { rent: 750 },
      unit: null,
      residence: null,
      tenancy: null,
      stay: { start: "2026-07-01", end: "2027-06-30" },
      rentInForce: 900,
    };
    const v = Object.fromEntries(
      testMappingFor(["tenancy_start", "tenancy_end", "monthly_rent"], ctx).map((r) => [
        r.key,
        r.value,
      ]),
    );
    expect(v).toEqual({
      tenancy_start: "1 Jul 2026",
      tenancy_end: "30 Jun 2027",
      monthly_rent: "900.00",
    });
    // neither known: the copies, as before
    const old = Object.fromEntries(
      testMappingFor(["tenancy_end", "monthly_rent"], {
        ...ctx,
        stay: null,
        rentInForce: null,
      }).map((r) => [r.key, r.value]),
    );
    expect(old).toEqual({ tenancy_end: "31 Dec 2027", monthly_rent: "700.00" });
  });
});

describe("7-8. the rent in force, and invoices left as issued", () => {
  const step = { id: "e1", from: "2027-01-01", oldRent: 800, newRent: 900, kind: "room" as const };

  test("7. the rent terms with their changes, each from its day", () => {
    // the rent terms hold the last rent; before the first change the rent is the one it replaced
    expect(rentInForceFrom({ monthly_rent: 900 }, [step], "2026-12-31").rent).toBe(800);
    expect(rentInForceFrom({ monthly_rent: 900 }, [step], "2027-01-01").rent).toBe(900);
    expect(rentInForceFrom({ monthly_rent: 900 }, [], "2026-12-31")).toEqual({
      rent: 900,
      hasSchedule: true,
    });
    expect(rentInForceFrom(null, [], "2026-12-31")).toEqual({ rent: 0, hasSchedule: false });
  });

  test("7. read from the database and the rent-change file - never the bed (700), booking (600) or invoice (650)", async () => {
    const db = fakeDb(world(), { [`tenancy-change/${R}/rent-step-${T}.json`]: { steps: [step] } });
    expect(await rentInForce(db.sb, R, T, "2026-12-31")).toEqual({ rent: 800, hasSchedule: true });
    expect(await rentInForce(db.sb, R, T, "2027-02-01")).toEqual({ rent: 900, hasSchedule: true });
  });

  test("8. neither reader reads or writes an invoice: what it was issued with stays", async () => {
    const db = fakeDb(world());
    await officialStay(db.sb, { residentId: R });
    await rentInForce(db.sb, R, T, "2027-01-01");
    expect(db.reads).not.toContain("invoices");
    expect(db.writes).toEqual([]);
    expect(world().invoices[0]).toMatchObject({
      tenancy_start: "2026-08-01",
      tenancy_end: "2027-12-31",
      monthly_rent: 650,
    });
  });
});

describe("9. before the start is a room change; after it, Update Tenancy - unchanged", () => {
  test("the official start decides it, as the tenancy's start did", async () => {
    const db = fakeDb(world());
    const { start } = await officialStay(db.sb, { residentId: R });
    expect(beforeTenancyStart(start, false, "2026-06-30")).toBe(true);
    expect(beforeTenancyStart(start, false, "2026-07-01")).toBe(false);
    expect(beforeTenancyStart(start, true, "2026-06-30")).toBe(false);
  });
});

describe("what an Update Tenancy change made stays while the change does (14 Oct 2026)", () => {
  // a stand-in database: one agreement, and its documents; any delete is recorded
  const fakeDb = (agreement: any, docs: any[]) => {
    const deleted: string[] = [];
    const q = (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        maybeSingle: async () => ({ data: agreement }),
        delete: () => {
          deleted.push(table);
          return chain;
        },
        then: (ok: any) => ok({ data: table === "agreement_documents" ? docs : [], error: null }),
      };
      return chain;
    };
    return { db: { from: q, storage: { from: () => ({ remove: async () => ({}) }) } }, deleted };
  };
  test("a second agreement is never reset away", async () => {
    const { resetDocumentPack } = await import("../src/lib/tenancy-docs.functions");
    const { db, deleted } = fakeDb({ id: "a2", resident_id: "r", kind: "renewal" }, [{ id: "d", doc_type: "agreement", status: "generated", version: 1 }]);
    await expect(resetDocumentPack(db, "a2")).rejects.toThrow(/Update Tenancy change/);
    expect(deleted).toEqual([]);
  });
  test("a first pack with a schedule the change revised is not reset either", async () => {
    const { resetDocumentPack } = await import("../src/lib/tenancy-docs.functions");
    const { db, deleted } = fakeDb({ id: "a1", resident_id: "r", kind: "initial" }, [
      { id: "d1", doc_type: "sched_a", status: "generated", version: 1 },
      { id: "d2", doc_type: "sched_a", status: "generated", version: 2 },
    ]);
    await expect(resetDocumentPack(db, "a1")).rejects.toThrow(/revised by an Update Tenancy change/);
    expect(deleted).toEqual([]);
  });
});
