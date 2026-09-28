/**
 * The values a document template may use, where each comes from, and how a
 * version's placeholders are mapped to them (a record field, a formula, or
 * left blank). Shared by the Templates workspace and the server.
 */

export type FieldSource = "Resident Record" | "Booking Record" | "Initial Payment" | "Room Record" | "Tenancy Record" | "Other";
export const FIELD_SOURCES: FieldSource[] = ["Resident Record", "Booking Record", "Initial Payment", "Room Record", "Tenancy Record", "Other"];

export type MappingContext = {
  resident: Record<string, any> | null;
  enquiry: Record<string, any> | null;
  bed: Record<string, any> | null;
  room: Record<string, any> | null;
  unit: Record<string, any> | null;
  residence: Record<string, any> | null;
  tenancy: Record<string, any> | null;
  agreement?: Record<string, any> | null;
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
const e = (k: string) => (c: MappingContext) => c.enquiry?.[k];

const money = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  { key: "nationality", label: "Nationality", source: "Resident Record", get: r("nationality") },
  { key: "gender", label: "Gender", source: "Resident Record", get: r("gender") },
  { key: "dob", label: "Date of birth", source: "Resident Record", get: (c) => fmtDate(c.resident?.["dob"]) },
  { key: "marital_status", label: "Marital status", source: "Resident Record", get: r("marital_status") },
  { key: "race", label: "Race", source: "Resident Record", get: r("race") },
  { key: "religion", label: "Religion", source: "Resident Record", get: r("religion") },
  { key: "address", label: "Address", source: "Resident Record", get: r("address") },
  { key: "postcode", label: "Postcode", source: "Resident Record", get: r("postcode") },
  { key: "state", label: "State", source: "Resident Record", get: r("state") },
  { key: "country", label: "Country", source: "Resident Record", get: r("country") },
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
  { key: "payment_schedule", label: "Payment frequency", source: "Booking Record", get: (c) => c.enquiry?.["payment_term"] || c.resident?.["pay_schedule"] },
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
  { key: "monthly_rent", label: "Monthly rent", source: "Tenancy Record", get: (c) => { const v = rent(c); return v === "" || v == null ? "" : Number(v).toLocaleString("en-MY"); } },
  { key: "today", label: "Today's date", source: "Other", get: () => fmtDate(new Date().toISOString()) },
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
  if (k.includes("signature_date")) return { kind: "blank" };
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
