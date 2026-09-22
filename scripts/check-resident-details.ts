/**
 * Check a student-details file - the application form export, or anything
 * shaped like it - before any of it goes near the database.
 *
 * Nothing is written to the database. Every row is read and checked with the
 * same rules the app uses, and every problem gets a short name, so the rows
 * that do not go through can be grouped and the pattern behind them seen.
 *
 *   bun scripts/check-resident-details.ts "<file.xlsx or file.csv>"
 *   bun scripts/check-resident-details.ts "<file>" --sheet "Form responses 1"
 *   bun scripts/check-resident-details.ts "<file>" --db
 *
 * --db also finds each row's resident in the database .env points at
 * (test-bratchia) and says what would be filled and what conflicts. Read only.
 *
 * Output: a summary in the terminal, and "<file>-check.xlsx" next to the file:
 *   Summary   the counts
 *   Patterns  every kind of problem, counted, most common first
 *   Rows      one line per row - pass / check / fail, and why
 *   Problems  one line per problem, to filter
 *   Columns   what each column in the file was read as - check this first
 *
 * Two levels:
 *   fail   - would not go through (no passport/NRIC, a date that does not exist)
 *   check  - would go through, but look at it (a relationship not on the list)
 *
 * Why passport/NRIC and not "Student ID": in the application form "Student ID"
 * is the university's matric number. Brachtia's own number (00256, the
 * QuickBooks id) is something the student never sees, so the form cannot carry
 * it. Only a column that says "QuickBooks" is read as that.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

import * as XLSX from "xlsx";

import {
  RESIDENT_SECTIONS,
  emailProblem,
  nricProblem,
  phoneProblem,
  type ResidentField,
} from "@/lib/resident-fields";
import {
  normCountry,
  normGender,
  normLevel,
  normMarital,
  splitPhone,
  type Normalised,
} from "@/lib/reference-data";

/* ---------------- arguments ---------------- */

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--sheet");
const sheetArg = args.includes("--sheet") ? args[args.indexOf("--sheet") + 1] : undefined;
const useDb = args.includes("--db");

if (!file) {
  console.log(
    'Usage: bun scripts/check-resident-details.ts "<file.xlsx or file.csv>" [--sheet name] [--db]',
  );
  process.exit(1);
}

/* ---------------- which column is which ---------------- */

const QB = "quickbooks_id";
const FIELD = new Map<string, { label: string; field: ResidentField }>();
for (const s of RESIDENT_SECTIONS)
  for (const f of s.fields) FIELD.set(f.key, { label: `${s.title} - ${f.label}`, field: f });
const labelOf = (column: string) =>
  column === QB ? "QuickBooks ID" : (FIELD.get(column)?.label ?? column);

