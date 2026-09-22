/**
 * Run the master list through Bulk upload - without uploading it.
 *
 *   bun scripts/check-master-list.ts "<master list.xlsx>"
 *
 * Every row goes through the same rules the Bulk upload button uses
 * (src/lib/master-list.ts), and every unit, room and bed is looked up in the
 * database .env points at (test-bratchia). Read only: nothing is written.
 *
 * Output:
 *   terminal                          counts per colour, no names - safe to paste to Claude
 *   "<file> - upload check.xlsx"      next to the file, and opened: a colour legend,
 *                                     the rows with only the problem cells coloured,
 *                                     and an issue list. It has names, so it stays
 *                                     on this Mac. Drawn by master-list-report.py.
 *
 * Six colours, worst first:
 *   red      not imported - the student does not reach the system from this row
 *   orange   two students on one bed, or a room let two ways
 *   yellow   the bed is not in Homes
 *   purple   a whole-unit letting shared by several students
 *   blue     a spelling the app does not know
 *   green    saved, but rent or a date is missing
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as XLSX from "xlsx";

import { normCountry, normUniversity } from "@/lib/reference-data";
import {
  BED_LABELS,
  COL,
  bedKey,
  expandSharedRows,
  normUnit,
  num,
  pick,
  roomKey,
  roomPlan,
  rowsFromGrid,
  studentIdOf,
  toDate,
  toSchedule,
  winnersById,
} from "@/lib/master-list";

/* ---------------- colours and patterns ---------------- */

/** Same fills as the student-data cleanup file, so the two read alike. */
const GROUPS = {
  red: {
    fill: "FFC7CE",
    ink: "#c0392b",
    label: "Not imported",
    meaning: "Not imported - StudentID missing or used twice",
    who: "Ops - assign or correct the StudentID",
  },
  orange: {
    fill: "FFD9B3",
    ink: "#d35400",
    label: "Bed clash",
    meaning: "Two students on one bed, or a room let two ways",
    who: "Ops - only they know who actually lives there",
  },
  yellow: {
    fill: "FFF2CC",
    ink: "#b7950b",
    label: "No bed",
    meaning: "The bed is not in Homes",
    who: "Ops corrects the sheet, or Homes adds the unit or room",
  },
  purple: {
    fill: "E6DFF0",
    ink: "#7d3c98",
    label: "Shared letting",
    meaning: "Several students share one whole-unit letting",
    who: "App - a bed holds one student until tenancies exist",
  },
  blue: {
    fill: "DDEBF7",
    ink: "#2e86c1",
    label: "Spelling",
    meaning: "Nationality or university not recognised",
    who: "App - add the spelling to the known list",
  },
  green: {
    fill: "E2EFDA",
    ink: "#1e8449",
    label: "Missing",
    meaning: "Saved, but rent or a date is missing or unreadable",
    who: "Ops - fill in from the tenancy agreement",
  },
} satisfies Record<
  string,
  { fill: string; ink: string; label: string; meaning: string; who: string }
>;

type Group = keyof typeof GROUPS;

