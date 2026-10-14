import { describe, expect, test } from "bun:test";

import contract from "../src/lib/migration/sheet3-contract.json";
import {
  defaultAgreementNo,
  emptyExistingResident,
  existingResidentGrid,
  formColumns,
  invoiceNoFrom,
  type ExistingResidentInput,
} from "../src/lib/migration/existing-resident";
import { previewSheet3Grid } from "../src/lib/migration/sheet3";
import type { Resident, Unit } from "../src/lib/ops-store";

/*
 * Add existing resident (Dani, 14 Oct 2026): the form is another way in to the
 * bulk upload, never a second set of rules. The same resident typed into the
 * form and written as one Sheet3 row must give the same check - status,
 * issues, and the record the import saves.
 */

const unit = {
  id: "unit-1",
  residenceId: "residence-1",
  residenceName: "The Arc, Cyberjaya",
  unitNo: "A-12-10",
  rooms: [
    { id: "room-1", letter: "C", occupancy: "twin", beds: [{ id: "bed-1", label: "Twin 1", status: "vacant" }, { id: "bed-2", label: "Twin 2", status: "vacant" }] },
  ],
} as unknown as Unit;
const system = { units: [unit], residents: [] as Resident[], today: "2026-10-14" };

// one resident, as the bulk file writes them - its own spellings
const bulkRow: Record<string, unknown> = {
  "Resident Name": "Test Person",
  Gender: "Female",
  "Country Code": "+91",
  "Mobile Number": "9855075409",
  Email: "test.person@example.test",
  Nationality: "IND",
  "Passport number": "Z1234567",
  University: "MMU",
  "Resident Type": "student",
  "Referral Source": "University",
  "Marital status": "Single",
  Race: "Other",
  Religion: "Other",
  Address: "1 Test Street",
  "Postal Code": "12345",
  "State / Region / Province": "Punjab",
  Country: "IND",
  "Medical Condition": "no",
  Residence: "The Arc, Cyberjaya",
  "Unit no. ": "A-12-10",
  "Unit Type": "3-bedroom",
  Room: "C",
  Bed: "Twin 1",
  Occupancy: "Twin Share",
  "Tenancy Start": "2026-09-14",
  "Tenancy End": "2027-06-30",
  "Monthly rent": "400",
  "Payment frequency": "monthly",
  "QuickBooks ID": "00894",
  "Agreement No.": "TA2026_A-12-10_00894",
  "First month rent - pro-rated x/x days": "226.67",
  "Advance rental (RM)": "400",
  "Security Deposit (RM) (refundable) ": "800",
  "Utilities deposit (RM) (refundable) ": "200",
  "Access card deposit (refundable)": "50",
  "Resident card charges": "20",
  "Admin + agreement charges": "200",
  "Total Initial Payment": "1896.67",
  "Copy of Tenancy Agreement": "https://example.test/ta.pdf",
  "Copy of Invoice": "https://example.test/INV:IP_00894.pdf",
  "Invoice No.": "INV:IP_00894",
  Photograph: "https://example.test/photo.jpg",
  "NRIC / Passport Copy": "https://example.test/passport.pdf",
  "Offer Letter": "",
  "Paid by": "Self",
};
const bulkGrid = () => {
  const headers = Object.keys(bulkRow);
  return [headers, headers.map((h) => bulkRow[h])];
};