/** "State / Region / Province" -> "state region province" */
const words = (h: unknown) =>
  String(h ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Rule = [RegExp, string];
type Section = "personal" | "emergency" | "payment";

/** Columns the form has that the resident profile does not take - and why. */
const IGNORED: Rule[] = [
  [/timestamp/, "not imported - only used to tell which of two submissions is newer"],
  [
    // \b matters: without it "lease" also matches "p-lease specify"
    /preferred (move|room|lease)|move in|occupancy|\blease\b|room type/,
    "not imported - a request, not a fact. Rooms, dates and rent come from the master list",
  ],
  [
    /photo|offer letter|\bcopy\b|declaration|upload/,
    "not imported - a document, not a profile field",
  ],
  [/hear|comment|request/, "not imported - no field on the resident profile"],
  [/privacy|consent/, "not imported - no field for consent on the resident profile yet"],
];

const MEDICAL: Rule[] = [
  [/if .*yes|previous question|specify|medical detail/, "medical_detail"],
  [/medical|allerg|health/, "medical_condition"],
];

const PLACE: Rule[] = [
  [/address/, "address"],
  [/post ?code|zip/, "postcode"],
  [/state|region|province/, "state"],
  [/country/, "country"],
];

/** Order matters: "University Name" must hit university before name. */
const RULES: Record<Section, Rule[]> = {
  personal: [
    [/quickbooks|\bqb\b|resident id|legacy id/, QB],
    [/birth|\bdob\b/, "dob"],
    [/nationality|citizenship/, "nationality"],
    [/passport|nric|\bic\b|identity|id number/, "id_number"],
    [/gender|\bsex\b/, "gender"],
    [/marital/, "marital_status"],
    [/\brace\b|ethnic/, "race"],
    [/religion/, "religion"],
    [/university|college|institution/, "university"],
    [/level/, "level_of_study"],
    [/course|programme|program|major/, "course"],
    [/student id|matric/, "student_id"],
    [/graduat/, "graduation_year"],
    [/name/, "full_name"],
    [/e ?mail/, "email"],
    [/contact|mobile|phone|whatsapp/, "mobile"],
    ...PLACE,
  ],
  emergency: [
    [/relationship/, "ec_relationship"],
    [/name/, "ec_name"],
    [/e ?mail/, "ec_email"],
    [/contact|mobile|phone|whatsapp/, "ec_mobile"],
    ...PLACE.map(([r, c]): Rule => [r, `ec_${c}`]),
  ],
  payment: [
    [/method/, "pay_method"],
    [/schedule|frequency/, "pay_schedule"],
    [/relationship/, "payer_relationship"],
    [/name|responsible/, "payer_name"],
    [/e ?mail/, "payer_email"],
    [/contact|mobile|phone|whatsapp/, "payer_mobile"],
    ...PLACE.map(([r, c]): Rule => [r, `payer_${c}`]),
  ],
};

/** Things a person should confirm about how a column was read. */
const NOTES: Record<string, string> = {
  student_id: "the university's matric number - NOT Brachtia's QuickBooks number",
  ec_address: "read as the emergency contact's address because it sits in that block - confirm",
  pay_method: "the form says 'preferred' - confirm it can be saved as the real method",
  pay_schedule: "the form says 'preferred' - confirm it can be saved as the real schedule",
};

const find = (rules: Rule[], t: string) => rules.find(([r]) => r.test(t))?.[1];

type ColumnRead = { index: number; header: string; column?: string; note: string };

/**
 * The form repeats headers - "Contact Number" three times, for the student,
 * the emergency contact and the payor. A name alone cannot tell them apart, so
 * the columns are read left to right and each block decides what they mean:
 * the medical questions end the student's part, and anything about payment
 * starts the payor's.
 */
function readHeader(header: unknown[]) {
  let section: Section = "personal";
  let sawMedical = false;
  let timestampAt = -1;
  const colsFor = new Map<string, number[]>();
  const read: ColumnRead[] = [];

  header.forEach((h, index) => {
    const t = words(h);
    const shown = String(h ?? "").trim();
    if (!t) return;

    const ignored = IGNORED.find(([r]) => r.test(t));
    if (ignored) {
      if (/timestamp/.test(t)) timestampAt = index;
      read.push({ index, header: shown, note: ignored[1] });
      return;
    }

    if (/emergency|next of kin/.test(t)) section = "emergency";
    if (/payment|payor|payer|sponsor|guarantor/.test(t)) section = "payment";

    let column = find(MEDICAL, t);
    if (column) sawMedical = true;
    else {
      if (sawMedical && section === "personal") section = "emergency";
      column = find(RULES[section], t) ?? find(RULES.personal, t);
      // a second "Contact Number" with no heading in between still belongs to
      // the next block, not to the student twice
      if (column && colsFor.has(column) && section === "personal") {
        const next = find(RULES.emergency, t);
        if (next && !colsFor.has(next)) column = next;
      }
    }

    if (!column) {
      read.push({ index, header: shown, note: "not recognised - not imported" });
      return;
    }
    const first = colsFor.get(column);
    if (first) {
      first.push(index);
      read.push({
        index,
        header: shown,
        column,
        note: `asked twice (also column ${XLSX.utils.encode_col(first[0]!)}) - the first answer given is used, and different answers are reported`,
      });
      return;
    }
    colsFor.set(column, [index]);
    read.push({ index, header: shown, column, note: NOTES[column] ?? "" });
  });

  return { colsFor, read, timestampAt };
}

/* ---------------- reading the file ---------------- */

const isCsv = extname(file).toLowerCase() === ".csv";
const book = isCsv
  ? // raw keeps "00256" and "050403-10-1234" as text instead of numbers
    XLSX.read(readFileSync(file, "utf8"), { type: "string", raw: true })
  : XLSX.read(readFileSync(file), { type: "buffer", cellDates: true });

const sheetName = sheetArg ?? book.SheetNames[0]!;
const sheet = book.Sheets[sheetName];
if (!sheet) {
  console.log(`No sheet called "${sheetArg}". Sheets in this file: ${book.SheetNames.join(", ")}`);
  process.exit(1);
}
const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: true });