/** `fields` are the master list headers whose cell gets the colour. */
const PATTERNS = {
  "no-id": {
    group: "red",
    fields: ["StudentID"],
    title: "No StudentID",
    why: "A row with no StudentID is read as an empty bed. The name on it is ignored.",
  },
  repeat: {
    group: "red",
    fields: ["StudentID"],
    title: "StudentID used twice",
    why: "Only one row per student is used. An Active row beats an Inactive one; otherwise the later row wins.",
  },
  taken: {
    group: "orange",
    fields: ["Bed"],
    title: "Bed already taken",
    why: "An earlier row already put someone in this bed. The first row keeps it.",
  },
  "shape-clash": {
    group: "orange",
    fields: ["Room", "Bed"],
    title: "Room let two ways",
    why: "Current rows let this room as both single and twin. The later one is used, so the other beds disappear.",
  },
  "unit-clash": {
    group: "orange",
    fields: ["Room", "Bed"],
    title: "Unit let whole and by room",
    why: "A unit is let whole or by room, never both. Current rows do both here, so the rooms win and this whole-unit letting is not placed.",
  },
  "no-unit": {
    group: "yellow",
    fields: ["Unit"],
    title: "Unit not in Homes",
    why: "No unit with this number is in the inventory.",
  },
  "no-room": {
    group: "yellow",
    fields: ["Room"],
    title: "Room not in that unit",
    why: "The unit exists, but has no room with this letter.",
  },
  "no-bed": {
    group: "yellow",
    fields: ["Bed"],
    title: "Bed not in that room",
    why: `The room has no bed by this name - often because the room was let the other way. Beds are ${Object.values(BED_LABELS).flat().join(", ")}.`,
  },
  "no-place": {
    group: "yellow",
    fields: ["Unit", "Room", "Bed"],
    title: "No unit, room or bed given",
    why: "The row does not say where the student lives, so they are saved without a bed.",
  },
  shared: {
    group: "purple",
    fields: ["StudentID"],
    title: "Several students in one row",
    why: "Each student is saved, but a bed holds one person, so none of them is placed.",
  },
  university: {
    group: "blue",
    fields: ["University"],
    title: "University not recognised",
    why: "Saved exactly as written, so it will not match the university filter.",
  },
  nationality: {
    group: "blue",
    fields: ["Nationality"],
    title: "Nationality not recognised",
    why: "Saved exactly as written, not as a country.",
  },
  "bad-date": {
    group: "green",
    fields: ["Tenancy Start"],
    title: "Date cannot be read",
    why: "The upload leaves the date empty.",
  },
  "end-first": {
    group: "green",
    fields: ["Tenancy End"],
    title: "Tenancy ends before it starts",
    why: "The end date is earlier than the start date.",
  },
  "no-rent": {
    group: "green",
    fields: ["Monthly Rent"],
    title: "Placed with no rent",
    why: "The bed is filled, but its monthly rent is empty.",
  },
  "no-frequency": {
    group: "green",
    fields: ["Payment Frequency"],
    title: "Placed with no payment frequency",
    why: "Payment Frequency is empty. Without it no rent invoice can be scheduled for this tenancy. This is the commonest gap in the sheet, so it is counted on its own rather than mixed in with misspelt cycles.",
  },
  "bad-frequency": {
    group: "blue",
    fields: ["Payment Frequency"],
    title: "Payment frequency not recognised",
    why: "The cell holds a spelling the system cannot map to a cycle. It knows Monthly, Bi-Monthly, Quarterly, Half-Yearly and Semi-Annually (one cycle, two spellings - kept as semi-annual), Annually, and Fully. Correct the spelling and the row schedules its own rent.",
  },
} satisfies Record<string, { group: Group; fields: string[]; title: string; why: string }>;

type Pattern = keyof typeof PATTERNS;

type Finding = {
  pattern: Pattern;
  group: Group;
  sheetRow: number;
  studentId: string;
  fields: string[];
  problem: string;
};

/* ---------------- read the file ---------------- */

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!file) {
  console.log('Usage: bun scripts/check-master-list.ts "<master list.xlsx>"');
  process.exit(1);
}

const book = XLSX.read(readFileSync(file), { type: "buffer" });
const sheetName = book.SheetNames[0];
const sheet = sheetName ? book.Sheets[sheetName] : undefined;
if (!sheetName || !sheet) {
  console.log("That file has no sheets.");
  process.exit(1);
}
const grid = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  defval: "",
  blankrows: true,
}) as unknown[][];
const firstRow = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]).s.r + 1 : 1;
const parsed = rowsFromGrid(grid, firstRow);
if (!parsed) {
  console.log("No StudentID column found - is this the master list?");
  process.exit(1);
}

// one row per student, remembering the row in the file it came from
const expanded = parsed.flatMap(({ row, sheetRow }) =>
  expandSharedRows([row]).map((e) => ({ ...e, sheetRow })),
);
const rows = expanded.map((e) => e.row);

/* ---------------- the inventory, read only ---------------- */

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log(
    "Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env. Run from the project folder.",
  );
  process.exit(1);
}
const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(url, key, { auth: { persistSession: false } });

// the same three reads the upload makes, and nothing else - no student data
const [{ data: units }, { data: rooms }, { data: beds }] = await Promise.all([
  supabase.from("units").select("id, unit_no"),
  supabase.from("rooms").select("id, unit_id, letter"),
  supabase.from("beds").select("id, room_id, label"),
]);
if (!units || !rooms || !beds) {
  console.log("Could not read units, rooms and beds from the database.");
  process.exit(1);
}

const unitNoById = new Map(units.map((u) => [u.id as string, String(u.unit_no)]));
const knownUnits = new Set(units.map((u) => normUnit(String(u.unit_no))));
const roomById = new Map(
  rooms.map((r) => [
    r.id as string,
    { unitNo: unitNoById.get(r.unit_id as string) ?? "", letter: String(r.letter) },
  ]),
);
const roomIdByKey = new Map(
  [...roomById].map(([id, r]) => [roomKey(r.unitNo, r.letter), id] as const),
);

// the upload first reshapes each room the way the sheet lets it, then places
// people - so a bed is looked for among the beds the room will have by then
const labelsByRoom = new Map<string, string[]>();
for (const b of beds) {
  const list = labelsByRoom.get(b.room_id as string) ?? [];
  list.push(String(b.label));
  labelsByRoom.set(b.room_id as string, list);
}
const { units: kinds, shapes, conflicts, clashes } = roomPlan(rows);

