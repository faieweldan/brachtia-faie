import { describe, expect, test } from "bun:test";

import { previewSheet3Grid } from "../src/lib/migration/sheet3";
import type { Resident, Unit } from "../src/lib/ops-store";

const headers = [
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

  test("a missing application document blocks the resident", () => {
    const result = preview(grid({ Photograph: "" }));
    expect(result.rows[0]!.status).toBe("blocked");
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

describe("next rent of an existing resident (Dani, 12 Oct 2026)", () => {
  const base = { tenancyEnd: "2027-08-31", monthlyRent: 330, advance: 330, today: "2026-10-12" };
  test("bi-monthly from Sep 2025, one month advance: cycles are Oct-Nov, Dec-Jan; Oct-Nov 2026 is paid", () => {
    expect(nextRentAfter({ ...base, tenancyStart: "2025-09-01", frequency: "bimonthly" }))
      .toEqual({ start: "2026-12-01", end: "2027-01-31", due: "2026-12-05", amount: 660 });
  });
  test("monthly: next month", () => {
    expect(nextRentAfter({ ...base, tenancyStart: "2025-09-01", frequency: "monthly" })?.start).toBe("2026-11-01");
  });
  test("a stay that starts later bills its first period as usual", () => {
    expect(nextRentAfter({ ...base, tenancyStart: "2026-11-01", frequency: "monthly", advance: 330 })?.start).toBe("2026-12-01");
  });
  test("nothing left when the tenancy ends in the current period", () => {
    expect(nextRentAfter({ ...base, tenancyStart: "2025-09-01", tenancyEnd: "2026-10-31", frequency: "monthly" })).toBeNull();
  });
});