// the header is not always row 1, so take whichever of the first 10 rows reads best
let headerAt = -1;
let best = 0;
grid.slice(0, 10).forEach((row, i) => {
  const hits = readHeader(row).read.filter((c) => !c.note.startsWith("not recognised")).length;
  if (hits > best) [best, headerAt] = [hits, i];
});
if (headerAt < 0 || best < 3) {
  console.log("Could not find a header row with at least 3 known columns.");
  console.log("First row reads:", (grid[0] ?? []).join(" | "));
  process.exit(1);
}
const { colsFor, read: columnsRead, timestampAt } = readHeader(grid[headerAt]!);

/* ---------------- small helpers ---------------- */

/**
 * Excel hands a date over as local midnight, sometimes a few minutes out.
 * toISOString() converts that to UTC first - and in Malaysia (UTC+8) local
 * midnight is 4pm the day BEFORE in UTC, so 1 Jan 2020 would print as
 * 2019-12-31. Moving to midday and reading the local parts avoids both.
 */
const dayOf = (v: Date) => {
  const t = new Date(v.getTime() + 12 * 3600 * 1000);
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
};
const iso = ({ y, m, d }: { y: number; m: number; d: number }) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const text = (v: unknown) => (v instanceof Date ? iso(dayOf(v)) : String(v ?? "").trim());

/** Excel strips the zeros off 00949. Brachtia's ids are five digits, so pad them back. */
const toQbId = (raw: string) => {
  const m = /^(\d+)(?:\.0+)?$/.exec(raw);
  return m ? m[1]!.padStart(5, "0") : raw;
};

/** "050403-10-1234", "050403 10 1234" and "050403101234" are one NRIC. */
const normId = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The last 9 digits: 012-345 6789, +60123456789 and 60123456789 all agree. */
const phoneKey = (v: string) => v.replace(/\D/g, "").slice(-9);

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Malaysian order: 03/04/2005 is 3 April. Returns "YYYY-MM-DD", or why it could not. */
function readDate(v: unknown): { iso: string } | { kind: string; detail: string } {
  const real = (y: number, m: number, d: number) => {
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
      ? { iso: iso({ y, m, d }) }
      : { kind: "impossible_date", detail: "that day does not exist (like 31 February)" };
  };
  const year = (s: string) => (s.length === 2 ? (+s > 30 ? 1900 : 2000) + +s : +s);

  if (v instanceof Date) {
    const { y, m, d } = dayOf(v);
    return real(y, m, d);
  }
  const s = text(v);
  if (typeof v === "number" || /^\d{5}(\.\d+)?$/.test(s)) {
    const t = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return { iso: t.toISOString().slice(0, 10) };
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return real(+m[1]!, +m[2]!, +m[3]!);

  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const [d, mo] = [+m[1]!, +m[2]!];
    if (mo > 12 && d <= 12)
      return {
        kind: "us_date_order",
        detail: "month and day look swapped (MM/DD instead of DD/MM)",
      };
    return real(year(m[3]!), mo, d);
  }

  m = /^(\d{1,2})[\s-]+([a-z]{3,})[\s,-]+(\d{2}|\d{4})$/i.exec(s);
  if (m) {
    const mo = MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase()) + 1;
    if (mo > 0) return real(year(m[3]!), mo, +m[1]!);
  }
  return { kind: "unreadable_date", detail: "not a date format the script knows" };
}

