/**
 * Does the system match the master? (Dani, 23 Oct 2026)
 *
 * Reads the two Sheet3 files the converter made from the master (Non-Sponsor and
 * Sponsor) and checks every resident in them against the database:
 *   - the total: everyone in the files is in the system, and nobody extra
 *   - unit, room, bed - "Single" in the Excel is a twin room let whole: the
 *     system keeps that person on Twin 1 with the stay marked let whole
 *   - rent: the rent terms' rent, else the initial invoice's (the same rule
 *     every screen uses - tenancyDatesByResident)
 *   - tenancy start and end
 *
 * Read-only. Writes the differences to output/System Check.csv.
 *
 *   bun --env-file=.env migration/residents/check_system.ts
 *   bun --env-file=.env migration/residents/check_system.ts "<non-sponsor.xlsx>" "<sponsor.xlsx>"
 */
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { readFileSync, writeFileSync } from "fs";
import { allRows } from "@/lib/all-rows";

const OUT = "migration/residents/output";
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [`${OUT}/Data Labelling - Non-Sponsor Prepared.xlsx`, `${OUT}/Data Labelling - Sponsor Prepared.xlsx`];

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
console.log(`Database: ${process.env.SUPABASE_URL}`);

/* ---- the Excel side ---- */
type Want = { file: string; qb: string; name: string; unit: string; room: string; bed: string; rent: number; start: string; end: string };
const day = (v: unknown) => {
  // an Excel date is a day number - read as the calendar day it shows; a Date object
  // would shift with the time zone and land a day early
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return String(v ?? "").slice(0, 10);
};
const want: Want[] = [];
for (const f of files) {
  const book = XLSX.read(readFileSync(f), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]!]!, { defval: "" });
  for (const r of rows) {
    const qb = String(r["QuickBooks ID"] ?? "").trim();
    if (!qb) continue;
    want.push({
      file: f.includes("Non-Sponsor") ? "Non-Sponsor" : "Sponsor",
      qb,
      name: String(r["Resident name"] ?? ""),
      unit: String(r["Unit no. "] ?? ""),
      room: String(r["Room"] ?? ""),
      bed: String(r["Bed"] ?? ""),
      rent: Number(r["Monthly rent"] ?? 0),
      start: day(r["Tenancy Start"]),
      end: day(r["Tenancy End"]),
    });
  }
}

/* ---- the system side ---- */
const [residents, tenancies, beds, rooms, units, schedules, invoices] = await Promise.all([
  allRows<any>(() => sb.from("residents").select("id, quickbooks_id, full_name").order("id")),
  allRows<any>(() => sb.from("tenancies").select("id, resident_id, bed_id, start_date, end_date, let_whole, created_at").order("start_date").order("created_at").order("id")),
  allRows<any>(() => sb.from("beds").select("id, room_id, label").order("id")),
  allRows<any>(() => sb.from("rooms").select("id, unit_id, letter").order("id")),
  allRows<any>(() => sb.from("units").select("id, unit_no").order("id")),
  allRows<any>(() => sb.from("rental_schedules").select("tenancy_id, monthly_rent").order("id")),
  allRows<any>(() => sb.from("invoices").select("resident_id, monthly_rent, notes").eq("invoice_type", "initial").neq("status", "void").order("created_at").order("id")),
]);
const byId = <T extends { id: string }>(a: T[]) => new Map(a.map((x) => [x.id, x]));
const B = byId(beds), R = byId(rooms), U = byId(units);
const latest = new Map<string, any>();
for (const t of tenancies) latest.set(t.resident_id, t); // the newest wins - a renewal
const scheduleRent = new Map(schedules.filter((s) => Number(s.monthly_rent) > 0).map((s) => [s.tenancy_id, Number(s.monthly_rent)]));
const invoiceRent = new Map<string, number>();
for (const i of invoices) if (Number(i.monthly_rent) > 0 && !String(i.notes ?? "").startsWith("Initial payment difference")) invoiceRent.set(i.resident_id, Number(i.monthly_rent));
const sysByQb = new Map(residents.map((r) => [String(r.quickbooks_id ?? "").trim(), r]));

