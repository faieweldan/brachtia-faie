import { templateHeaders } from "@/lib/migration/upload-template";

/**
 * Add existing resident (Dani, 14 Oct 2026) - one pre-system resident typed in
 * by hand, as an alternative to the Sheet3 bulk upload.
 *
 * The form writes no rule of its own. Its answers become ONE Sheet3 row, under
 * the upload contract's own headers (templateHeaders, sheet3-contract.json),
 * and that row goes through the same check (previewSheet3Grid) and the same
 * import (importMigration -> importResident) as a row of the bulk file. So a
 * resident added here is checked, previewed and saved exactly as one uploaded
 * would be - tests/existing-resident.test.ts proves it.
 */
export type ExistingResidentInput = {
  quickbooksId: string;
  name: string;
  gender: string;
  /** a country code, e.g. MYS */
  nationality: string;
  nric: string;
  passport: string;
  /** "+60" */
  dial: string;
  mobile: string;
  email: string;
  residentType: string;
  /** a value from UNIVERSITY_OPTIONS, or the typed name when "Other" */
  university: string;
  referralSource: string;
  maritalStatus: string;
  race: string;
  religion: string;
  address: string;
  postcode: string;
  state: string;
  /** a country code */
  country: string;
  medicalCondition: string;
  medicalDetail: string;
  residence: string;
  unitNo: string;
  unitType: string;
  room: string;
  /** "Twin 1", "Twin 2", or "Single" (a single room's bed, or a twin room let whole) */
  bed: string;
  /** yyyy-mm-dd */
  tenancyStart: string;
  tenancyEnd: string;
  monthlyRent: string;
  /** a SCHEDULES value */
  schedule: string;
  paidBy: string;
  payorName: string;
  agreementNo: string;
  proratedRent: string;
  advanceRent: string;
  securityDeposit: string;
  utilitiesDeposit: string;
  accessCardDeposit: string;
  residentCardCharges: string;
  adminAgreementCharges: string;
  starterPack: string;
  totalPaid: string;
  taUrl: string;
  invoiceUrl: string;
  invoiceNo: string;
  photoUrl: string;
  idCopyUrl: string;
  offerLetterUrl: string;
};

export const emptyExistingResident = (): ExistingResidentInput => ({
  quickbooksId: "",
  name: "",
  gender: "",
  nationality: "MYS",
  nric: "",
  passport: "",
  dial: "+60",
  mobile: "",
  email: "",
  residentType: "student",
  university: "",
  referralSource: "",
  maritalStatus: "",
  race: "",
  religion: "",
  address: "",
  postcode: "",
  state: "",
  country: "MYS",
  medicalCondition: "no",
  medicalDetail: "",
  residence: "",
  unitNo: "",
  unitType: "",
  room: "",
  bed: "",
  tenancyStart: "",
  tenancyEnd: "",
  monthlyRent: "",
  schedule: "",
  paidBy: "Self",
  payorName: "",
  agreementNo: "",
  proratedRent: "",
  advanceRent: "",
  securityDeposit: "",
  utilitiesDeposit: "",
  accessCardDeposit: "",
  residentCardCharges: "",
  adminAgreementCharges: "",
  starterPack: "",
  totalPaid: "",
  taUrl: "",
  invoiceUrl: "",
  invoiceNo: "",
  photoUrl: "",
  idCopyUrl: "",
  offerLetterUrl: "",
});

/** The bulk file's Occupancy for a bed - the converter's own words (convert_batch.py). */
export const occupancyFor = (bed: string) => (/^twin/i.test(bed.trim()) ? "Twin Share" : bed ? "Single" : "");

/**
 * A migrated resident keeps their old TA number (Rina, 13 Oct 2026):
 * TA<tenancy start year>_<unit>_<QuickBooks ID>, e.g. TA2025_A-18-05_00724.
 */
export const defaultAgreementNo = (start: string, unitNo: string, quickbooksId: string) =>
  start && unitNo && quickbooksId ? `TA${start.slice(0, 4)}_${unitNo}_${quickbooksId}` : "";

/**
 * The QuickBooks invoice number from the invoice copy's link or name, as the
 * converter reads it from "INV:IP_00894.pdf" - INV:IP_00894. "" when it is not
 * in the link (a Drive link is an id), and admin types it.
 */
export function invoiceNoFrom(link: string) {
  const m = /INV[:_\-\s]?IP[_\-\s]?(\d{3,})/i.exec(decodeURIComponent(link || ""));
  return m ? `INV:IP_${m[1]}` : "";
}

