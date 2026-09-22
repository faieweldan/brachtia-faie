/**
 * What the master list actually holds, column by column - shapes, not people.
 *
 *   bun scripts/master-list-columns.ts "<master list.xlsx>"
 *   bun scripts/master-list-columns.ts "<file>" --sheet "Sheet1"
 *
 * For each column: how many rows are filled, what kind of values they are
 * (number, date, text, yes/no), and for numbers the smallest, largest and how
 * many distinct ones. Text columns show how many distinct values, and the
 * common ones only when there are few enough to be categories (a status, a
 * sponsor) rather than names.
 *
 * Nothing identifying is printed - no names, no ids, no emails, no phone
 * numbers, and no value from a column that looks like free text. So the output
 * can be shared to work out what accounting fills in and what is still empty.
 *
 * Read only: the file is never written, and the database is never touched.
 */

import { readFileSync } from "node:fs";

import * as XLSX from "xlsx";

import { rowsFromGrid } from "@/lib/master-list";

const file = process.argv[2];
if (!file) {
  console.error('Usage: bun scripts/master-list-columns.ts "<master list.xlsx>"');
  process.exit(1);
}
const sheetWanted = process.argv.includes("--sheet")
  ? process.argv[process.argv.indexOf("--sheet") + 1]
  : "";

const book = XLSX.read(readFileSync(file), { cellDates: true });
const sheetName = sheetWanted || book.SheetNames[0]!;
const sheet = book.Sheets[sheetName];
if (!sheet) {
  console.error(`No sheet "${sheetName}". Sheets: ${book.SheetNames.join(", ")}`);
  process.exit(1);
}

const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
const rows = rowsFromGrid(grid as unknown[][]);
if (!rows) {
  console.error("No StudentID column - this does not look like the master list.");
  process.exit(1);
}

/** Columns whose values are a person, never printed whatever they hold. */
const PRIVATE = /name|email|mobile|phone|passport|nric|id\s*number|address|remark|note|studentid/i;

const isMoney = (h: string) =>
  /rent|deposit|fee|charge|amount|payment|balance|paid|price|total|advance/i.test(h);

const shapeOf = (v: string) => {
  const t = v.trim();
  if (!t) return "blank";
  if (/^-?[\d,]+(\.\d+)?$/.test(t)) return "number";
  if (/^\d{4}-\d{2}-\d{2}/.test(t) || /^\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4}$/.test(t)) return "date";
  if (/^(yes|no|y|n|true|false)$/i.test(t)) return "yes/no";
  return "text";
};

const headers = Object.keys(rows[0]?.row ?? {});
const total = rows.length;

console.log(`\n${sheetName} · ${total} rows · ${headers.length} columns\n`);
console.log(`${"COLUMN".padEnd(26)} ${"FILLED".padEnd(14)} ${"KIND".padEnd(10)} WHAT IS IN IT`);
console.log("-".repeat(96));

for (const header of headers) {
  const values = rows.map((r) => String(r.row[header] ?? "").trim());
  const filled = values.filter(Boolean);
  const kinds = new Map<string, number>();
  for (const v of filled) {
    const shape = shapeOf(v);
    kinds.set(shape, (kinds.get(shape) ?? 0) + 1);
  }
  const kind = [...kinds.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "blank";
  const pct = total ? Math.round((filled.length / total) * 100) : 0;
  const distinct = new Set(filled).size;

  let says = `${distinct} distinct`;
  if (PRIVATE.test(header)) {
    says = `${distinct} distinct · not shown`;
  } else if (kind === "number") {
    const nums = filled.map((v) => Number(v.replace(/,/g, ""))).filter((n) => Number.isFinite(n));
    if (nums.length) {
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
      says = `${distinct} distinct · low ${sorted[0]} · middle ${mid} · high ${sorted.at(-1)}`;
    }
  } else if (kind === "date") {
    const sorted = [...filled].sort();
    says = `${distinct} distinct · earliest ${sorted[0]} · latest ${sorted.at(-1)}`;
  } else if (distinct <= 12) {
    // few enough to be categories - a status, a sponsor - rather than people
    const counts = new Map<string, number>();
    for (const v of filled) counts.set(v, (counts.get(v) ?? 0) + 1);
    says = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([v, n]) => `${v} ${n}`)
      .join(" · ");
  }

  const flag = isMoney(header) ? "RM " : "   ";
  console.log(
    `${flag}${header.slice(0, 23).padEnd(23)} ${`${filled.length}/${total} (${pct}%)`.padEnd(14)} ${kind.padEnd(10)} ${says}`,
  );
}

console.log(`\nRM marks a money column.`);
console.log(`Columns with no value at all are where nothing has been filled in yet.\n`);