/* ---- compare ---- */
const unitKey = (u: string) => u.toUpperCase().trim().replace(/-0(\d)A$/, "-$1A");
const diffs: { qb: string; name: string; file: string; field: string; excel: string; system: string }[] = [];
const missing: Want[] = [];
for (const w of want) {
  const r = sysByQb.get(w.qb);
  if (!r) { missing.push(w); continue; }
  const t = latest.get(r.id);
  const bed = t && B.get(t.bed_id), room = bed && R.get(bed.room_id), unit = room && U.get(room.unit_id);
  const add = (field: string, excel: unknown, system: unknown) => diffs.push({ qb: w.qb, name: w.name, file: w.file, field, excel: String(excel), system: String(system) });

  if (unitKey(w.unit) !== unitKey(unit?.unit_no ?? "")) add("Unit", w.unit, unit?.unit_no ?? "(no bed)");
  if (w.room.toLowerCase() !== String(room?.letter ?? "").toLowerCase()) add("Room", w.room, room?.letter ?? "(no bed)");
  // "Single" in a twin room = Twin 1 with the stay let whole - the same room, sold as a single
  const sysBed = t?.let_whole && /^twin 1$/i.test(bed?.label ?? "") ? "Single" : String(bed?.label ?? "");
  if (w.bed.toLowerCase() !== sysBed.toLowerCase()) add("Bed", w.bed, sysBed || "(no bed)");
  const rent = (t && scheduleRent.get(t.id)) || invoiceRent.get(r.id) || 0;
  if (Math.abs(w.rent - rent) > 0.005) add("Rent", w.rent, rent);
  if (w.start !== day(t?.start_date)) add("Tenancy start", w.start, day(t?.start_date));
  if (w.end !== day(t?.end_date)) add("Tenancy end", w.end, day(t?.end_date));
}
const inFiles = new Set(want.map((w) => w.qb));
const extra = residents.filter((r) => !inFiles.has(String(r.quickbooks_id ?? "").trim()));

/* ---- report ---- */
const count = (f: string) => want.filter((w) => w.file === f).length;
console.log(`\nTOTAL`);
console.log(`  Non-Sponsor file  ${count("Non-Sponsor")}`);
console.log(`  Sponsor file      ${count("Sponsor")}`);
console.log(`  Files together    ${want.length}`);
console.log(`  In the system     ${residents.length}`);
console.log(`  In files, NOT in system  ${missing.length}${missing.length ? "  " + missing.map((m) => m.qb).join(", ") : ""}`);
console.log(`  In system, NOT in files  ${extra.length}${extra.length ? "  " + extra.map((e) => e.quickbooks_id || "(no QB ID)").join(", ") : ""}`);
console.log(`    (someone left out of the files on purpose - ends in October, withdrew - shows here)`);

console.log(`\nDIFFERENCES  ${diffs.length} (in ${new Set(diffs.map((d) => d.qb)).size} residents)`);
const byField = new Map<string, number>();
for (const d of diffs) byField.set(d.field, (byField.get(d.field) ?? 0) + 1);
for (const [f, n] of byField) console.log(`  ${f.padEnd(14)} ${n}`);
for (const d of diffs) console.log(`  ${d.qb}  ${d.field.padEnd(14)} Excel ${d.excel.padEnd(12)} System ${d.system}`);
if (!diffs.length) console.log("  none - unit, room, bed, rent and dates all match");

const csv = [["QB ID", "Name", "Tab", "Field", "Excel", "System"], ...diffs.map((d) => [d.qb, d.name, d.file, d.field, d.excel, d.system])]
  .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
  .join("\n");
writeFileSync(`${OUT}/System Check.csv`, csv);
console.log(`\nWritten: ${OUT}/System Check.csv`);
