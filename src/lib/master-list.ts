/**
 * Reading the Brachtia master list - the rules, with no database in them.
 *
 * Bulk upload (importResidents) and its dry run (scripts/check-master-list.ts)
 * both read the sheet through this file. A check that follows its own copy of
 * the rules drifts from the upload, and then it passes rows the upload fails.
 */

export type ImportRow = Record<string, string>;

/** Every column the upload reads, under each name it has gone by. */
export const COL = {
  studentId: ["studentid", "student id", "resident id", "quickbooks_id"],
  name: ["studentname", "student name", "full name", "name"],
  unit: ["unit", "unit_no", "unitno"],
  room: ["room", "room_letter"],
  bed: ["bed", "bed_label"],
  status: ["status"],
  start: ["tenancy start", "tenancy_start", "move in"],
  end: ["tenancy end", "tenancy_end"],
  rent: ["monthly rent", "rent"],
  frequency: ["payment frequency", "payment_frequency", "payment schedule", "frequency"],
} as const;

export const pick = (row: ImportRow, ...keys: readonly string[]) => {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
};

/**
 * The dropdown's instruction, pasted into the cell instead of an answer.
 *
 * The master list's Gender and Nationality columns carry a hint - "(Dropdown,
 * Male & Female only)" - and it sometimes ends up inside the cell itself:
 * "Male (Dropdown, Male & Female only)", "MYS (dropdown)". The real answer is
 * still there, in front of it.
 *
 * Left alone, that resident is saved with a gender the database cannot read, so
 * the trigger passes them over and they never get a resident ID - and nobody
 * notices until somebody counts. Exactly that happened to one real resident
 * (00188, found 22 Sept 2026), who had to be corrected by hand.
 *
 * Only a trailing bracket that mentions a dropdown is taken off, so a name that
 * genuinely carries brackets keeps them.
 */
export const withoutHint = (v: string) => {
  let cleaned = v.replace(/\s*\([^)]*dropdown[^)]*\)\s*$/i, "").trim();
  /*
   * The same hint with its closing bracket lost - "040225-14-1207 (Only if
   * Malaysian show" - left behind when a column is narrowed or a cell is
   * trimmed by hand. The answer is still in front of it, so the truncated
   * instruction comes off and the number is kept. An opening bracket with no
   * closing one anywhere after it is never part of a real answer, which is why
   * this does not have to mention a dropdown to be sure of itself.
   */
  const openAt = cleaned.lastIndexOf("(");
  if (openAt !== -1 && !cleaned.slice(openAt).includes(")")) {
    cleaned = cleaned.slice(0, openAt).trim();
  }
  /*
   * Sometimes the cell is the instruction and nothing else - "Dropdown (MMU,
   * HWUM, CityU, UoC, Others)" in a University column, where the brackets hold
   * the choices rather than the word. There is no answer in front to keep, and
   * leaving it would file somebody under a university called "Dropdown", so it
   * is read as blank. Blank is true; a guess would not be.
   */
  return /^dropdown\b/i.test(cleaned) ? "" : cleaned;
};

/**
 * The sheet's cells as one object per row, keyed by lower-case header.
 *
 * The master list has a banner row above the real headers, so the header row is
 * the one with a StudentID cell. Several header names repeat (Status, Tenancy
 * Start, Tenancy End, Duration, Payment Frequency, Remarks); the first block is
 * the live one, so a later column never overwrites it. Blank rows are dropped.
 *
 * `sheetRow` is the row number Excel shows, so a problem can be found in the
 * file. `firstRow` is where the grid starts, when that is not row 1.
 *
 * Null when there is no StudentID column - it is not the master list.
 */
export function rowsFromGrid(grid: unknown[][], firstRow = 1) {
  const headerIdx = grid.findIndex((r) =>
    r.some((c) => String(c).trim().toLowerCase() === "studentid"),
  );
  if (headerIdx === -1) return null;

  const headers = (grid[headerIdx] ?? []).map((c) => String(c).trim().toLowerCase());
  const firstCol = new Map<string, number>();
  headers.forEach((h, i) => {
    if (h && !firstCol.has(h)) firstCol.set(h, i);
  });

  const out: { row: ImportRow; sheetRow: number }[] = [];
  grid.slice(headerIdx + 1).forEach((cells, i) => {
    const row: ImportRow = {};
    // every cell comes through here, so the hint is stripped once rather than
    // at each column that happens to carry one
    for (const [h, c] of firstCol) row[h] = withoutHint(String(cells[c] ?? ""));
    if (Object.values(row).some((v) => v !== "")) {
      out.push({ row, sheetRow: firstRow + headerIdx + 1 + i });
    }
  });
  return out;
}

