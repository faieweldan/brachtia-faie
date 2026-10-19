import { describe, expect, test } from "bun:test";

import { migratedRentTerms } from "../src/lib/migration/import-plan";
import { previewSheet3Grid } from "../src/lib/migration/sheet3";
import type { Resident, Unit } from "../src/lib/ops-store";

const headers = [
  "Next billing period",
  "Next payment due",
  "Next payment amount",
  "Resident Name",
  "Gender",
  "Country Code",
  "Mobile Number",
  "Email",
  "Nationality",
  "Referral Source",
  "Marital status",
  "Race",
  "Religion",
  "Address",
  "Postal Code",
  "State / Region / Province",
  "Country",
  "Medical Condition",
  "Medical Condition - Remarks",
  "Residence",
  "Unit no. ",
  "Room",
  "Bed",
  "Tenancy Start",
  "Tenancy End",
  "Monthly rent",
  "Payment frequency",
  "QuickBooks ID",
  "First month rent - pro-rated x/x days",
  "Advance rental (RM)",
  "Security Deposit (RM) (refundable) ",
  "Utilities deposit (RM) (refundable) ",
  "Access card deposit (refundable)",
  "Resident card charges",
  "Admin + agreement charges",
  "Total Initial Payment",
  "Copy of Tenancy Agreement",
  "Copy of Invoice",
  "Photograph",
  "NRIC / Passport Copy",
  "Offer Letter",
];

const base: Record<string, unknown> = {
  "Resident Name": "Vedanta Nanda",
  Gender: "Female",
  "Country Code": "(+91)",
  "Mobile Number": "9855075409",
  Email: "vedanta@example.test",
  Nationality: "IND",
  "Referral Source": "University",
  "Marital status": "Single",
  Race: "Other",
  Religion: "Other",
  Address: "1 Test Street",
  "Postal Code": "12345",
  "State / Region / Province": "Punjab",
  Country: "India",
  "Medical Condition": "No",
  "Medical Condition - Remarks": "",
  Residence: "The Arc, Cyberjaya",
  "Unit no. ": "A-12-10",
  Room: "C",
  Bed: "Twin 1",
  "Tenancy Start": "2026-09-14",
  "Tenancy End": "2027-06-30",
  "Monthly rent": 400,
  "Payment frequency": "Monthly",
  "QuickBooks ID": "00894",
  "First month rent - pro-rated x/x days": 226.67,
  "Advance rental (RM)": 400,
  "Security Deposit (RM) (refundable) ": 800,
  "Utilities deposit (RM) (refundable) ": 200,
  "Access card deposit (refundable)": 50,
  "Resident card charges": 20,
  "Admin + agreement charges": 200,
  "Total Initial Payment": 5000,
  "Copy of Tenancy Agreement": "https://example.test/ta.pdf",
  "Copy of Invoice": "https://example.test/invoice.pdf",
  Photograph: "https://example.test/photo.jpg",
  "NRIC / Passport Copy": "https://example.test/passport.pdf",
  "Offer Letter": "https://example.test/offer.pdf",
};

const unit = {
  id: "unit-1",
  residenceId: "residence-1",
  residenceName: "The Arc, Cyberjaya",
  unitNo: "A-12-10",
  rooms: [
    {
      id: "room-1",
      letter: "C",
      beds: [{ id: "bed-1", label: "Twin 1", status: "vacant" }],
    },
  ],
} as unknown as Unit;

function grid(...changes: Record<string, unknown>[]) {
  const rows = changes.length ? changes : [{}];
  return [
    headers,
    ...rows.map((change) => headers.map((header) => ({ ...base, ...change })[header] ?? "")),
  ];
}

const preview = (input: unknown[][], residents: Resident[] = []) =>
  previewSheet3Grid(input, { units: [unit], residents });