/** the form's answers under the contract's column names - every other column stays blank */
function values(f: ExistingResidentInput): Record<string, string> {
  return {
    "Resident name": f.name,
    Gender: f.gender,
    "Country code": f.dial,
    "Mobile number": f.mobile,
    Email: f.email,
    Nationality: f.nationality,
    "Resident type": f.residentType,
    University: f.university,
    "Referral Source": f.referralSource,
    "NRIC number": f.nationality === "MYS" ? f.nric : "",
    "Passport number": f.nationality === "MYS" ? "" : f.passport,
    "Marital status": f.maritalStatus,
    Race: f.race,
    Religion: f.religion,
    Address: f.address,
    "Postal Code": f.postcode,
    "State / Region / Province": f.state,
    Country: f.country,
    "Medical Condition": f.medicalCondition,
    "Medical Condition - Remarks": f.medicalCondition === "yes" ? f.medicalDetail : "",
    Residence: f.residence,
    "Unit Type": f.unitType,
    Occupancy: occupancyFor(f.bed),
    "Tenancy Start": f.tenancyStart,
    "Tenancy End": f.tenancyEnd,
    "Monthly rent": f.monthlyRent,
    "Payment frequency": f.schedule,
    "Unit no.": f.unitNo,
    Room: f.room,
    Bed: f.bed,
    "Agreement No.": f.agreementNo,
    "Copy of Tenancy Agreement": f.taUrl,
    "Invoice No.": f.invoiceNo,
    "QuickBooks ID": f.quickbooksId,
    "First month rent - pro-rated x/x days": f.proratedRent,
    "Advance rental (RM)": f.advanceRent,
    "Security Deposit (RM) (refundable)": f.securityDeposit,
    "Utilities deposit (RM) (refundable)": f.utilitiesDeposit,
    "Access card deposit (refundable)": f.accessCardDeposit,
    "Resident card charges": f.residentCardCharges,
    "Admin + agreement charges": f.adminAgreementCharges,
    "Total Initial Payment": f.totalPaid,
    "Copy of Invoice": f.invoiceUrl,
    Photograph: f.photoUrl,
    "NRIC / Passport Copy": f.idCopyUrl,
    "Offer Letter": f.offerLetterUrl,
    "Add on: Starter pack": f.starterPack,
    "Paid by": f.paidBy,
    "Payor name": f.paidBy === "Self" ? "" : f.payorName,
  };
}

const key = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");

/** The form as a one-resident Sheet3: the contract's header row, then this resident. */
export function existingResidentGrid(f: ExistingResidentInput): string[][] {
  const headers = templateHeaders();
  const byKey = new Map(Object.entries(values(f)).map(([h, v]) => [key(h), v.trim()]));
  return [headers, headers.map((h) => byKey.get(key(h)) ?? "")];
}

/** Every column the form fills - a test checks each is a real contract column. */
export const formColumns = (f: ExistingResidentInput = emptyExistingResident()) => Object.keys(values(f));

/*
 * What the check says, read for someone filling the form in (Dani, 14 Oct
 * 2026). An empty form came back as a wall of red "Blocked" - correct, and
 * alarming to an admin who had only just started. The check's rules are not
 * touched: each of its fields is matched to the form box behind it, and an
 * issue on a box still empty is "still to fill", not a problem.
 */
type Box = keyof ExistingResidentInput;

/** the check's field name -> the form boxes behind it, and the box's label on the form */
const BEHIND: Record<string, { boxes: Box[]; label: string }> = {
  "quickbooks id": { boxes: ["quickbooksId"], label: "QuickBooks ID" },
  "resident name": { boxes: ["name"], label: "Full name" },
  email: { boxes: ["email"], label: "Email" },
  "country code": { boxes: ["dial"], label: "Mobile" },
  "mobile number": { boxes: ["mobile"], label: "Mobile" },
  "tenancy dates": { boxes: ["tenancyStart", "tenancyEnd"], label: "Tenancy start and end" },
  "tenancy end": { boxes: ["tenancyEnd"], label: "Tenancy end" },
  "stay duration": { boxes: ["tenancyStart", "tenancyEnd"], label: "Tenancy start and end" },
  "monthly rent": { boxes: ["monthlyRent"], label: "Monthly rent" },
  "payment frequency": { boxes: ["schedule"], label: "Payment frequency" },
  "next billing period": { boxes: ["tenancyStart", "tenancyEnd", "monthlyRent", "schedule"], label: "Tenancy and rent" },
  "copy of tenancy agreement": { boxes: ["taUrl"], label: "Tenancy agreement copy" },
  "copy of invoice": { boxes: ["invoiceUrl"], label: "Initial invoice copy" },
  "unit no.": { boxes: ["residence", "unitNo"], label: "Room" },
  room: { boxes: ["room"], label: "Room" },
  bed: { boxes: ["residence", "unitNo", "room", "bed"], label: "Room" },
};

/** the application documents: missing is never a problem - uploaded on the profile later */
const LATER = ["passport size photo", "university offer / admission letter", "nric", "mykad", "passport copy"];

export type ReadIssues = {
  /** form labels of boxes still empty that the check needs - grey, a to-do */
  toFill: string[];
  /** filled in, and wrong - red, as the check says */
  problems: { level: "warning" | "blocked"; field: string; message: string }[];
  /** documents that can come later */
  later: string[];
};

export function readIssues(
  issues: { level: "warning" | "blocked"; field: string; message: string }[],
  f: ExistingResidentInput,
): ReadIssues {
  const toFill = new Set<string>();
  const later: string[] = [];
  const problems: ReadIssues["problems"] = [];
  for (const issue of issues) {
    const field = issue.field.trim().toLowerCase();
    const behind = BEHIND[field];
    if (behind && behind.boxes.some((b) => !String(f[b] ?? "").trim())) {
      toFill.add(behind.label);
      continue;
    }
    if (issue.level === "warning" && LATER.some((d) => field.includes(d)) && /no document link/i.test(issue.message)) {
      later.push(issue.field);
      continue;
    }
    problems.push(issue);
  }
  return { toFill: [...toFill], problems, later };
}