/** 011-20738594 -> +60 and 1120738594, the same way the form splits it. */
function phoneOf(raw: string) {
  const { dial, rest } = splitPhone(raw);
  if (dial) return { dial, rest };
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("60") && d.length >= 11) return { dial: "+60", rest: d.slice(2) };
  if (d.startsWith("0")) return { dial: "+60", rest: d.slice(1) };
  return { dial: "", rest: d };
}

const yesNo = (v: string): Normalised =>
  /^(y|yes|true|ya|ada)$/i.test(v)
    ? { value: "yes", matched: true }
    : /^(n|no|false|tidak|tiada|none|nil)$/i.test(v)
      ? { value: "no", matched: true }
      : { value: v, matched: false };

/** Choice fields whose list does not carry its own normaliser. */
const LISTS: Record<string, (v: string) => Normalised> = {
  gender: normGender,
  marital_status: normMarital,
  level_of_study: normLevel,
  medical_condition: yesNo,
  graduation_year: (v) => ({ value: v, matched: /^20[0-4]\d$/.test(v) }),
};
const listFor = (column: string) => FIELD.get(column)?.field.normalise ?? LISTS[column];

const PLACEHOLDER = /^(-+|n\/?a|nil|none|null|tiada|0|\.|tbc|tba|\?)$/i;

/** "Muhammad Afif (B1)" and "MUHAMMAD AFIF BIN MOHAMAD YATIM" are the same person. */
const sameName = (a: string, b: string) => {
  const set = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/\(b\d+\)/g, "")
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
    );
  const [x, y] = [set(a), set(b)];
  if (!x.size || !y.size) return true;
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  return [...small].every((w) => big.has(w));
};

/** Do the file and the database say the same thing, allowing for spelling? */
function sameValue(column: string, fileValue: string, dbValue: string) {
  const kind = FIELD.get(column)?.field.kind;
  if (column === "full_name" || column.endsWith("_name")) return sameName(fileValue, dbValue);
  if (kind === "phone") return phoneKey(fileValue) === phoneKey(dbValue);
  if (kind === "id") return normId(fileValue) === normId(dbValue);
  if (kind === "date") {
    const d = readDate(fileValue);
    return "iso" in d && d.iso === dbValue.slice(0, 10);
  }
  const list = listFor(column);
  if (list) return list(fileValue).value.toLowerCase() === list(dbValue).value.toLowerCase();
  return words(fileValue) === words(dbValue);
}

/* ---------------- the database (optional, read only) ---------------- */

type DbResident = Record<string, unknown> & { id: string };
const db = {
  project: "",
  all: [] as DbResident[],
  byQb: new Map<string, DbResident>(),
  byId: new Map<string, DbResident[]>(),
  byPhone: new Map<string, DbResident[]>(),
  byEmail: new Map<string, DbResident[]>(),
};
const push = (m: Map<string, DbResident[]>, k: string, r: DbResident) => {
  if (k) m.set(k, [...(m.get(k) ?? []), r]);
};

if (useDb) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(
      "--db needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env. Run from the project folder.",
    );
    process.exit(1);
  }
  db.project = new URL(url).host.split(".")[0]!;
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("residents")
      .select("*")
      .range(from, from + 999);
    if (error) {
      console.log("Could not read residents:", error.message);
      process.exit(1);
    }
    db.all.push(...((data ?? []) as DbResident[]));
    if (!data || data.length < 1000) break;
  }
  for (const r of db.all) {
    const s = (k: string) => String(r[k] ?? "").trim();
    if (s(QB)) db.byQb.set(s(QB), r);
    if (normId(s("id_number")).length >= 5) push(db.byId, normId(s("id_number")), r);
    if (phoneKey(s("mobile")).length >= 7) push(db.byPhone, phoneKey(s("mobile")), r);
    if (s("email")) push(db.byEmail, s("email").toLowerCase(), r);
  }
}

/* ---------------- rows ---------------- */

type Level = "fail" | "check";
type Problem = {
  row: number;
  who: string;
  level: Level;
  kind: string;
  column: string;
  value: string;
  detail: string;
};
type RowResult = {
  row: number;
  who: string;
  name: string;
  status: "pass" | "check" | "fail";
  match: string;
  dbName: string;
  fill: number;
  conflicts: number;
  problems: Problem[];
};

