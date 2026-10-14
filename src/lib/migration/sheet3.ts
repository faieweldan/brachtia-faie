import { COUNTRIES, RACE_OPTIONS, RELIGION_OPTIONS } from "@/lib/reference-data";
import { normUnit, toDate, toSchedule } from "@/lib/master-list";
import { fmtDate, type Resident, type Unit } from "@/lib/ops-store";
import { bedForPlacement } from "@/lib/room-offer";
import { nextRentAfter, shiftDate } from "@/lib/rental-schedule";

export type MigrationIssueLevel = "warning" | "blocked";

export type MigrationIssue = {
  level: MigrationIssueLevel;
  field: string;
  message: string;
};

export type MigrationPreviewRow = {
  sourceRow: number;
  quickbooksId: string;
  residentName: string;
  email: string;
  place: string;
  /** "Single" in a twin room: Twin 1, the room let whole as a single */
  wholeRoom?: boolean;
  tenancyStart: string;
  tenancyEnd: string;
  action: "Create resident" | "Update resident";
  status: "ready" | "warning" | "blocked";
  stayDuration: string;
  term: "Short Term" | "Long Term" | "";
  nextBillingPeriod: string;
  nextPaymentDue: string;
  nextPaymentAmount: number | null;
  charges: {
    proratedRent: number;
    advanceRent: number;
    securityDeposit: number;
    utilitiesDeposit: number;
    accessCardDeposit: number;
    residentCardCharges: number;
    adminAgreementCharges: number;
  };
  issues: MigrationIssue[];
  /** what the import writes, exactly as checked here (12 Oct 2026) */
  record: MigrationRecord;
};

/** One resident as the import saves them - read and checked by the preview, never re-read. */
export type MigrationRecord = {
  gender: string;
  dial: string;
  mobile: string;
  nationality: string;
  nric: string;
  passport: string;
  university: string;
  residentType: string;
  paidBy: string;
  payorName: string;
  schedule: string;
  monthlyRent: number;
  starterPack: number;
  totalPaid: number;
  taUrl: string;
  invoiceUrl: string;
  /** the QuickBooks number, as written: INV:IP_00894 */
  invoiceNo: string;
  bedId: string;
  unitNo: string;
  room: string;
  unitType: string;
  occupancy: string;
};

export type MigrationPreview = {
  rows: MigrationPreviewRow[];
  missingHeaders: string[];
  totals: { residents: number; ready: number; warning: number; blocked: number };
};

type SystemSnapshot = {
  units: Unit[];
  residents: Resident[];
  /** yyyy-mm-dd - existing residents are paid up to the period this falls in */
  today?: string;
};
type Parsed = { values: Record<string, unknown>; sourceRow: number };

export const SHEET3_SIGNATURE = ["Resident Name", "Tenancy Start", "QuickBooks ID"] as const;

const REQUIRED_HEADERS = [
  "Resident Name",
  "Country Code",
  "Mobile Number",
  "Email",
  "Nationality",
  "Residence",
  "Unit no.",
  "Room",
  "Bed",
  "Tenancy Start",
  "Tenancy End",
  "Monthly rent",
  "Payment frequency",
  "QuickBooks ID",
  "Security Deposit (RM) (refundable)",
  "Utilities deposit (RM) (refundable)",
  "Copy of Tenancy Agreement",
  "Copy of Invoice",
] as const;

const CHARGE_HEADERS = {
  proratedRent: "First month rent - pro-rated x/x days",
  advanceRent: "Advance rental (RM)",
  securityDeposit: "Security Deposit (RM) (refundable)",
  utilitiesDeposit: "Utilities deposit (RM) (refundable)",
  accessCardDeposit: "Access card deposit (refundable)",
  residentCardCharges: "Resident card charges",
  adminAgreementCharges: "Admin + agreement charges",
} as const;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RACE = new Set(RACE_OPTIONS.map((o) => o.value.toLowerCase()));
const RELIGION = new Set(RELIGION_OPTIONS.map((o) => o.value.toLowerCase()));
const DIALS = new Set(COUNTRIES.map((c) => c.dial));

const text = (value: unknown) => {
  if (value == null) return "";
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return String(value).trim();
};

const identity = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const roomIdentity = (value: string) => identity(value).replace(/^room\s+/, "");
const bedIdentity = (value: string) => identity(value).replace(/\s+/g, " ");