// a unit is let whole or by room, never both: the upload removes the rooms of
// the other kind and adds a Unit bed to a whole unit that has none. (A unit it
// leaves alone because someone who stays is in the way is not acted out here.)
for (const [k, kind] of kinds) {
  const unit = units.find((u) => normUnit(String(u.unit_no)).toLowerCase() === k);
  if (!unit) continue;
  const unitNo = String(unit.unit_no);
  for (const [roomId, room] of [...roomById]) {
    if (room.unitNo !== unitNo) continue;
    const slot = room.letter.toLowerCase() === "unit";
    if (kind === "whole" ? !slot : slot) {
      roomById.delete(roomId);
      labelsByRoom.delete(roomId);
      roomIdByKey.delete(roomKey(room.unitNo, room.letter));
    }
  }
  if (kind === "whole" && !roomIdByKey.has(roomKey(unitNo, "Unit"))) {
    const id = `new-unit-${String(unit.id)}`;
    roomById.set(id, { unitNo, letter: "Unit" });
    roomIdByKey.set(roomKey(unitNo, "Unit"), id);
    labelsByRoom.set(id, BED_LABELS.unit);
  }
}

for (const [k, shape] of shapes) {
  const roomId = roomIdByKey.get(k);
  if (roomId) labelsByRoom.set(roomId, BED_LABELS[shape]);
}
const bedIdByKey = new Map<string, string>();
for (const [roomId, labels] of labelsByRoom) {
  const room = roomById.get(roomId);
  if (!room) continue;
  for (const l of labels) {
    bedIdByKey.set(bedKey(room.unitNo, room.letter, l), `${roomId}#${l.toLowerCase()}`);
  }
}

/* ---------------- the upload, step by step ---------------- */

const findings: Finding[] = [];
const flag = (pattern: Pattern, i: number, detail = "", fields?: string[]) => {
  const { group, title } = PATTERNS[pattern];
  findings.push({
    pattern,
    group,
    sheetRow: expanded[i]!.sheetRow,
    studentId: studentIdOf(rows[i]!),
    fields: fields ?? PATTERNS[pattern].fields,
    problem: detail ? `${title}: ${detail}` : title,
  });
};

for (const c of conflicts) flag("shape-clash", c.index, `${c.was} earlier, ${c.used} here`);
for (const c of clashes) flag("unit-clash", c.index, `${c.unitNo} is let by room`);

const winners = winnersById(rows);
const claimedBy = new Map<string, number>();
let imported = 0;
let placed = 0;
let emptied = 0;

for (let i = 0; i < rows.length; i += 1) {
  const row = rows[i]!;
  const id = studentIdOf(row);
  const name = pick(row, ...COL.name);
  const unitNo = pick(row, ...COL.unit);
  const letter = pick(row, ...COL.room);
  const label = pick(row, ...COL.bed);
  const bedId = bedIdByKey.get(bedKey(unitNo, letter, label));
  const rawStatus = pick(row, ...COL.status);
  const vacantName = /^vacant$/i.test(name);
  const freesTheBed = /^(inactive|vacant)$/i.test(rawStatus);

  if (!id || vacantName || freesTheBed) {
    if (bedId) emptied += 1;
    if (!id || vacantName) {
      if (!id && name && !vacantName) flag("no-id", i);
      continue;
    }
  }

  const winner = winners.get(id);
  if (winner !== i) {
    flag("repeat", i, `row ${expanded[winner ?? 0]!.sheetRow} is used instead`);
    continue;
  }

  const rawStart = pick(row, ...COL.start);
  const rawEnd = pick(row, ...COL.end);
  const start = toDate(rawStart);
  const end = toDate(rawEnd);
  if (rawStart && !start) flag("bad-date", i, `"${rawStart}"`, ["Tenancy Start"]);
  if (rawEnd && !end) flag("bad-date", i, `"${rawEnd}"`, ["Tenancy End"]);
  if (start && end && end < start) flag("end-first", i, `${start} → ${end}`);

  // the upload reads this column the same way - a row the check passes here is
  // a row the upload can schedule rent for
  /*
   * Empty and misspelt are two different jobs: one is a cell nobody has filled
   * in, the other a word the system does not know. Counted together they hid
   * which of the two the sheet actually suffers from - it is almost all empties.
   */
  const rawFrequency = pick(row, ...COL.frequency);
  if (!rawFrequency) {
    flag("no-frequency", i, "empty");
  } else if (!toSchedule(rawFrequency)) {
    flag("bad-frequency", i, `"${rawFrequency}"`);
  }

  const university = normUniversity(pick(row, "university"));
  if (!university.matched) flag("university", i, `"${university.value}"`);
  const nationality = normCountry(pick(row, "nationality"));
  if (!nationality.matched) flag("nationality", i, `"${nationality.value}"`);

  imported += 1;
  if (freesTheBed) continue;

  const sharesWith = expanded[i]!.sharesWith;
  if (sharesWith) {
    flag("shared", i, `with ${sharesWith}`);
    continue;
  }

  if (!bedId) {
    if (!unitNo && !letter && !label) flag("no-place", i, rawStatus || "no status");
    else if (!knownUnits.has(normUnit(unitNo))) flag("no-unit", i, `"${unitNo}"`);
    else if (!roomIdByKey.has(roomKey(unitNo, letter))) flag("no-room", i, `${unitNo} / ${letter}`);
    else flag("no-bed", i, `${unitNo} / ${letter} / ${label}`);
    continue;
  }

  const heldBy = claimedBy.get(bedId);
  if (heldBy !== undefined && studentIdOf(rows[heldBy]!) !== id) {
    flag("taken", i, `by ${studentIdOf(rows[heldBy]!)} on row ${expanded[heldBy]!.sheetRow}`);
    continue;
  }
  claimedBy.set(bedId, i);
  placed += 1;
  if (num(pick(row, ...COL.rent)) == null) flag("no-rent", i);
}

