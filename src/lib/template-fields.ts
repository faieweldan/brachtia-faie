/**
 * The values a document template may use, where each comes from, and how a
 * version's placeholders are mapped to them (a record field, a formula, or
 * left blank). Shared by the Templates workspace and the server.
 */

import { COUNTRIES, SCHEDULES } from "@/lib/reference-data";
import { stayLength } from "@/lib/stay-length";

export type FieldSource = "Resident Record" | "Booking Record" | "Initial Payment" | "Room Record" | "Tenancy Record" | "Signatory" | "Other";
export const FIELD_SOURCES: FieldSource[] = ["Resident Record", "Booking Record", "Initial Payment", "Room Record", "Tenancy Record", "Signatory", "Other"];

export type MappingContext = {
  resident: Record<string, any> | null;
  enquiry: Record<string, any> | null;
  bed: Record<string, any> | null;
  room: Record<string, any> | null;
  unit: Record<string, any> | null;
  residence: Record<string, any> | null;
  tenancy: Record<string, any> | null;
  agreement?: Record<string, any> | null;
  /** who signs for Brachtia - Settings → Signatory */
  signatory?: { name: string; title: string; token: string } | null;
};

export type TemplateField = {
  key: string;
  label: string;
  source: FieldSource;
  get: (c: MappingContext) => unknown;
};