// the same resident, typed into the form
const form: ExistingResidentInput = {
  ...emptyExistingResident(),
  quickbooksId: "00894",
  name: "Test Person",
  gender: "Female",
  nationality: "IND",
  passport: "Z1234567",
  dial: "+91",
  mobile: "9855075409",
  email: "test.person@example.test",
  university: "MMU",
  referralSource: "University",
  maritalStatus: "Single",
  race: "Other",
  religion: "Other",
  address: "1 Test Street",
  postcode: "12345",
  state: "Punjab",
  country: "IND",
  residence: "The Arc, Cyberjaya",
  unitNo: "A-12-10",
  unitType: "3-bedroom",
  room: "C",
  bed: "Twin 1",
  tenancyStart: "2026-09-14",
  tenancyEnd: "2027-06-30",
  monthlyRent: "400",
  schedule: "monthly",
  agreementNo: defaultAgreementNo("2026-09-14", "A-12-10", "00894"),
  proratedRent: "226.67",
  advanceRent: "400",
  securityDeposit: "800",
  utilitiesDeposit: "200",
  accessCardDeposit: "50",
  residentCardCharges: "20",
  adminAgreementCharges: "200",
  totalPaid: "1896.67",
  taUrl: "https://example.test/ta.pdf",
  invoiceUrl: "https://example.test/INV:IP_00894.pdf",
  invoiceNo: invoiceNoFrom("https://example.test/INV:IP_00894.pdf"),
  photoUrl: "https://example.test/photo.jpg",
  idCopyUrl: "https://example.test/passport.pdf",
};

const strip = (row: any) => {
  const { sourceRow: _s, ...rest } = row;
  void _s;
  return rest;
};

describe("Add existing resident = one row of the bulk upload", () => {
  test("the same resident gives the same check, issues and saved record", () => {
    const fromBulk = previewSheet3Grid(bulkGrid(), system);
    const fromForm = previewSheet3Grid(existingResidentGrid(form), system);
    expect(fromForm.missingHeaders).toEqual([]);
    expect(fromForm.rows).toHaveLength(1);
    expect(strip(fromForm.rows[0])).toEqual(strip(fromBulk.rows[0]));
    // a missing offer letter is a warning, never a block (uploaded on the profile later)
    expect(fromForm.rows[0]!.status).toBe("warning");
  });

  test("a missing TA copy blocks, from the form as from the file", () => {
    const row = previewSheet3Grid(existingResidentGrid({ ...form, taUrl: "" }), system).rows[0]!;
    expect(row.status).toBe("blocked");
    expect(row.issues.some((i) => i.field === "Copy of Tenancy Agreement")).toBe(true);
  });

  test("Single in a twin room takes the room whole, as the bulk file does", () => {
    const row = previewSheet3Grid(existingResidentGrid({ ...form, bed: "Single" }), system).rows[0]!;
    expect(row.wholeRoom).toBe(true);
    expect(row.record.occupancy).toBe("Single");
  });

  test("every column the form fills is a real upload column", () => {
    const key = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");
    const contractKeys = new Set((contract.columns as { sheet3: string }[]).map((c) => key(c.sheet3)));
    expect(formColumns().filter((c) => !contractKeys.has(key(c)))).toEqual([]);
  });

  test("the agreement number and the invoice number follow the migration rules", () => {
    expect(defaultAgreementNo("2025-01-05", "A-18-05", "00724")).toBe("TA2025_A-18-05_00724");
    expect(invoiceNoFrom("https://drive.example/INV:IP_00894.pdf")).toBe("INV:IP_00894");
    expect(invoiceNoFrom("https://drive.google.com/file/d/abc123/view")).toBe("");
  });
});

describe("the beds a placement can be written as", () => {
  test("an empty twin room offers its beds and Single (whole room); a single room its bed", async () => {
    const { placementBedOptions, bedForPlacement } = await import("../src/lib/room-offer");
    const twin = { occupancy: "twin", beds: [{ label: "Twin 1", status: "vacant" }, { label: "Twin 2", status: "vacant" }] };
    expect(placementBedOptions(twin).map((o) => o.value)).toEqual(["Twin 1", "Twin 2", "Single"]);
    // and every answer offered is one bedForPlacement reads
    for (const o of placementBedOptions(twin)) expect(bedForPlacement(twin, o.value)).toBeDefined();
    const taken = { ...twin, beds: [{ label: "Twin 1", status: "active" }, { label: "Twin 2", status: "vacant" }] };
    expect(placementBedOptions(taken).map((o) => o.value)).toEqual(["Twin 1", "Twin 2"]);
    expect(placementBedOptions({ occupancy: "single", beds: [{ label: "Single", status: "vacant" }] }).map((o) => o.value)).toEqual(["Single"]);
  });
});