/* ---------------- terminal: counts only ---------------- */

const counts = new Map<Pattern, number>();
for (const f of findings) counts.set(f.pattern, (counts.get(f.pattern) ?? 0) + 1);

const ansi = (hex: string, text: string) => {
  const [r, g, b] = [1, 3, 5].map((n) => parseInt(hex.slice(n, n + 2), 16));
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
};
const bold = (t: string) => `\x1b[1m${t}\x1b[0m`;

console.log(bold("\nMaster list dry run - nothing was uploaded"));
console.log(
  `  ${parsed.length} rows read${expanded.length > parsed.length ? ` (${expanded.length} students once shared rows are split)` : ""}`,
);
console.log(
  `  ${imported} would be imported · ${placed} placed in a bed · ${emptied} beds emptied`,
);
if ([units, rooms, beds].some((t) => t.length === 1000)) {
  console.log(
    ansi(
      "#c0392b",
      "  ! The database returned exactly 1000 rows for one table - that is a cap, so some beds may be missing from this check AND from the upload.",
    ),
  );
}

for (const g of Object.keys(GROUPS) as Group[]) {
  const inGroup = (Object.keys(PATTERNS) as Pattern[]).filter(
    (p) => PATTERNS[p].group === g && counts.get(p),
  );
  if (!inGroup.length) continue;
  console.log(`\n${ansi(GROUPS[g].ink, "■")} ${bold(GROUPS[g].meaning)}`);
  for (const p of inGroup) {
    console.log(`    ${PATTERNS[p].title.padEnd(30)} ${counts.get(p)}`);
  }
}
if (!findings.length) console.log("\nEvery row goes through cleanly.");

/* ---------------- the coloured copy, on this Mac ---------------- */

const report = {
  sheet: sheetName,
  subtitle: `${basename(file)}  ·  checked against the Homes inventory in test-bratchia  ·  ${new Date().toISOString().slice(0, 10)}`,
  summary: { rows: parsed.length, imported, placed, emptied },
  note: "Red stops the student reaching the system. Orange, yellow and purple leave them without a bed. Blue and green go through, but need tidying.",
  groups: (Object.keys(GROUPS) as Group[]).map((g) => ({
    key: g,
    ...GROUPS[g],
    patterns: (Object.keys(PATTERNS) as Pattern[])
      .filter((p) => PATTERNS[p].group === g)
      .map((p) => ({ key: p, title: PATTERNS[p].title, why: PATTERNS[p].why })),
  })),
  findings,
};

// the findings hold StudentIDs, so they pass through a private temp folder
// that is removed straight after
const temp = mkdtempSync(join(tmpdir(), "master-check-"));
const findingsFile = join(temp, "findings.json");
writeFileSync(findingsFile, JSON.stringify(report));

const out = join(dirname(file), `${basename(file, extname(file))} - upload check.xlsx`);
const drawer = join(dirname(fileURLToPath(import.meta.url)), "master-list-report.py");
const drawn = spawnSync("python3", [drawer, file, findingsFile, out], { encoding: "utf8" });
rmSync(temp, { recursive: true, force: true });

if (drawn.status !== 0) {
  console.log(ansi("#c0392b", "\nCould not draw the Excel report:"));
  console.log(drawn.stderr || drawn.error?.message);
  console.log("If it says openpyxl is missing: pip3 install openpyxl");
  process.exit(1);
}

console.log(`\nColoured copy with names: ${out}\n`);
if (process.platform === "darwin" && !process.argv.includes("--no-open")) {
  spawnSync("open", [out]);
}