const fmtDate = (v: unknown) => {
  if (!v) return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const rent = (c: MappingContext) => c.bed?.["rent"] ?? c.room?.["rent"] ?? c.enquiry?.["monthly_rent"] ?? "";
const start = (c: MappingContext) => c.tenancy?.["start_date"] ?? c.bed?.["tenancy_start"] ?? c.resident?.["move_in"];
const end = (c: MappingContext) => c.tenancy?.["end_date"] ?? c.bed?.["tenancy_end"] ?? c.enquiry?.["move_out"];
const r = (k: string) => (c: MappingContext) => c.resident?.[k];
/** The resident has uploaded this document (a key from resident-documents). */
const hasDoc = (c: MappingContext, key: string) =>
  Array.isArray(c.resident?.["docs"]) && (c.resident!["docs"] as any[]).some((d) => d?.key === key && d?.path);
const e = (k: string) => (c: MappingContext) => c.enquiry?.[k];

/*
 * An amount as the agreement prints it: 800.00, with no "RM". The templates
 * write "RM" themselves, right before the placeholder - "RM{{Security_deposit}}"
 * - so a value that brought its own printed "RM RM 800.00" (29 Sep 2026).
 */
const money = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** A country as a person reads it - "Belgium", not the "BEL" the record keeps. */
const countryName = (v: unknown) => {
  const code = String(v ?? "").trim();
  return COUNTRIES.find((c) => c.code === code.toUpperCase())?.name ?? code;
};

/** A payment cycle in words - "Bi-monthly (every 2 months)", not "bimonthly". */
const scheduleName = (v: unknown) => {
  const value = String(v ?? "").trim();
  return SCHEDULES.find((s) => s.value === value)?.label ?? value;
};

/** The saved quote's first-payment lines, e.g. "Security deposit (2 months)". */
const payLines = (c: MappingContext): { label: string; amount: number }[] =>
  (c.enquiry?.["quote_snapshot"] as any)?.quote?.firstPayment ?? [];
/** Amount of the first-payment line whose label starts with `prefix`. */
const payLine = (prefix: string) => (c: MappingContext) =>
  money(payLines(c).find((l) => String(l.label).startsWith(prefix))?.amount);

/**
 * Inclusions/exclusions from the residence's rental_terms, picked by rental
 * type: whole-unit rentals use the "unit" lists, room rentals the "room" lists.
 */
const DEFAULT_RENTAL_TERMS: Record<string, { included: string[]; excluded: string[] }> = {
  room: { included: ["Wi-Fi", "Monthly Basic Common Area Cleaning", "Sewerage Charges"], excluded: ["Electricity", "Water Charges"] },
  unit: { included: ["Wi-Fi"], excluded: ["Monthly Basic Common Area Cleaning", "Electricity", "Water", "Sewerage Charges"] },
};
const rentalTermList = (c: MappingContext, part: "included" | "excluded") => {
  const terms = (c.residence?.["rental_terms"] as any) ?? DEFAULT_RENTAL_TERMS;
  const kind: "room" | "unit" = c.unit?.["whole_unit"] ? "unit" : "room";
  const list = terms?.[kind]?.[part] ?? DEFAULT_RENTAL_TERMS[kind]![part];
  return Array.isArray(list) ? list.join(", ") : "";
};

export const TEMPLATE_FIELDS: TemplateField[] = [
  // — Resident Record: everything on the profile —
  { key: "resident_full_name", label: "Full name", source: "Resident Record", get: r("full_name") },
  { key: "passport_no", label: "NRIC / Passport no.", source: "Resident Record", get: r("id_number") },
  { key: "resident_id", label: "Resident ID", source: "Resident Record", get: r("resident_code") },
  { key: "email", label: "Email", source: "Resident Record", get: r("email") },
  { key: "mobile", label: "Mobile", source: "Resident Record", get: r("mobile") },
  { key: "nationality", label: "Nationality", source: "Resident Record", get: (c) => countryName(c.resident?.["nationality"]) },
  { key: "gender", label: "Gender", source: "Resident Record", get: r("gender") },
  { key: "dob", label: "Date of birth", source: "Resident Record", get: (c) => fmtDate(c.resident?.["dob"]) },
  { key: "marital_status", label: "Marital status", source: "Resident Record", get: r("marital_status") },
  { key: "race", label: "Race", source: "Resident Record", get: r("race") },
  { key: "religion", label: "Religion", source: "Resident Record", get: r("religion") },
  { key: "address", label: "Address", source: "Resident Record", get: r("address") },
  { key: "postcode", label: "Postcode", source: "Resident Record", get: r("postcode") },
  { key: "state", label: "State", source: "Resident Record", get: r("state") },
  { key: "country", label: "Country", source: "Resident Record", get: (c) => countryName(c.resident?.["country"]) },
  { key: "university", label: "University", source: "Resident Record", get: r("university") },
  { key: "level_of_study", label: "Level of study", source: "Resident Record", get: r("level_of_study") },
  { key: "course", label: "Course", source: "Resident Record", get: r("course") },
  { key: "student_id", label: "Student ID", source: "Resident Record", get: r("student_id") },
  { key: "graduation_year", label: "Graduation year", source: "Resident Record", get: r("graduation_year") },
  { key: "sponsor", label: "Sponsor", source: "Resident Record", get: r("sponsor") },
  { key: "company", label: "Company", source: "Resident Record", get: r("company") },
  { key: "occupation", label: "Occupation", source: "Resident Record", get: r("occupation") },
  { key: "industry", label: "Industry", source: "Resident Record", get: r("industry") },
  { key: "employment_type", label: "Employment type", source: "Resident Record", get: r("employment_type") },
  { key: "ec_name", label: "Emergency contact name", source: "Resident Record", get: r("ec_name") },
  { key: "ec_relationship", label: "Emergency contact relationship", source: "Resident Record", get: r("ec_relationship") },
  { key: "ec_mobile", label: "Emergency contact mobile", source: "Resident Record", get: r("ec_mobile") },
  { key: "ec_email", label: "Emergency contact email", source: "Resident Record", get: r("ec_email") },
  { key: "ec_address", label: "Emergency contact address", source: "Resident Record", get: r("ec_address") },
  { key: "payer_name", label: "Payer name", source: "Resident Record", get: r("payer_name") },
  { key: "payer_relationship", label: "Payer relationship", source: "Resident Record", get: r("payer_relationship") },
  { key: "payer_mobile", label: "Payer mobile", source: "Resident Record", get: r("payer_mobile") },
  { key: "payer_email", label: "Payer email", source: "Resident Record", get: r("payer_email") },
  { key: "payer_address", label: "Payer address", source: "Resident Record", get: r("payer_address") },
  // — Booking Record —
  { key: "booking_ref", label: "Booking reference", source: "Booking Record", get: e("reference") },
  { key: "payment_schedule", label: "Payment frequency", source: "Booking Record", get: (c) => scheduleName(c.enquiry?.["payment_term"] || c.resident?.["pay_schedule"]) },
  { key: "booking_move_in", label: "Move-in date", source: "Booking Record", get: (c) => fmtDate(c.enquiry?.["move_in"] ?? c.resident?.["move_in"]) },
  { key: "booking_move_out", label: "Move-out date", source: "Booking Record", get: (c) => fmtDate(c.enquiry?.["move_out"]) },
  { key: "lease_months", label: "Lease length (months)", source: "Booking Record", get: r("lease_months") },
  // — Initial Payment: the first-payment lines from the saved quote —
  { key: "deposit", label: "Security deposit", source: "Initial Payment", get: payLine("Security deposit") },
  { key: "utilities_deposit", label: "Utilities deposit", source: "Initial Payment", get: payLine("Utilities deposit") },
  { key: "access_card_deposit", label: "Access card deposit", source: "Initial Payment", get: payLine("Access card deposit") },
  { key: "first_month_rent", label: "First month rent", source: "Initial Payment", get: payLine("First month rent") },
  { key: "advance_rental", label: "Advance rental", source: "Initial Payment", get: payLine("Advance rental") },
  { key: "admin_charges", label: "Admin charges", source: "Initial Payment", get: payLine("Admin") },
  { key: "first_payment_total", label: "Total initial payment", source: "Initial Payment", get: (c) => money((c.enquiry?.["quote_snapshot"] as any)?.quote?.totalUpfront ?? c.enquiry?.["first_payment"]) },
  { key: "total_stay", label: "Total for whole stay", source: "Initial Payment", get: (c) => money((c.enquiry?.["quote_snapshot"] as any)?.quote?.totalStay) },
  { key: "residence", label: "Residence", source: "Room Record", get: (c) => c.residence?.["name"] },
  { key: "unit_no", label: "Unit no.", source: "Room Record", get: (c) => c.unit?.["unit_no"] },
  { key: "room_no", label: "Room", source: "Room Record", get: (c) => (c.room ? `Room ${c.room["letter"]}` : "") },
  { key: "bed", label: "Bed", source: "Room Record", get: (c) => c.bed?.["label"] },
  { key: "occupancy", label: "Occupancy", source: "Room Record", get: (c) => c.room?.["occupancy"] ?? c.resident?.["occupancy"] },
  { key: "unit_type", label: "Unit type", source: "Room Record", get: (c) => c.unit?.["unit_type"] },
  { key: "inclusions", label: "Inclusions", source: "Room Record", get: (c) => rentalTermList(c, "included") },
  { key: "exclusions", label: "Exclusions", source: "Room Record", get: (c) => rentalTermList(c, "excluded") },
  { key: "agreement_no", label: "Agreement No.", source: "Tenancy Record", get: (c) => c.agreement?.["agreement_no"] },
  { key: "agreement_date", label: "Agreement date", source: "Tenancy Record", get: (c) => fmtDate(c.agreement?.["created_at"] ?? c.tenancy?.["created_at"]) },
  { key: "tenancy_start", label: "Tenancy start", source: "Tenancy Record", get: (c) => fmtDate(start(c)) },
  { key: "tenancy_end", label: "Tenancy end", source: "Tenancy Record", get: (c) => fmtDate(end(c)) },
  { key: "monthly_rent", label: "Monthly rent", source: "Tenancy Record", get: (c) => money(rent(c)) },
  // "12 months 4 days", worked out from the tenancy dates the agreement prints
  { key: "duration", label: "Duration (months and days)", source: "Tenancy Record", get: (c) => stayLength(start(c), end(c)) },
  // — Signatory: Settings → Signatory, the same on every document (30 Sep 2026) —
  { key: "signatory_signature", label: "Signatory's signature", source: "Signatory", get: (c) => c.signatory?.token ?? "" },
  { key: "signatory_name", label: "Signatory's name", source: "Signatory", get: (c) => c.signatory?.name ?? "" },
  { key: "signatory_title", label: "Signatory's title", source: "Signatory", get: (c) => c.signatory?.title ?? "" },
  { key: "today", label: "Today's date", source: "Other", get: () => fmtDate(new Date().toISOString()) },
  // for tick boxes on a PDF form: "yes" ticks it, empty leaves it (30 Sep 2026)
  { key: "has_id_copy", label: "Tick: IC / passport copy uploaded", source: "Resident Record", get: (c) => (hasDoc(c, "id") ? "yes" : "") },
  { key: "has_photo", label: "Tick: passport photo uploaded", source: "Resident Record", get: (c) => (hasDoc(c, "photo") ? "yes" : "") },
  { key: "has_agreement", label: "Tick: tenancy agreement generated", source: "Tenancy Record", get: (c) => (c.agreement ? "yes" : "") },
];

export const FIELD_BY_KEY = new Map(TEMPLATE_FIELDS.map((f) => [f.key, f]));

/** Placeholder names in uploaded documents that mean an existing field. */
const ALIASES: Record<string, string> = {
  payment_frequency: "payment_schedule",
  schedule_a_effective_date: "tenancy_start",
  effective_date: "tenancy_start",
  resident_name: "resident_full_name",
  full_name: "resident_full_name",
  id_number: "passport_no",
  resident_identification_number: "passport_no",
  nric: "passport_no",
  agreement_id: "agreement_no",
  room: "room_no",
  start_date: "tenancy_start",
  end_date: "tenancy_end",
  rent: "monthly_rent",
  security_deposit: "deposit",
  utility_deposit: "utilities_deposit",
  utilities_deposit: "utilities_deposit",
  card_deposit: "access_card_deposit",
  admin_fee: "admin_charges",
  total_initial_payment: "first_payment_total",
  move_in_date: "booking_move_in",
  move_out_date: "booking_move_out",
  // the names the Schedule A template uses (vSept26)
  residence_name: "residence",
  resident_address: "address",
  resident_postcode: "postcode",
  resident_state: "state",
  resident_country: "country",
  resident_mobile_number: "mobile",
  tenancy_start_date: "tenancy_start",
  tenancy_end_date: "tenancy_end",
  rental_rate: "monthly_rent",
  duration_mmdd: "duration",
  // the signature block (30 Sep 2026): Brachtia signs when the pack is made
  admin_signature: "signatory_signature",
  admin_name: "signatory_name",
  admin_title: "signatory_title",
  admin_signature_date: "today",
};

export type Mapping =
  | { kind: "field"; key: string }
  | { kind: "formula"; expr: string }
  | { kind: "blank" };
export type Mappings = Record<string, Mapping>;

/** best guess for a placeholder, or null */
export function suggestMapping(ph: string): Mapping | null {
  const k = ph.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const key = FIELD_BY_KEY.has(k) ? k : ALIASES[k];
  if (key) return { kind: "field", key };
  // the resident's signature and its date come when they sign, not from a record
  if (k.includes("signature")) return { kind: "blank" };
  return null;
}

/** the saved mapping, else the suggestion */
export const mappingFor = (ph: string, m: Mappings | undefined): Mapping | null => m?.[ph] ?? suggestMapping(ph);

const isComplete = (m: Mapping | null) =>
  !!m && (m.kind === "blank" || (m.kind === "field" && FIELD_BY_KEY.has(m.key)) || (m.kind === "formula" && m.expr.trim() !== ""));

const PH = /\{\{\s*([a-zA-Z0-9_][a-zA-Z0-9_ \-]*?)\s*\}\}/g;

export function detectPlaceholders(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(PH)) if (m[1]) out.add(m[1]);
  return [...out];
}

