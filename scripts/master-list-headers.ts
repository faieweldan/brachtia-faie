/**
 * Print the master list's HEADER ROW only - no student data.
 *
 *   bun scripts/master-list-headers.ts "<master list.xlsx>"
 *
 * The upload keys every column by its header name, and the master repeats
 * several headers (Status, Tenancy Start, Tenancy End, Duration, Payment
 * Frequency, Remarks). Where a name repeats, rowsFromGrid keeps the FIRST
 * column and ignores the rest - so a value typed in the second one is read by
 * nobody, silently.
 *
 * This prints each header with its Excel column letter, marks the repeats, and
 * says which column the upload actually takes for each field it reads.
 *
 * It never prints a data row, so its output is safe to paste to Claude.
 */

import * as XLSX from "xlsx";

import { COL } from "@/lib/master-list";

const file = process.argv[2];
if (!file) {
  console.error('usage: bun scripts/master-list-headers.ts "<master list.xlsx>"');
  process.exit(1);
}

const book = XLSX.readFile(file);
// the student sheet by name where it exists, otherwise the first one
const sheetName =
  book.SheetNames.find((n) => /student/i.test(n)) ?? book.SheetNames[0]!;
const sheet = book.Sheets[sheetName]!;
const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });

/*
 * The master has a banner row above the real headers, so the header row is the
 * one carrying a StudentID cell - the same rule rowsFromGrid uses. Finding it
 * by position instead would break the day someone inserts a row.
 */
const headerIdx = grid.findIndex((r) =>
  (r ?? []).some((c) => String(c).trim().toLowerCase() === "studentid"),
);
if (headerIdx === -1) {
  console.error(`No StudentID column found in sheet "${sheetName}" - is this the master list?`);
  process.exit(1);
}

const headers = (grid[headerIdx] ?? []).map((c) => String(c).trim());
const lower = headers.map((h) => h.toLowerCase());

/** Excel's letter for a zero-based column index: 0 -> A, 18 -> S. */
const colLetter = (i: number) => XLSX.utils.encode_col(i);

// how many times each name appears, so a repeat can be called out
const counts = new Map<string, number>();
for (const h of lower) if (h) counts.set(h, (counts.get(h) ?? 0) + 1);

// the column the upload wins for each name: the first one, later ones ignored
const firstCol = new Map<string, number>();
lower.forEach((h, i) => {
  if (h && !firstCol.has(h)) firstCol.set(h, i);
});

console.log(`Sheet: ${sheetName}`);
console.log(`Header row: ${headerIdx + 1} (Excel row number)`);
console.log(`Columns: ${headers.length}\n`);

console.log("--- every header ---");
headers.forEach((h, i) => {
  if (!h) return;
  const key = lower[i]!;
  const repeated = (counts.get(key) ?? 0) > 1;
  const used = firstCol.get(key) === i;
  const mark = !repeated ? "" : used ? "   <- REPEATED, this one is read" : "   <- REPEATED, IGNORED";
  console.log(`  ${colLetter(i).padEnd(3)} ${h}${mark}`);
});

console.log("\n--- what the upload reads, and from which column ---");
for (const [field, names] of Object.entries(COL)) {
  const hit = (names as readonly string[])
    .map((n) => ({ n, i: firstCol.get(n) }))
    .find((x) => x.i !== undefined);
  console.log(
    hit
      ? `  ${field.padEnd(10)} column ${colLetter(hit.i!)}  ("${headers[hit.i!]}")`
      : `  ${field.padEnd(10)} NOT FOUND - no column matches ${names.join(" / ")}`,
  );
}

/*
 * These are read straight off the row rather than through COL, so they are
 * easy to forget when checking what the sheet supplies.
 */
console.log("\n--- read outside COL ---");
for (const [field, names] of [
  ["sponsor", ["sponsor"]],
  ["university", ["university"]],
  ["nationality", ["nationality"]],
  ["gender", ["gender"]],
  ["email", ["email"]],
  ["mobile", ["mobilenumber", "mobile number", "mobile", "phone"]],
  ["id_number", ["idnumber", "id number", "passport", "nric"]],
] as const) {
  const hit = names.map((n) => ({ n, i: firstCol.get(n) })).find((x) => x.i !== undefined);
  console.log(
    hit
      ? `  ${field.padEnd(11)} column ${colLetter(hit.i!)}  ("${headers[hit.i!]}")`
      : `  ${field.padEnd(11)} NOT FOUND - no column matches ${names.join(" / ")}`,
  );
}