describe("Migration 1 Sheet3 readiness", () => {
  test("blank migration charge cells become zero", () => {
    const result = preview(
      grid({
        "First month rent - pro-rated x/x days": "",
        "Access card deposit (refundable)": "",
      }),
    );
    expect(result.rows[0]!.charges.proratedRent).toBe(0);
    expect(result.rows[0]!.charges.accessCardDeposit).toBe(0);
    expect(result.rows[0]!.issues.some((issue) => /blank/i.test(issue.message))).toBe(false);
  });

  test("an initial invoice total with extra lines is not treated as a mismatch", () => {
    const result = preview(grid({ "Total Initial Payment": 9999 }));
    expect(
      result.rows[0]!.issues.some((issue) => /reconcil|mismatch|total/i.test(issue.message)),
    ).toBe(false);
  });

  test("October endings stay in Migration 1, but September endings do not", () => {
    const october = preview(grid({ "Tenancy End": "2026-10-31" }));
    const september = preview(grid({ "Tenancy End": "2026-09-30" }));
    expect(october.rows[0]!.issues.some((issue) => issue.field === "Tenancy End")).toBe(false);
    expect(september.rows[0]!.issues.some((issue) => issue.field === "Tenancy End")).toBe(true);
  });

  test("pro-rated rent and advance rent both move the next billing period forward", () => {
    const result = preview(grid());
    expect(result.rows[0]!.nextBillingPeriod).toBe("01 Nov 2026 – 30 Nov 2026");
    expect(result.rows[0]!.nextPaymentAmount).toBe(400);
  });

  test("Other is a complete Race and Religion answer", () => {
    const result = preview(grid());
    expect(
      result.rows[0]!.issues.some((issue) => issue.field === "Race" || issue.field === "Religion"),
    ).toBe(false);
  });

  test("application details and document links are carried into the import record", () => {
    const result = preview(grid());
    expect(result.rows[0]!.record).toMatchObject({
      referralSource: "University",
      maritalStatus: "Single",
      race: "Other",
      religion: "Other",
      address: "1 Test Street",
      postcode: "12345",
      state: "Punjab",
      country: "India",
      medicalCondition: "no",
    });
    expect(result.rows[0]!.record.documents.map((document) => [document.key, document.url])).toEqual([
      ["photo", "https://example.test/photo.jpg"],
      ["id", "https://example.test/passport.pdf"],
      ["offer", "https://example.test/offer.pdf"],
    ]);
  });

  test("a missing application document is a warning - uploaded on the profile later", () => {
    const result = preview(grid({ Photograph: "" }));
    expect(result.rows[0]!.status).toBe("warning");
    expect(result.rows[0]!.issues.some((issue) => issue.field === "Passport size photo")).toBe(true);
  });

  test("an unknown country code blocks the row", () => {
    const result = preview(grid({ "Country Code": "+999" }));
    expect(result.rows[0]!.status).toBe("blocked");
    expect(result.rows[0]!.issues.some((issue) => issue.field === "Country Code")).toBe(true);
  });

  test("two residents cannot claim the same bed for overlapping dates", () => {
    const result = preview(
      grid(
        {},
        { "QuickBooks ID": "00895", Email: "other@example.test", "Resident Name": "Other Person" },
      ),
    );
    expect(result.totals.blocked).toBe(2);
    expect(result.rows[1]!.issues.some((issue) => /overlapping dates/i.test(issue.message))).toBe(
      true,
    );
  });

  test("an existing QuickBooks ID is shown as an update, not a duplicate resident", () => {
    const resident = {
      id: "resident-1",
      quickbooksId: "00894",
      email: "vedanta@example.test",
      fullName: "Vedanta Nanda",
    } as Resident;
    const result = preview(grid(), [resident]);
    expect(result.rows[0]!.action).toBe("Update resident");
    expect(result.rows[0]!.status).toBe("ready");
  });
});

import { nextRentAfter } from "../src/lib/rental-schedule";