const cellsOf = (cells: unknown[], column: string) =>
  (colsFor.get(column) ?? []).map((i) => cells[i]);
/** The first real answer - a "-" in the first Race column must not hide "Indian" in the second. */
const firstCell = (cells: unknown[], column: string) => {
  const given = cellsOf(cells, column).filter((c) => text(c) !== "");
  const real = given.find((c) => column === "medical_condition" || !PLACEHOLDER.test(text(c)));
  return real ?? given[0] ?? "";
};
/** The answer, with "-" and "N/A" counted as blank. */
const answer = (cells: unknown[], column: string) => {
  const t = text(firstCell(cells, column));
  return PLACEHOLDER.test(t) && column !== "medical_condition" ? "" : t;
};

// pass 1: who is each row, and when was it submitted
type Entry = { row: number; cells: unknown[]; key: string; when: number };
const entries: Entry[] = [];
const usedCols = [...colsFor.values()].flat();
for (let i = headerAt + 1; i < grid.length; i += 1) {
  const cells = grid[i]!;
  if (usedCols.every((c) => text(cells[c]) === "")) continue; // a blank row
  const qb = colsFor.has(QB) ? toQbId(answer(cells, QB)) : "";
  const stamp = timestampAt >= 0 ? cells[timestampAt] : undefined;
  entries.push({
    row: i + 1,
    cells,
    key: qb ? `QB ${qb}` : normId(answer(cells, "id_number")),
    when: stamp instanceof Date ? stamp.getTime() : 0,
  });
}

// a student who submitted the form twice: the newer one counts (or the lower
// row, when there is no timestamp to go by)
const newest = new Map<string, Entry>();
for (const e of entries) {
  if (!e.key) continue;
  const held = newest.get(e.key);
  if (!held || e.when >= held.when) newest.set(e.key, e);
}

