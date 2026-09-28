/**
 * The placeholders a document template may use, where each one's value comes
 * from, and how to read it from a resident's linked records. Shared by the
 * Templates workspace (browser) and the server-side Test Mapping.
 */

export type FieldSource = "Resident" | "Booking" | "Homes / Room" | "Tenancy";

export type MappingContext = {
  resident: Record<string, any> | null;
  enquiry: Record<string, any> | null;
  bed: Record<string, any> | null;
  room: Record<string, any> | null;
  unit: Record<string, any> | null;
  residence: Record<string, any> | null;
  tenancy: Record<string, any> | null;
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

export const TEMPLATE_FIELDS: TemplateField[] = [
  { key: "agreement_date", label: "Agreement date", source: "Tenancy", get: (c) => (c.tenancy ? fmtDate(c.tenancy["created_at"]) : "") },
  { key: "resident_full_name", label: "Resident full name", source: "Resident", get: (c) => c.resident?.["full_name"] },
  { key: "resident_name", label: "Resident full name (old name)", source: "Resident", get: (c) => c.resident?.["full_name"] },
  { key: "passport_no", label: "NRIC / Passport no.", source: "Resident", get: (c) => c.resident?.["id_number"] },
  { key: "id_number", label: "NRIC / Passport (old name)", source: "Resident", get: (c) => c.resident?.["id_number"] },
  { key: "resident_id", label: "Resident ID", source: "Resident", get: (c) => c.resident?.["resident_code"] },
  { key: "email", label: "Email", source: "Resident", get: (c) => c.resident?.["email"] },
  { key: "mobile", label: "Mobile", source: "Resident", get: (c) => c.resident?.["mobile"] },
  { key: "nationality", label: "Nationality", source: "Resident", get: (c) => c.resident?.["nationality"] },
  { key: "university", label: "University", source: "Resident", get: (c) => c.resident?.["university"] },
  { key: "booking_ref", label: "Booking reference", source: "Booking", get: (c) => c.enquiry?.["reference"] },
  { key: "payment_schedule", label: "Payment frequency", source: "Booking", get: (c) => c.enquiry?.["payment_term"] || c.resident?.["pay_schedule"] },
  { key: "deposit", label: "Security deposit", source: "Booking", get: () => "" },
  { key: "residence", label: "Residence", source: "Homes / Room", get: (c) => c.residence?.["name"] },
  { key: "unit_no", label: "Unit no.", source: "Homes / Room", get: (c) => c.unit?.["unit_no"] },
  { key: "room_no", label: "Room", source: "Homes / Room", get: (c) => (c.room ? `Room ${c.room["letter"]}` : "") },
  { key: "room", label: "Room (old name)", source: "Homes / Room", get: (c) => (c.room ? `Room ${c.room["letter"]}` : "") },
  { key: "bed", label: "Bed", source: "Homes / Room", get: (c) => c.bed?.["label"] },
  { key: "occupancy", label: "Occupancy", source: "Homes / Room", get: (c) => c.room?.["occupancy"] ?? c.resident?.["occupancy"] },
  { key: "tenancy_start", label: "Tenancy start", source: "Tenancy", get: (c) => fmtDate(start(c)) },
  { key: "tenancy_end", label: "Tenancy end", source: "Tenancy", get: (c) => fmtDate(end(c)) },
  { key: "monthly_rent", label: "Monthly rent", source: "Tenancy", get: (c) => { const r = rent(c); return r === "" || r == null ? "" : Number(r).toLocaleString("en-MY"); } },
];

export const FIELD_BY_KEY = new Map(TEMPLATE_FIELDS.map((f) => [f.key, f]));

const PH = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function detectPlaceholders(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(PH)) if (m[1]) out.add(m[1]);
  return [...out];
}

export const unmapped = (keys: string[]) => keys.filter((k) => !FIELD_BY_KEY.has(k));

export type MappingResult = { key: string; source: string; value: string; result: "mapped" | "missing" | "unmapped" };

export function testMappingFor(keys: string[], ctx: MappingContext): MappingResult[] {
  return keys.map((key) => {
    const f = FIELD_BY_KEY.get(key);
    if (!f) return { key, source: "—", value: "", result: "unmapped" };
    const v = f.get(ctx);
    const value = v == null ? "" : String(v);
    return { key, source: f.source, value, result: value ? "mapped" : "missing" };
  });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

/** wraps placeholders in highlight marks; with values, fills them in */
export function renderTemplate(html: string, values?: Record<string, MappingResult>): string {
  return html.replace(PH, (_m, key: string) => {
    const known = FIELD_BY_KEY.has(key);
    if (values) {
      const r = values[key];
      if (r?.result === "mapped") return `<mark data-ph="ok">${esc(r.value)}</mark>`;
      return `<mark data-ph="${r?.result ?? "unmapped"}">{{${key}}}</mark>`;
    }
    return `<mark data-ph="${known ? "ph" : "unmapped"}">{{${key}}}</mark>`;
  });
}