describe("next rent of an existing resident - Brachtia's whole-month rule (15 Oct 2026)", () => {
  const today = "2026-10-15";
  test("00075: in 3 Sep, no pro-rated, 1,500 advance at 750 = Sep-Oct paid; next Nov-Dec 1,500", () => {
    expect(
      nextRentAfter({ tenancyStart: "2026-09-03", tenancyEnd: "2027-04-30", frequency: "bimonthly", monthlyRent: 750, proratedRent: 0, advanceRent: 1500, today }),
    ).toMatchObject({ start: "2026-11-01", end: "2026-12-31", due: "2026-11-05", amount: 1500 });
  });
  test("00857: pro-rated pays Jan (429.02 - never compared to the sen), advance pays Feb; next Nov-Dec 1,400", () => {
    expect(
      nextRentAfter({ tenancyStart: "2026-01-13", tenancyEnd: "2026-12-31", frequency: "bimonthly", monthlyRent: 700, proratedRent: 429.02, advanceRent: 700, today }),
    ).toMatchObject({ start: "2026-11-01", due: "2026-11-05", amount: 1400 });
  });
  test("00917: the last month is charged in full, not by days", () => {
    expect(
      nextRentAfter({ tenancyStart: "2026-04-23", tenancyEnd: "2026-11-22", frequency: "monthly", monthlyRent: 450, proratedRent: 120, advanceRent: 450, today }),
    ).toMatchObject({ start: "2026-11-01", end: "2026-11-22", amount: 450, finalAmount: 450 });
  });
  test("a last cycle shorter than the frequency is billed for its whole months", () => {
    // every 2 months from Nov; the tenancy ends in January - Jan alone is the last bill
    expect(
      nextRentAfter({ tenancyStart: "2026-09-01", tenancyEnd: "2027-01-31", frequency: "bimonthly", monthlyRent: 500, proratedRent: 0, advanceRent: 1000, today }),
    ).toMatchObject({ start: "2026-11-01", amount: 1000, finalAmount: 500 });
  });
  test("nothing left when the tenancy ends in the current cycle", () => {
    expect(
      nextRentAfter({ tenancyStart: "2025-11-01", tenancyEnd: "2026-10-31", frequency: "monthly", monthlyRent: 350, proratedRent: 0, advanceRent: 350, today }),
    ).toBeNull();
  });
});

describe("Brachtia admin's next payment wins (15 Oct 2026)", () => {
  const today = { today: "2026-10-15" };
  const run = (change: Record<string, unknown>) =>
    previewSheet3Grid(grid(change), { units: [unit], residents: [], ...today }).rows[0]!;

  test("blank cells: the worked-out figures are used", () => {
    const row = run({ "Next payment due": "", "Next payment amount": "" });
    expect(row.nextPaymentDue).toBe("2026-11-05");
    expect(row.nextPaymentAmount).toBe(400);
  });

  test("filled cells win, and the difference is shown as a warning", () => {
    const row = run({ "Next payment due": "2026-12-05", "Next payment amount": 800 });
    expect(row.nextPaymentDue).toBe("2026-12-05");
    expect(row.nextPaymentAmount).toBe(800);
    expect(row.issues.some((i) => i.field === "Next payment amount" && i.level === "warning")).toBe(true);
    expect(row.issues.some((i) => i.field === "Next payment due" && i.level === "warning")).toBe(true);
  });

  test("the same figures as the system raise nothing", () => {
    const row = run({ "Next payment due": "2026-11-05", "Next payment amount": 400 });
    expect(row.issues.some((i) => i.field.startsWith("Next payment"))).toBe(false);
  });

  // 00598 Tahura: Brachtia checked QuickBooks - next bill is Nov-Dec, the system worked out Dec-Jan (19 Oct 2026)
  test("Brachtia's next billing period starts the schedule, so later bills follow it", () => {
    const row = run({
      "Tenancy Start": "2026-09-01", "Tenancy End": "2027-08-31", "Payment frequency": "Bi-monthly",
      "Monthly rent": 800, "First month rent - pro-rated x/x days": 77.42, "Advance rental (RM)": 1600,
      "Next billing period": "01 Nov 2026 – 31 Dec 2026", "Next payment due": "2026-11-05", "Next payment amount": 1600,
    });
    expect([row.nextPeriodStart, row.nextPeriodEnd]).toEqual(["2026-11-01", "2026-12-31"]);
    expect(row.issues.some((i) => i.field === "Next billing period" && i.level === "warning")).toBe(true);
    expect(migratedRentTerms(row, "2026-10-15")).toMatchObject({
      first_period_start: "2026-11-01", first_period_end: "2026-12-31", first_due_date: "2026-11-05", final_amount: 1600,
    });
  });

  test("\"Paid to the end of the tenancy\" in Sheet3 makes no rent schedule", () => {
    const row = run({ "Next billing period": "Paid to the end of the tenancy", "Next payment due": "", "Next payment amount": "" });
    expect(migratedRentTerms(row, "2026-10-15")).toBeNull();
  });
});