// pass 2: check every row
const results: RowResult[] = entries.map((e) => {
  const { cells } = e;
  const who = e.key.startsWith("QB ") ? e.key.slice(3) : answer(cells, "id_number");
  const problems: Problem[] = [];
  const add = (level: Level, kind: string, column: string, value: string, detail: string) =>
    problems.push({ row: e.row, who, level, kind, column, value, detail });
  const out: RowResult = {
    row: e.row,
    who,
    name: answer(cells, "full_name"),
    status: "pass",
    match: "",
    dbName: "",
    fill: 0,
    conflicts: 0,
    problems,
  };
  const finish = () => {
    out.status = problems.some((p) => p.level === "fail")
      ? "fail"
      : problems.length
        ? "check"
        : "pass";
    return out;
  };

  /* who is this */
  const rawQb = colsFor.has(QB) ? text(firstCell(cells, QB)) : "";
  if (!e.key) {
    add(
      "fail",
      "no_passport_nric",
      "id_number",
      "",
      "no passport/NRIC number - no safe way to know who this is",
    );
  } else if (/[\s,/]/.test(rawQb)) {
    add("fail", "several_ids", QB, rawQb, "more than one id in one cell");
  } else if (newest.get(e.key) !== e) {
    add(
      "fail",
      "older_submission",
      "id_number",
      who,
      `the same person submitted again on row ${newest.get(e.key)!.row} - the newer one is used`,
    );
    return finish();
  }

  /* each column */
  for (const [column, idxs] of colsFor) {
    if (column === QB) continue;
    const field = FIELD.get(column)?.field;

    // asked twice (the form has Race twice): different answers are worth a look
    if (idxs.length > 1) {
      const given = [...new Set(idxs.map((i) => words(text(cells[i]))).filter(Boolean))];
      if (given.length > 1)
        add(
          "check",
          "answered_twice_differently",
          column,
          idxs.map((i) => text(cells[i])).join(" / "),
          "the same question has two different answers - the first is used",
        );
    }

    const raw = text(firstCell(cells, column));
    if (!raw) continue;
    if (PLACEHOLDER.test(raw) && !column.startsWith("medical_")) {
      add(
        "check",
        "placeholder",
        column,
        raw,
        "a stand-in for blank - saved as blank, the cell could just be empty",
      );
      continue;
    }
    const value = answer(cells, column);
    if (!value || !field) continue;

    if (/\n/.test(value)) {
      add("fail", "several_lines", column, value, "more than one line in one cell");
      continue;
    }

    switch (field.kind) {
      case "email": {
        const p = emailProblem(value);
        if (p) add("fail", "bad_email", column, value, p);
        break;
      }
      case "phone": {
        const { dial, rest } = phoneOf(value);
        const p = phoneProblem(rest, dial);
        if (p) add("fail", "bad_phone", column, value, p);
        else if (!dial)
          add(
            "check",
            "phone_no_country_code",
            column,
            value,
            "no +country code and not a 0-leading Malaysian number",
          );
        break;
      }
      case "date": {
        const d = readDate(firstCell(cells, column));
        if ("kind" in d) add("fail", d.kind, column, value, d.detail);
        else {
          const age = (Date.now() - Date.parse(d.iso)) / (365.25 * 86400000);
          if (age < 15 || age > 60)
            add(
              "check",
              "odd_age",
              column,
              value,
              `read as ${d.iso}, which makes them ${Math.floor(age)} years old`,
            );
        }
        break;
      }
      case "id": {
        const nationality = normCountry(answer(cells, "nationality")).value;
        const looksNric = /^\d{6}-?\d{2}-?\d{4}$/.test(value);
        if (nationality === "MYS" || (!nationality && looksNric)) {
          const p = nricProblem(value);
          if (p) add("fail", "bad_nric", column, value, p);
        } else if (!/^[A-Z0-9]{6,12}$/.test(normId(value))) {
          add(
            "check",
            "odd_passport",
            column,
            value,
            "a passport number is usually 6-12 letters and digits",
          );
        }
        break;
      }
      case "choice": {
        const list = listFor(column);
        if (list && !list(value).matched)
          add(
            "check",
            "not_on_list",
            column,
            value,
            "not one of the app's options - would be saved as typed",
          );
        break;
      }
    }
  }

  const identity = new Set([QB, "id_number", "full_name"]);
  if ([...colsFor.keys()].filter((c) => !identity.has(c)).every((c) => !answer(cells, c)))
    add("check", "nothing_to_fill", "", "", "this row has no details at all");

  /* who is this in the database */
  if (useDb && e.key && !problems.some((p) => p.kind === "several_ids")) {
    let resident: DbResident | undefined;
    if (e.key.startsWith("QB ")) {
      resident = db.byQb.get(who);
      if (resident) out.match = "QuickBooks ID";
    } else {
      const byId = db.byId.get(e.key) ?? [];
      if (byId.length > 1) {
        add(
          "fail",
          "several_residents_match",
          "id_number",
          who,
          `${byId.length} residents share this passport/NRIC - a person has to choose`,
        );
      } else if (byId.length === 1) {
        resident = byId[0];
        out.match = "passport/NRIC";
      }
    }

    if (!resident && !problems.some((p) => p.kind === "several_residents_match")) {
      const phone = phoneKey(answer(cells, "mobile"));
      const email = answer(cells, "email").toLowerCase();
      const maybe = new Map<string, DbResident>();
      for (const r of phone.length >= 7 ? (db.byPhone.get(phone) ?? []) : []) maybe.set(r.id, r);
      for (const r of email ? (db.byEmail.get(email) ?? []) : []) maybe.set(r.id, r);
      if (maybe.size === 1) {
        resident = [...maybe.values()][0];
        out.match = "phone/email only";
        add(
          "check",
          "matched_by_phone_or_email_only",
          "id_number",
          who,
          `passport/NRIC matched nobody, but the phone or email matches ${String(resident!.full_name ?? "")} (database passport/NRIC "${String(resident!.id_number ?? "")}") - confirm it is the same person`,
        );
      } else {
        add(
          "fail",
          "not_in_database",
          "id_number",
          who,
          maybe.size > 1
            ? "passport/NRIC matched nobody, and the phone or email matches several residents"
            : "no resident with this passport/NRIC, phone or email - this file never creates residents",
        );
      }
    }

    if (resident) {
      out.dbName = String(resident.full_name ?? "");
      for (const column of colsFor.keys()) {
        if (column === QB) continue;
        const value = answer(cells, column);
        const inDb = String(resident[column] ?? "").trim();
        if (!value) continue;
        if (!inDb) out.fill += 1;
        else if (!sameValue(column, value, inDb)) {
          out.conflicts += 1;
          add(
            "check",
            "conflict",
            column,
            value,
            `database already has "${inDb}" - it would NOT be overwritten`,
          );
        }
      }
    }
  }

  return finish();
});