function money(value: unknown): number | null {
  if (value == null || text(value) === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = text(value)
    .replace(/\brm\b/gi, "")
    .replace(/,/g, "")
    .trim();
  if (!cleaned) return 0;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

function legacyId(value: unknown) {
  const raw = text(value);
  const number = /^(\d+)(?:\.0+)?$/.exec(raw);
  return number ? number[1]!.padStart(5, "0") : raw;
}

function normalDial(value: unknown) {
  let dial = text(value).replace(/[()\s-]/g, "");
  if (dial.startsWith("00")) dial = `+${dial.slice(2)}`;
  if (dial && !dial.startsWith("+")) dial = `+${dial}`;
  return dial;
}

function stayDuration(start: string, end: string) {
  if (!start || !end || end < start) return "";
  const s = new Date(`${start}T00:00:00Z`);
  const inclusiveEnd = new Date(`${end}T00:00:00Z`);
  inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 1);
  let months =
    (inclusiveEnd.getUTCFullYear() - s.getUTCFullYear()) * 12 +
    inclusiveEnd.getUTCMonth() -
    s.getUTCMonth();
  if (inclusiveEnd.getUTCDate() < s.getUTCDate()) months -= 1;
  const anchor = new Date(s);
  const targetMonth = s.getUTCMonth() + months;
  anchor.setUTCDate(1);
  anchor.setUTCMonth(targetMonth);
  const last = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0),
  ).getUTCDate();
  anchor.setUTCDate(Math.min(s.getUTCDate(), last));
  const days = Math.round((inclusiveEnd.getTime() - anchor.getTime()) / 86_400_000);
  return `${months} month${months === 1 ? "" : "s"}${days ? ` ${days} day${days === 1 ? "" : "s"}` : ""}`;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  if (!aStart || !bStart) return true;
  return aStart <= (bEnd || "9999-12-31") && bStart <= (aEnd || "9999-12-31");
}

/**
 * A header as a key: "Resident name", "Resident Name" and "Unit no. " are the
 * same column. Data Labelling was edited by hand and its capitals and trailing
 * spaces moved; matching letters exactly refused a good file (12 Oct 2026).
 */
const headerKey = (value: unknown) => text(value).toLowerCase().replace(/\s+/g, " ");

function parseGrid(grid: unknown[][]): { rows: Parsed[]; headers: string[] } | null {
  const headerIndex = grid.findIndex((row) => {
    const cells = new Set(row.map(headerKey));
    return SHEET3_SIGNATURE.every((header) => cells.has(headerKey(header)));
  });
  if (headerIndex < 0) return null;
  const headers = (grid[headerIndex] ?? []).map(headerKey);
  const rows: Parsed[] = [];
  grid.slice(headerIndex + 1).forEach((cells, offset) => {
    const values: Record<string, unknown> = {};
    headers.forEach((header, column) => {
      if (header && !(header in values)) values[header] = cells[column];
    });
    if (Object.values(values).some((value) => text(value) !== "")) {
      rows.push({ values, sourceRow: headerIndex + offset + 2 });
    }
  });
  return { rows, headers };
}

export function isSheet3Grid(grid: unknown[][]) {
  return parseGrid(grid) !== null;
}

/**
 * Read-only Migration 1 check. This function never writes to Supabase. Blank
 * charge cells are deliberately normalised to RM0, and Total Initial Payment is
 * not reconciled to these lines because a legacy invoice can contain other lines.
 */
