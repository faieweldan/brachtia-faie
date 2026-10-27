/**
 * Tenancy documents — shared shapes for the Tenancy tab.
 *
 * Kept apart from the server functions so the page can read the types and the
 * status lists without pulling database code into the browser.
 */

export type AgreementDocType = "agreement" | "sched_a" | "sched_b" | "sched_c";

export type AgreementDoc = {
  id: string;
  agreementId: string;
  docType: AgreementDocType;
  version: number;
  status: string;
  effectiveDate: string;
  periodStart: string;
  periodEnd: string;
  mergeValues: Record<string, string>;
  supersedes?: string;
  createdAt: string;
  /** Schedule C: where the move-in check is - open, review, returned, submitted, signed */
  stage?: string;
};

export type TenancyAgreement = {
  id: string;
  residentId: string;
  tenancyId?: string;
  agreementNo: string;
  kind: string;
  createdAt: string;
  documents: AgreementDoc[];
};

export type AccessCardForm = {
  id: string;
  residentId: string;
  reason: string;
  cardNo: string;
  status: string;
  formDate: string;
  createdAt: string;
};

export const DOC_TYPE_LABELS: Record<AgreementDocType, string> = {
  agreement: "General Terms",
  sched_a: "Schedule A – Particulars",
  sched_b: "Schedule B – House Rules & Additional Charges",
  sched_c: "Schedule C – Inventory & Condition Record",
};

/**
 * Schedule C marked not needed (Dani, 27 Oct 2026): some residents skip the
 * move-in check. Kept on the document itself - { reason, at } in merge_values -
 * so the Tenancy tab, the signing link, the full agreement and the work queue
 * all read the one fact.
 */
export function notNeeded(mergeValues: unknown): { reason: string; at: string } | null {
  const v = (mergeValues as Record<string, any> | null)?.["not_needed"];
  return v && typeof v === "object" ? { reason: String(v.reason ?? ""), at: String(v.at ?? "") } : null;
}

export const DOC_STATUSES = [
  { key: "generated", label: "Generated" },
  { key: "pending_signature", label: "Pending Signature" },
  { key: "signed", label: "Signed" },
  { key: "pending_stamping", label: "Pending Stamping" },
  { key: "stamped", label: "Stamped" },
];

export const ACCESS_CARD_REASONS = [
  "Initial Tenancy",
  "Lost Card",
  "Damaged Card",
  "Unit Change",
  "Other",
];

export const ACCESS_CARD_STATUSES = [
  // since 2 Oct 2026: made by Brachtia, waiting for ARC; then Active with ARC's receipt and the serial number
  { key: "pending_approval", label: "Pending Approval" },
  { key: "active", label: "Active" },
  { key: "generated", label: "Form Generated" },
  // the resident signed it on their signing page (30 Sep 2026)
  { key: "signed", label: "Signed" },
  { key: "submitted", label: "Submitted" },
  { key: "received", label: "Card Received" },
  { key: "issued", label: "Issued" },
];

/** an issued card can later come back or be reported lost/damaged */
export const ACCESS_CARD_END_STATES = [
  { key: "returned", label: "Returned" },
  { key: "lost", label: "Lost" },
  { key: "damaged", label: "Damaged" },
];

/**
 * The merge fields every document in the pack is built from. The document-pack
 * screen shows the ones each document needs; the snapshot of all of them is
 * stored on every document version so later profile edits never change an
 * issued document.
 */
export const MERGE_FIELDS: { key: string; label: string }[] = [
  { key: "agreement_date", label: "Agreement date" },
  { key: "resident_name", label: "Resident full name" },
  { key: "id_number", label: "NRIC / Passport" },
  { key: "residence", label: "Residence" },
  { key: "unit_no", label: "Unit no." },
  { key: "room", label: "Room" },
  { key: "bed", label: "Bed" },
  { key: "tenancy_start", label: "Tenancy start" },
  { key: "tenancy_end", label: "Tenancy end" },
  { key: "monthly_rent", label: "Monthly rental" },
  { key: "payment_schedule", label: "Payment schedule" },
  { key: "deposit", label: "Security deposit" },
];

/** which merge fields each document asks for on the data-review column */
export const DOC_FIELDS: Record<AgreementDocType | "access_card", string[]> = {
  agreement: [
    "agreement_date",
    "resident_name",
    "id_number",
    "residence",
    "unit_no",
    "room",
    "bed",
    "tenancy_start",
    "tenancy_end",
    "monthly_rent",
    "payment_schedule",
    "deposit",
  ],
  sched_a: [
    "resident_name",
    "id_number",
    "residence",
    "unit_no",
    "room",
    "bed",
    "tenancy_start",
    "tenancy_end",
    "monthly_rent",
    "payment_schedule",
    "deposit",
  ],
  sched_b: ["resident_name", "residence", "unit_no", "room"],
  sched_c: ["resident_name", "residence", "unit_no", "room", "bed", "tenancy_start"],
  access_card: ["resident_name", "id_number", "residence", "unit_no", "room", "tenancy_start"],
};