/**
 * Excel stores an id like 00949 as the number 949, which arrives as "949" or
 * "949.0" once its leading zeros are gone. Brachtia's ids are five digits, so a
 * bare number is padded back.
 */
function toLegacyId(raw: string) {
  const v = raw.trim();
  if (!v) return "";
  const m = /^(\d+)(?:\.0+)?$/.exec(v);
  return m ? m[1]!.padStart(5, "0") : v;
}

export const studentIdOf = (row: ImportRow) => toLegacyId(pick(row, ...COL.studentId));

/**
 * A resident ID the system gave - 26IF0042 - rather than a Brachtia ID ("00256").
 * A sheet's StudentID or Resident ID column can hold either, so the upload asks
 * before saving: a resident ID finds the resident who has it, and is never
 * written into the Brachtia ID field. The university's student ID is another
 * number again, in its own field, and is not read from these columns.
 */
export const isResidentCode = (id: string) => /^\d{2}[IL][MF]\d{4,}$/i.test(id.trim());

/**
 * "1-Jan-24", "2024-01-01" and Excel serials all become "YYYY-MM-DD" or "".
 *
 * Only years 2000-2099 count as a tenancy date. A broken cell (#VALUE!) can
 * still hold a number like 6711910, which as a serial is the year 20276 - and
 * toISOString writes that as "+020276-07-…", which the database refused with
 * "time zone displacement out of range". Out of range now reads as unreadable.
 */
export function toDate(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  let d: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) d = new Date(`${v}T00:00:00Z`);
  else if (/^\d+(\.\d+)?$/.test(v)) {
    // Excel serial: day 1 is 1900-01-01, with the well-known 1900 leap-year bug
    d = new Date(Date.UTC(1899, 11, 30) + Number(v) * 86400000);
  } else {
    // "1-Jan-24" is read as local midnight, which in Malaysia is still the 31st in
    // UTC - so keep the day as written
    const local = new Date(v);
    d = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  }
  if (Number.isNaN(d.getTime())) return "";
  const iso = d.toISOString().slice(0, 10);
  // "2024-02-30" rolls over to March in Date, so a typed date must survive the trip
  if (/^\d{4}-\d{2}-\d{2}$/.test(v) && iso !== v) return "";
  const year = Number(iso.slice(0, 4));
  return /^\d{4}-/.test(iso) && year >= 2000 && year <= 2099 ? iso : "";
}