/* ---------------- the report ---------------- */

/** What each problem means, for the Patterns sheet. */
const MEANING: Record<string, string> = {
  no_passport_nric: "No passport/NRIC number, so the row cannot be matched to a resident.",
  several_ids: "More than one id in one cell.",
  older_submission: "The student submitted the form more than once. Only the newest is used.",
  several_residents_match: "Several residents in the database have this passport/NRIC.",
  not_in_database: "Nobody in the database matches. This file never creates residents.",
  matched_by_phone_or_email_only:
    "Matched on phone/email, not passport/NRIC. Often a typo in the passport/NRIC.",
  conflict: "File and database disagree. The database value is kept.",
  bad_email: "Not a valid email address.",
  bad_phone: "Phone number too short or too long.",
  phone_no_country_code: "Phone number without a country code.",
  bad_nric: "A Malaysian NRIC that is not 12 digits.",
  odd_passport: "Passport number of an unusual length or with odd characters.",
  impossible_date: "A date that does not exist, like 31/02.",
  unreadable_date: "A date the script cannot read.",
  us_date_order: "Date typed month-first (American), not day-first.",
  odd_age: "Date of birth gives an age under 15 or over 60.",
  not_on_list: "An answer that is not one of the app's dropdown options.",
  placeholder: '"-", "N/A" or similar typed instead of leaving the cell empty.',
  several_lines: "More than one line in one cell.",
  answered_twice_differently: "The same question appears twice with different answers.",
  nothing_to_fill: "The row has no details to add.",
};

const problems = results.flatMap((r) => r.problems);
const count = (s: RowResult["status"]) => results.filter((r) => r.status === s).length;

const groups = new Map<string, Problem[]>();
for (const p of problems) {
  const key = `${p.level}|${p.kind}|${p.column}`;
  groups.set(key, [...(groups.get(key) ?? []), p]);
}
const patterns = [...groups.values()].sort((a, b) =>
  a[0]!.level === b[0]!.level ? b.length - a.length : a[0]!.level === "fail" ? -1 : 1,
);

const rowList = (ps: Problem[]) => {
  const rows = [...new Set(ps.map((p) => p.row))];
  return rows.slice(0, 40).join(", ") + (rows.length > 40 ? ` … +${rows.length - 40} more` : "");
};
const examples = (ps: Problem[]) =>
  [...new Set(ps.map((p) => p.value).filter(Boolean))]
    .slice(0, 5)
    .map((v) => `"${v}"`)
    .join("   ");