export function previewSheet3Grid(grid: unknown[][], system: SystemSnapshot): MigrationPreview {
  const parsed = parseGrid(grid);
  if (!parsed) {
    return {
      rows: [],
      missingHeaders: [...SHEET3_SIGNATURE],
      totals: { residents: 0, ready: 0, warning: 0, blocked: 0 },
    };
  }

  const headerSet = new Set(parsed.headers);
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headerSet.has(headerKey(header)));
  const residentsByQuickBooks = new Map(
    system.residents.filter((r) => r.quickbooksId).map((r) => [identity(r.quickbooksId), r]),
  );
  const residentsByEmail = new Map(
    system.residents.filter((r) => r.email).map((r) => [identity(r.email), r]),
  );
  const residentsById = new Map(system.residents.map((r) => [r.id, r]));

  const rows: MigrationPreviewRow[] = parsed.rows.map(({ values, sourceRow }) => {
    const issues: MigrationIssue[] = [];
    const add = (level: MigrationIssueLevel, field: string, message: string) =>
      issues.push({ level, field, message });
    const value = (header: string) => values[headerKey(header)];

    const quickbooksId = legacyId(value("QuickBooks ID"));
    const residentName = text(value("Resident Name"));
    const email = text(value("Email")).toLowerCase();
    const residence = text(value("Residence"));
    const unitNo = text(value("Unit no."));
    const room = text(value("Room"));
    const bedLabel = text(value("Bed"));
    const place = [residence, unitNo, room && `Room ${room}`, bedLabel].filter(Boolean).join(" · ");
    let wholeRoom = false;
    let bedId = "";

    if (!quickbooksId) add("blocked", "QuickBooks ID", "Required to match this resident safely.");
    if (!residentName) add("blocked", "Resident Name", "Resident name is blank.");
    if (!email) add("blocked", "Email", "Email is blank.");
    else if (!EMAIL.test(email)) add("blocked", "Email", "Email format is not valid.");

    const dial = normalDial(value("Country Code"));
    const mobile = text(value("Mobile Number")).replace(/\D/g, "");
    if (!dial || !DIALS.has(dial)) {
      add(
        "blocked",
        "Country Code",
        dial ? `Country code ${dial} is not recognised.` : "Country code is blank.",
      );
    }
    if (!mobile) add("blocked", "Mobile Number", "Mobile number is blank.");

    const race = identity(text(value("Race")));
    const religion = identity(text(value("Religion")));
    if (race && race !== "n/a" && !RACE.has(race)) {
      add("warning", "Race", "Use one fixed option, or Other. No extra description is needed.");
    }
    if (religion && religion !== "n/a" && !RELIGION.has(religion)) {
      add("warning", "Religion", "Use one fixed option, or Other. No extra description is needed.");
    }

    const start = toDate(text(value("Tenancy Start")));
    const end = toDate(text(value("Tenancy End")));
    if (!start || !end) add("blocked", "Tenancy dates", "Start or end date cannot be read.");
    else if (start >= end)
      add("blocked", "Tenancy dates", "Tenancy start must be before tenancy end.");
    else if (end <= "2026-09-30") {
      add(
        "blocked",
        "Tenancy End",
        "Migration 1 only includes tenancies ending after 30 Sep 2026.",
      );
    }
    const duration = stayDuration(start, end);
    if (start && end && !duration)
      add("blocked", "Stay Duration", "Duration cannot be calculated.");
    const term =
      start && end ? (end >= shiftDate(start, { months: 6 }) ? "Long Term" : "Short Term") : "";

    const rent = money(value("Monthly rent"));
    if (rent == null || rent <= 0)
      add("blocked", "Monthly rent", "Monthly rent must be a number above zero.");
    const schedule = toSchedule(text(value("Payment frequency")));
    if (!schedule) add("blocked", "Payment frequency", "Payment frequency is not recognised.");

    const charges = {
      proratedRent: money(value(CHARGE_HEADERS.proratedRent)),
      advanceRent: money(value(CHARGE_HEADERS.advanceRent)),
      securityDeposit: money(value(CHARGE_HEADERS.securityDeposit)),
      utilitiesDeposit: money(value(CHARGE_HEADERS.utilitiesDeposit)),
      accessCardDeposit: money(value(CHARGE_HEADERS.accessCardDeposit)),
      residentCardCharges: money(value(CHARGE_HEADERS.residentCardCharges)),
      adminAgreementCharges: money(value(CHARGE_HEADERS.adminAgreementCharges)),
    };
    for (const [key, amount] of Object.entries(charges)) {
      if (amount == null)
        add(
          "blocked",
          CHARGE_HEADERS[key as keyof typeof CHARGE_HEADERS],
          "Amount is not a number.",
        );
    }
    const safeCharges = Object.fromEntries(
      Object.entries(charges).map(([key, amount]) => [key, amount ?? 0]),
    ) as MigrationPreviewRow["charges"];

    if (!text(value("Copy of Tenancy Agreement"))) {
      add("blocked", "Copy of Tenancy Agreement", "Existing tenancy agreement is missing.");
    }
    if (!text(value("Copy of Invoice"))) {
      add("blocked", "Copy of Invoice", "Existing initial invoice is missing.");
    }

    const existing = residentsByQuickBooks.get(identity(quickbooksId));
    const emailOwner = residentsByEmail.get(identity(email));
    if (emailOwner && emailOwner.id !== existing?.id) {
      add("blocked", "Email", `Already belongs to ${emailOwner.fullName || "another resident"}.`);
    }

    const unit = system.units.find(
      (candidate) =>
        identity(candidate.residenceName) === identity(residence) &&
        identity(normUnit(candidate.unitNo)) === identity(normUnit(unitNo)),
    );
    const matchedRoom = unit?.rooms.find(
      (candidate) => roomIdentity(candidate.letter) === roomIdentity(room),
    );
    // "Single" in a room Website sells as twin is that room let whole (room-offer.ts)
    const placed = matchedRoom && bedLabel ? bedForPlacement(matchedRoom, bedLabel) : undefined;
    const matchedBed = placed?.bed;
    bedId = matchedBed?.id ?? "";
    wholeRoom = !!placed?.whole;
    if (!residence || !unitNo || !room || !bedLabel) {
      add("blocked", "Bed", "Residence, unit, room and bed are all required.");
    } else if (!unit) {
      add("blocked", "Unit no.", `${residence} / ${unitNo} is not set up in Homes.`);
    } else if (!matchedRoom) {
      add("blocked", "Room", `${unitNo} / Room ${room} is not set up in Homes.`);
    } else if (!matchedBed) {
      add("blocked", "Bed", `${unitNo} / Room ${room} / ${bedLabel} is not set up in Homes.`);
    } else {
      const occupant = matchedBed.residentId ? residentsById.get(matchedBed.residentId) : undefined;
      const isSameResident =
        occupant?.id === existing?.id ||
        identity(occupant?.quickbooksId ?? "") === identity(quickbooksId);
      if (
        matchedBed.residentId &&
        !isSameResident &&
        overlaps(start, end, matchedBed.tenancyStart ?? "", matchedBed.tenancyEnd ?? "")
      ) {
        add(
          "blocked",
          "Bed",
          `Occupied by ${occupant?.fullName || matchedBed.residentName || "another resident"} for overlapping dates.`,
        );
      }
      // let whole: nobody else may be in the room's other beds for these dates
      if (placed?.whole) {
        for (const other of matchedRoom!.beds) {
          if (other.id === matchedBed.id) continue;
          if (other.residentId && overlaps(start, end, other.tenancyStart ?? "", other.tenancyEnd ?? "")) {
            add("blocked", "Bed", `Room ${room} is let as a single, but ${other.residentName || "someone"} is in ${other.label}.`);
          }
        }
      }
      for (const upcoming of matchedBed.upcoming ?? []) {
        const same = upcoming.residentId === existing?.id;
        if (!same && overlaps(start, end, upcoming.start ?? "", upcoming.end ?? "")) {
          add(
            "blocked",
            "Bed",
            `Reserved for ${upcoming.name || "another resident"} for overlapping dates.`,
          );
          break;
        }
      }
    }

    const next =
      start && end && schedule && rent && rent > 0
        ? nextRentAfter({
            tenancyStart: start,
            tenancyEnd: end,
            frequency: schedule,
            monthlyRent: rent,
            // both lines are rent the initial payment already covered
            advance: safeCharges.proratedRent + safeCharges.advanceRent,
            // they live here already: paid up to the current period (Dani, 12 Oct 2026)
            today: system.today ?? new Date().toISOString().slice(0, 10),
          })
        : null;
    // no next period with good dates and rent: the current one was the last
    const paidToEnd = !next && !!start && !!end && !!rent && rent > 0;
    if (schedule && schedule !== "full" && !next && !paidToEnd) {
      add("blocked", "Next billing period", "The next rental period cannot be calculated.");
    }

    const record: MigrationRecord = {
      gender: text(value("Gender")),
      dial,
      mobile,
      nationality: text(value("Nationality")).toUpperCase(),
      nric: text(value("NRIC number")),
      passport: text(value("Passport number")),
      university: text(value("University")),
      residentType: text(value("Resident Type")).toLowerCase() || "student",
      paidBy: text(value("Paid by")) || "Self",
      payorName: text(value("Payor name")),
      schedule,
      monthlyRent: rent ?? 0,
      starterPack: money(value("Add on: Starter pack")) ?? 0,
      totalPaid: money(value("Total Initial Payment")) ?? 0,
      taUrl: text(value("Copy of Tenancy Agreement")),
      invoiceUrl: text(value("Copy of Invoice")),
      invoiceNo: text(value("Invoice No.")),
      bedId,
      unitNo,
      room,
      unitType: text(value("Unit Type")),
      occupancy: text(value("Occupancy")),
    };

    return {
      record,
      sourceRow,
      quickbooksId,
      residentName,
      email,
      place,
      wholeRoom,
      tenancyStart: start,
      tenancyEnd: end,
      action: existing ? "Update resident" : "Create resident",
      status: issues.some((issue) => issue.level === "blocked")
        ? "blocked"
        : issues.length
          ? "warning"
          : "ready",
      stayDuration: duration,
      term,
      nextBillingPeriod: next
        ? `${fmtDate(next.start)} – ${fmtDate(next.end)}`
        : schedule === "full"
          ? "Fully paid"
          : paidToEnd
            ? "Paid to the end of the tenancy"
            : "",
      nextPaymentDue: next?.due ?? "",
      nextPaymentAmount: next?.amount ?? null,
      charges: safeCharges,
      issues,
    };
  });

  const byQuickBooks = new Map<string, MigrationPreviewRow[]>();
  const byEmail = new Map<string, MigrationPreviewRow[]>();
  const byBed = new Map<string, MigrationPreviewRow[]>();
  for (const row of rows) {
    if (row.quickbooksId) {
      const key = identity(row.quickbooksId);
      byQuickBooks.set(key, [...(byQuickBooks.get(key) ?? []), row]);
    }
    if (row.email) {
      const key = identity(row.email);
      byEmail.set(key, [...(byEmail.get(key) ?? []), row]);
    }
    if (row.place) {
      const key = identity(row.place);
      byBed.set(key, [...(byBed.get(key) ?? []), row]);
    }
  }
  const flagGroup = (
    groups: Map<string, MigrationPreviewRow[]>,
    field: string,
    message: string,
    level: MigrationIssueLevel,
  ) => {
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const rowsText = group.map((row) => row.sourceRow).join(", ");
      for (const row of group)
        row.issues.push({ level, field, message: `${message} Rows: ${rowsText}.` });
    }
  };
  flagGroup(byQuickBooks, "QuickBooks ID", "Duplicate QuickBooks ID in this file.", "blocked");
  flagGroup(byEmail, "Email", "Duplicate email in this file.", "blocked");
  // a room let whole as a single takes the whole room: nobody else in it then
  const roomOf = (row: MigrationPreviewRow) => identity(row.place).split(" · ").slice(0, 3).join(" · ");
  for (const row of rows.filter((r) => r.wholeRoom)) {
    for (const other of rows) {
      if (other === row || roomOf(other) !== roomOf(row)) continue;
      if (!overlaps(row.tenancyStart, row.tenancyEnd, other.tenancyStart, other.tenancyEnd)) continue;
      row.issues.push({ level: "blocked", field: "Bed", message: `Room let as a single, but row ${other.sourceRow} is in the same room for overlapping dates.` });
    }
  }
  for (const group of byBed.values()) {
    for (let index = 0; index < group.length; index += 1) {
      const row = group[index]!;
      for (const other of group.slice(index + 1)) {
        if (!overlaps(row.tenancyStart, row.tenancyEnd, other.tenancyStart, other.tenancyEnd))
          continue;
        row.issues.push({
          level: "blocked",
          field: "Bed",
          message: `Same bed and overlapping dates as row ${other.sourceRow}.`,
        });
        other.issues.push({
          level: "blocked",
          field: "Bed",
          message: `Same bed and overlapping dates as row ${row.sourceRow}.`,
        });
      }
    }
  }

  for (const row of rows) {
    row.status = row.issues.some((issue) => issue.level === "blocked")
      ? "blocked"
      : row.issues.length
        ? "warning"
        : "ready";
  }
  const totals = {
    residents: rows.length,
    ready: rows.filter((row) => row.status === "ready").length,
    warning: rows.filter((row) => row.status === "warning").length,
    blocked: rows.filter((row) => row.status === "blocked").length,
  };
  return { rows, missingHeaders: [...missingHeaders], totals };
}