export const unmapped = (keys: string[], m?: Mappings) => keys.filter((k) => !isComplete(mappingFor(k, m)));

/** formula: plain text with [field_key] tokens, e.g. "[unit_no] / [room_no]" */
export function evalFormula(expr: string, ctx: MappingContext): string {
  return expr.replace(/\[([a-z0-9_]+)\]/gi, (_m, k: string) => {
    const f = FIELD_BY_KEY.get(k.toLowerCase());
    const v = f?.get(ctx);
    return v == null ? "" : String(v);
  });
}
export const formulaUnknownTokens = (expr: string) =>
  [...expr.matchAll(/\[([a-z0-9_]+)\]/gi)].map((m) => m[1]!).filter((k) => !FIELD_BY_KEY.has(k.toLowerCase()));

export function describeMapping(m: Mapping | null): string {
  if (!m) return "—";
  if (m.kind === "blank") return "Left blank";
  if (m.kind === "formula") return "Formula";
  return FIELD_BY_KEY.get(m.key)?.source ?? "—";
}

export type MappingResult = { key: string; source: string; value: string; result: "mapped" | "missing" | "unmapped" };

export function testMappingFor(keys: string[], ctx: MappingContext, m?: Mappings): MappingResult[] {
  return keys.map((key) => {
    const map = mappingFor(key, m);
    if (!isComplete(map)) return { key, source: "—", value: "", result: "unmapped" };
    if (map!.kind === "blank") return { key, source: "Left blank", value: "", result: "mapped" };
    const value = map!.kind === "formula" ? evalFormula(map!.expr, ctx) : String(FIELD_BY_KEY.get(map!.key)!.get(ctx) ?? "");
    return { key, source: describeMapping(map), value, result: value.trim() ? "mapped" : "missing" };
  });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

/** wraps placeholders in highlight marks; with values, fills them in */
export function renderTemplate(html: string, values?: Record<string, MappingResult>, m?: Mappings): string {
  return html.replace(PH, (_m, key: string) => {
    if (values) {
      const res = values[key];
      if (res?.result === "mapped") return res.value ? `<mark data-ph="ok">${esc(res.value)}</mark>` : `<mark data-ph="ok">&nbsp;</mark>`;
      return `<mark data-ph="${res?.result ?? "unmapped"}">{{${key}}}</mark>`;
    }
    return `<mark data-ph="${isComplete(mappingFor(key, m)) ? "ph" : "unmapped"}">{{${key}}}</mark>`;
  });
}

/**
 * The values that belong to the document itself, and so may be set on the
 * pack page: its dates and what the rent includes. Everything else belongs to
 * the resident's record and is corrected there, so it is right everywhere
 * (Dani and Lav, 30 Sep 2026).
 */
const DOCUMENT_OWN = /^(agreement_date|schedule_a_effective_date|effective_date|inclusions|exclusions)$/i;
export const isDocumentOwn = (key: string) => DOCUMENT_OWN.test(key.trim());