export const num = (raw: string) => {
  const n = Number(String(raw).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/**
 * The sheet's Payment Frequency as a schedule the rent engine knows.
 *
 * It is typed by hand, so it arrives spelled every way: MONTHLY, "Bi-Monthly",
 * "HALF YEARLY", "Semi Annually", "Full". Half yearly and semi-annually are the
 * same six months, and `semiannual` is the one the system stores, so both land
 * there.
 *
 * Anything it cannot place comes back empty rather than guessed. A resident put
 * on the wrong cycle is invoiced the wrong amount on the wrong day for a year,
 * which is far worse than a row flagged for someone to read.
 */
export function toSchedule(raw: string): string {
  const v = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (!v) return "";
  if (/^month/.test(v)) return "monthly";
  // "bimonth" and not "bi", so biannual is not swept up as every two months
  if (/^bimonth/.test(v) || v === "2monthly" || v === "everytwomonths") return "bimonthly";
  if (/^quarter/.test(v) || v === "3monthly") return "quarterly";
  // biannual is read here, before annual, so "every six months" is not taken
  // for "every twelve"
  if (/^(halfyear|semiannual|semiyear|biannual)/.test(v) || v === "6monthly") return "semiannual";
  if (/^(annual|yearly|peryear)/.test(v) || v === "12monthly") return "annual";
  if (/^(full|upfront|onetime|lump)/.test(v)) return "full";
  return "";
}

/**
 * "(B1)" / "(B2)" / "(B3)" in a student's name is a sponsor intake batch - in
 * this data, always PETRONAS. It describes the sponsorship, not the person, so
 * it is lifted off the name and carried on the payor instead.
 */
export function splitBatch(fullName: string) {
  const m = /\((B\d+)\)/i.exec(fullName);
  if (!m) return { name: fullName.trim(), batch: "" };
  return {
    name: fullName
      .replace(m[0], "")
      .replace(/\s{2,}/g, " ")
      .trim(),
    batch: m[1]!.toUpperCase(),
  };
}

/**
 * Sponsor is who pays. Anything other than "SELF" (MARA, PETRONAS, a university)
 * is a third party.
 *
 * "SELF" only tells us there is no sponsor - it does not say who transfers the
 * money, which is often a parent. Leaving the payor blank there keeps the field
 * honest until someone fills it in; a wrong name would end up on an invoice.
 */
export function toPayor(sponsor: string, batch: string) {
  const v = sponsor.trim();
  if (!v || v.toUpperCase() === "SELF") return { name: "", relationship: "" };
  return { name: batch ? `${v} (${batch})` : v, relationship: "Sponsor" };
}

/**
 * A whole-unit letting is one tenancy shared by several students, and the sheet
 * packs them into a single row: ids separated by spaces, everything else by line
 * breaks.
 *
 *   StudentID   "00357   00358   00359   00360"
 *   StudentName "Liew Jie Sheng\nNg Jun Wei\n…"
 *
 * Each is a real person with their own passport and phone, so the row is split
 * into one row per student. A bed records one occupant, so the students who
 * share are reported, because sharing a letting needs the tenancies table to be
 * modelled properly.
 */
export function expandSharedRows(rows: ImportRow[]): { row: ImportRow; sharesWith?: string }[] {
  const out: { row: ImportRow; sharesWith?: string }[] = [];
  const perLine = [
    "studentname",
    "student name",
    "email",
    "mobilenumber",
    "mobile number",
    "idnumber",
    "id number",
  ];

  for (const row of rows) {
    const rawIds = pick(row, ...COL.studentId);
    const ids = rawIds.split(/[\s,]+/).filter(Boolean);
    if (ids.length < 2) {
      out.push({ row });
      continue;
    }

    const lines: Record<string, string[]> = {};
    for (const key of perLine) {
      const v = row[key];
      if (v)
        lines[key] = String(v)
          .split("\n")
          .map((x) => x.trim());
    }

    const names = lines["studentname"] ?? lines["student name"] ?? [];
    ids.forEach((id, i) => {
      const copy: ImportRow = { ...row };
      copy["studentid"] = id;
      for (const key of perLine) {
        const parts = lines[key];
        if (parts) copy[key] = parts[i] ?? "";
      }
      const others = names.filter((_, j) => j !== i).filter(Boolean);
      out.push({
        row: copy,
        ...(i > 0 || others.length ? { sharesWith: others.join(", ") } : {}),
      });
    });
  }
  return out;
}

/**
 * The sheet writes A-23A-3A where the inventory holds A-23A-03A - the same
 * unit, padded differently. Every numeric-leading part is padded to two
 * digits so both spellings land on the same key.
 */
export const normUnit = (raw: string) =>
  raw
    .trim()
    .toUpperCase()
    .split("-")
    .map((part) => {
      const m = /^(\d+)([A-Z]*)$/.exec(part);
      return m ? `${m[1]!.padStart(2, "0")}${m[2]}` : part;
    })
    .join("-");

export const roomKey = (unitNo: string, letter: string) =>
  `${normUnit(unitNo)}|${letter}`.toLowerCase().trim();

export const bedKey = (unitNo: string, letter: string, label: string) =>
  `${normUnit(unitNo)}|${letter}|${label}`.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * A repeated StudentID is a room move, not a typo, so one row has to win.
 * Status decides it - an Active row beats an Inactive one however they are
 * ordered - and the later row only wins when the two rank the same.
 *
 * Returns, for each StudentID, the index of the row that is used.
 */
export function winnersById(rows: ImportRow[]) {
  const rank = (row: ImportRow) => {
    const s = pick(row, ...COL.status).toLowerCase();
    if (s === "active") return 2;
    if (s === "inactive") return 0;
    return 1; // blank or anything else sits between the two
  };
  const winnerFor = new Map<string, number>();
  rows.forEach((row, i) => {
    const id = studentIdOf(row);
    if (!id) return;
    const held = winnerFor.get(id);
    if (held === undefined || rank(row) >= rank(rows[held]!)) winnerFor.set(id, i);
  });
  return winnerFor;
}

type RoomShape = "single" | "twin" | "unit";

/** The beds a room gets for each way it can be let. */
export const BED_LABELS: Record<RoomShape, string[]> = {
  single: ["Single"],
  twin: ["Twin 1", "Twin 2"],
  unit: ["Unit"],
};

const shapeOf = (label: string): RoomShape =>
  /^single$/i.test(label) ? "single" : /^unit$/i.test(label) ? "unit" : "twin";

/** A row still in force - not someone who has left, not an empty bed. */
const isCurrent = (row: ImportRow) => !/^(inactive|vacant)$/i.test(pick(row, ...COL.status));

/** A letting the sheet names as in force. A row with no status written is weaker. */
const isActiveRow = (row: ImportRow) => /^(active|booked)$/i.test(pick(row, ...COL.status));

/** A row that lets the whole unit: its Room or Bed is written "Unit". */
const isWholeRow = (row: ImportRow) =>
  /^unit$/i.test(pick(row, ...COL.room)) || /^unit$/i.test(pick(row, ...COL.bed));

/** When a row's letting ended, or began when no end is written. Undated sorts oldest. */
const lettingDate = (row: ImportRow) =>
  toDate(pick(row, ...COL.end)) || toDate(pick(row, ...COL.start));

export type UnitKind = "whole" | "rooms";

/**
 * How the sheet lets each unit, and each room in it.
 *
 * The sheet is a history - a student leaves, the next arrives - so its rows for
 * one unit can describe several different lettings, and mixing them sets a unit
 * up wrongly: an old whole-unit letting beside the rooms let after it. So:
 *
 *   - the lettings in force decide first, and an Active (or Booked) row outranks
 *     a row with no status written. A no-status row only sets up a room that no
 *     Active row speaks for - left to sheet order, it overruled an Active single
 *     and took the student's bed away
 *   - a unit nobody lives in now follows its LATEST letting only - the most
 *     recent row decides whole or by room, and each room takes its own latest row
 *   - a unit is let whole (one Unit bed) or by room, never both. Deciding rows
 *     that do both are a clash: the rooms win, and the whole-unit rows are
 *     returned in `clashes` to be reported
 *
 * `units` is keyed by the unit number normalised to lower case; `shapes` by
 * roomKey, with "unit" for the Unit slot of a whole unit. Two Active rows that
 * let one room differently are returned in `conflicts` - the later is used.
 */
export function roomPlan(rows: ImportRow[]) {
  const byUnit = new Map<string, { row: ImportRow; index: number }[]>();
  rows.forEach((row, index) => {
    const unitNo = pick(row, ...COL.unit);
    if (!unitNo || !pick(row, ...COL.room)) return;
    const key = normUnit(unitNo).toLowerCase();
    byUnit.set(key, [...(byUnit.get(key) ?? []), { row, index }]);
  });

  const units = new Map<string, UnitKind>();
  const shapes = new Map<string, RoomShape>();
  const conflicts: {
    index: number;
    unitNo: string;
    letter: string;
    was: RoomShape;
    used: RoomShape;
  }[] = [];
  const clashes: { index: number; unitNo: string }[] = [];

  for (const [key, entries] of byUnit) {
    const unitNo = pick(entries[0]!.row, ...COL.unit);
    const current = entries.filter((e) => isCurrent(e.row));
    const active = current.filter((e) => isActiveRow(e.row));

    let basis: typeof entries;
    if (active.length) {
      basis = active;
    } else if (current.length) {
      basis = current;
    } else {
      // newest first; on the same date the later row in the sheet is newer
      const ordered = [...entries].sort(
        (a, b) => lettingDate(b.row).localeCompare(lettingDate(a.row)) || b.index - a.index,
      );
      const latest = ordered[0]!;
      basis = isWholeRow(latest.row) ? [latest] : ordered.filter((e) => !isWholeRow(e.row));
    }

    const wholeRows = basis.filter((e) => isWholeRow(e.row));
    const roomRows = basis.filter((e) => !isWholeRow(e.row));
    const kind: UnitKind = roomRows.length ? "rooms" : "whole";
    units.set(key, kind);
    if (roomRows.length) {
      for (const e of wholeRows) clashes.push({ index: e.index, unitNo });
    }

    if (kind === "whole") {
      shapes.set(roomKey(unitNo, "Unit"), "unit");
      continue;
    }

    const seen = new Map<string, RoomShape>();
    const roomOf = (e: (typeof entries)[number]) => {
      const label = pick(e.row, ...COL.bed);
      if (!label || isWholeRow(e.row)) return null;
      const letter = pick(e.row, ...COL.room);
      return { letter, rk: roomKey(unitNo, letter), shape: shapeOf(label) };
    };

    if (current.length) {
      // Active rows in sheet order: the later letting of a room wins, and two
      // that disagree are reported
      for (const e of active) {
        const room = roomOf(e);
        if (!room) continue;
        const was = seen.get(room.rk);
        if (was && was !== room.shape) {
          conflicts.push({ index: e.index, unitNo, letter: room.letter, was, used: room.shape });
        }
        seen.set(room.rk, room.shape);
      }
      // rows with no status only set up the rooms no Active row speaks for
      const settled = new Set(seen.keys());
      for (const e of current) {
        if (isActiveRow(e.row)) continue;
        const room = roomOf(e);
        if (room && !settled.has(room.rk)) seen.set(room.rk, room.shape);
      }
    } else {
      // history, newest first: each room keeps its latest letting
      for (const e of roomRows) {
        const room = roomOf(e);
        if (room && !seen.has(room.rk)) seen.set(room.rk, room.shape);
      }
    }
    for (const [rk, shape] of seen) shapes.set(rk, shape);
  }

  return { units, shapes, conflicts, clashes };
}