function sheetOf(rows: (string | number)[][], widths: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  if (rows.length > 1 && ws["!ref"]) ws["!autofilter"] = { ref: ws["!ref"] };
  return ws;
}

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  wb,
  sheetOf(
    [
      ["File", basename(file)],
      ["Sheet", sheetName],
      ["Header row", headerAt + 1],
      ["Checked on", new Date().toISOString().slice(0, 16).replace("T", " ")],
      ["Database", useDb ? `${db.project} (${db.all.length} residents, read only)` : "not used"],
      [],
      ["Rows read", results.length],
      ["pass", count("pass")],
      ["check - would go through, but look at them", count("check")],
      ["fail - would not go through", count("fail")],
      ...(useDb
        ? [
            [],
            ["Fields that would be filled", results.reduce((n, r) => n + r.fill, 0)],
            ["Conflicts (database kept)", results.reduce((n, r) => n + r.conflicts, 0)],
          ]
        : []),
    ],
    [45, 60],
  ),
  "Summary",
);
XLSX.utils.book_append_sheet(
  wb,
  sheetOf(
    [
      ["Rows", "Level", "Problem", "Field", "What it means", "Row numbers", "Examples"],
      ...patterns.map((ps) => {
        const p = ps[0]!;
        return [
          new Set(ps.map((x) => x.row)).size,
          p.level,
          p.kind,
          p.column ? labelOf(p.column) : "",
          MEANING[p.kind] ?? p.detail,
          rowList(ps),
          examples(ps),
        ];
      }),
    ],
    [6, 7, 28, 34, 60, 40, 50],
  ),
  "Patterns",
);
XLSX.utils.book_append_sheet(
  wb,
  sheetOf(
    [
      [
        "Excel row",
        "Status",
        "Passport/NRIC",
        "Name in file",
        ...(useDb ? ["Matched by", "Name in database", "Would fill", "Conflicts"] : []),
        "Problems",
      ],
      ...results.map((r) => [
        r.row,
        r.status,
        r.who,
        r.name,
        ...(useDb ? [r.match, r.dbName, r.fill, r.conflicts] : []),
        [...new Set(r.problems.map((p) => p.kind))].join(", "),
      ]),
    ],
    useDb ? [9, 7, 18, 28, 16, 28, 10, 10, 60] : [9, 7, 18, 28, 60],
  ),
  "Rows",
);
XLSX.utils.book_append_sheet(
  wb,
  sheetOf(
    [
      ["Excel row", "Passport/NRIC", "Level", "Problem", "Field", "Value", "Detail"],
      ...problems.map((p) => [
        p.row,
        p.who,
        p.level,
        p.kind,
        p.column ? labelOf(p.column) : "",
        p.value,
        p.detail,
      ]),
    ],
    [9, 18, 7, 28, 34, 30, 70],
  ),
  "Problems",
);
XLSX.utils.book_append_sheet(
  wb,
  sheetOf(
    [
      ["Column", "Header in the file", "Read as", "Note"],
      ...columnsRead.map((c) => [
        XLSX.utils.encode_col(c.index),
        c.header,
        c.column ? labelOf(c.column) : "",
        c.note,
      ]),
    ],
    [8, 45, 40, 80],
  ),
  "Columns",
);

const outFile = join(dirname(file), `${basename(file, extname(file))}-check.xlsx`);
writeFileSync(outFile, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

/* ---------------- terminal ---------------- */

const line = "-".repeat(72);
const pad = (s: string | number, n: number) => String(s).padEnd(n);

console.log(`\nFile   ${basename(file)}   (sheet "${sheetName}", header on row ${headerAt + 1})`);
if (useDb) console.log(`Database  ${db.project} - ${db.all.length} residents read`);

console.log(`\n${line}\nCOLUMNS  - check these are read the right way\n${line}`);
for (const c of columnsRead) {
  const readAs = c.column ? labelOf(c.column) : "-";
  console.log(
    `  ${pad(XLSX.utils.encode_col(c.index), 3)} ${pad(c.header.slice(0, 40), 41)} ${readAs}`,
  );
  if (c.note && c.column) console.log(`      ${c.note}`);
}
if (!colsFor.has("id_number") && !colsFor.has(QB))
  console.log("\n  !! No passport/NRIC column - no row can be matched to a resident.");

console.log(`\n${line}\nROWS\n${line}`);
console.log(`  read   ${results.length}`);
console.log(`  pass   ${count("pass")}`);
console.log(`  check  ${count("check")}   would go through, but look at them`);
console.log(`  fail   ${count("fail")}   would not go through`);

console.log(`\n${line}\nPATTERNS  - most common first\n${line}`);
if (!patterns.length) console.log("  none - every row passed");
for (const ps of patterns) {
  const p = ps[0]!;
  const n = new Set(ps.map((x) => x.row)).size;
  console.log(
    `  ${pad(n, 4)} ${pad(p.level, 6)} ${pad(p.kind, 30)} ${p.column ? labelOf(p.column) : ""}`,
  );
}

console.log(`\nFull report (Summary, Patterns, Rows, Problems, Columns):\n  ${outFile}\n`);
