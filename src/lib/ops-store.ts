/**
 * Store for the Homes / Residents / Tasks modules.
 *
 * Units / rooms / beds are backed by Supabase (see src/lib/homes.functions.ts).
 * Writes update memory first so the UI stays instant, then persist in the
 * background and reconcile with whatever the server saved.
 *
 * Residents are in Supabase too (residents.functions.ts), and so is money -
 * invoices and payments are read from resident-billing.functions.ts, and
 * tenancies (tenancyDatesByResident - the browser copy was removed 13 Oct
 * 2026). Tasks are still front-end only, mirrored to localStorage.
 */
import { useSyncExternalStore } from "react";

import type { ResidentPlacement } from "@/lib/homes.functions";

/* ---------------- Types ---------------- */

export type BedStatus = "vacant" | "held" | "booked" | "active" | "notice";

export type Bed = {
  id: string;
  label: string; // "Single" | "Twin 1" | "Twin 2"
  status: BedStatus;
  residentId?: string | undefined;
  residentName?: string | undefined;
  studentId?: string | undefined;
  university?: string | undefined;
  nationality?: string | undefined;
  gender?: string | undefined;
  tenancyStart?: string | undefined;
  tenancyEnd?: string | undefined;
  rent?: number | undefined;
  holdFor?: string | undefined;
  holdUntil?: string | undefined;
  enquiryId?: string | undefined;
  /**
   * Stays to come on this bed while somebody else is its resident (9 Oct
   * 2026), earliest first: an unpaid hold (beds.enquiry_id on an occupied
   * bed) is Reserved, a paid tenancy (tenancies.bed_id) is Booked. Worked out
   * by listUnits - nothing on the bed row stores it.
   */
  upcoming?: UpcomingStay[] | undefined;
};

/** A stay still to come on a bed: its booking, and its resident once the fee is paid. */
export type UpcomingStay = {
  enquiryId?: string | undefined;
  /** a twin room let whole as one single - the placement's own record (let_whole) */
  letWhole?: boolean | undefined;
  /** the booking's reference, shown and linked to the booking */
  reference?: string | undefined;
  residentId?: string | undefined;
  name: string;
  code?: string | undefined;
  gender?: string | undefined;
  university?: string | undefined;
  start?: string | undefined;
  end?: string | undefined;
  rent?: number | undefined;
  /** Reserved: fee not paid yet. Booked: fee paid. */
  status: "reserved" | "booked";
};

/** How a room may be sold. "unit" is the whole-unit letting for the unit. */
export type Occupancy = "single" | "twin" | "unit";

export type UnitRoom = {
  id: string;
  letter: string; // A / B / C / D, or "Unit" for the whole-unit letting
  roomTypeCode: string; // matches a room type from the Website module
  /** Display default only - the bed rows below are the real sellable slots. */
  occupancy: Occupancy;
  rent: number;
  beds: Bed[];
};

export type Unit = {
  id: string;
  code: string; // U001
  residenceId: string;
  residenceName: string;
  residenceSlug: string;
  unitNo: string; // A-07-01
  block: string;
  floor: string;
  unitType: string; // 4-bedroom / 3-bedroom / studio
  gender: string; // Female / Male / Any
  wholeUnit: boolean;
  wholeUnitRent: number;
  notes: string;
  /** when it stopped being let - empty means it is live */
  deactivatedAt: string;
  /** why, in plain words: the thing somebody needs a year from now */
  deactivationReason: string;
  rooms: UnitRoom[];
};

export type ResidentDoc = {
  key: string;
  label: string;
  fileName?: string | undefined;
  uploadedAt?: string | undefined;
  /** where the file sits in the private bucket; absent when only a name was ever noted */
  path?: string | undefined;
};

export type Resident = {
  id: string;
  createdAt: string;
  enquiryId?: string | undefined;
  /** Brachtia's own resident number, e.g. "00256". Blank for in-app signups. */
  quickbooksId: string;
  /**
   * The resident ID given by the database - YYTG####, e.g. 26IF0042. Blank for
   * a resident who keeps their Brachtia ID, or until gender and nationality are known.
   */
  residentCode: string;
  // personal
  fullName: string;
  email: string;
  mobile: string;
  dob: string;
  nationality: string;
  idNumber: string;
  gender: string;
  address: string;
  postcode: string;
  state: string;
  country: string;
  maritalStatus: string;
  race: string;
  religion: string;
  referralSource: string;
  /** "student" | "employed" - decides whether academic or employment is asked */
  currentStatus: string;
  // academic
  university: string;
  levelOfStudy: string;
  course: string;
  studentId: string;
  graduationYear: string;
  sponsor: string;
  // employment - asked instead of the academic questions
  company: string;
  occupation: string;
  industry: string;
  employmentType: string;
  // housing & health
  unitId?: string | undefined;
  roomId?: string | undefined;
  bedId?: string | undefined;
  occupancy: string;
  moveIn: string;
  leaseMonths: string;
  medicalCondition: string; // "" | "yes" | "no"
  medicalDetail: string;
  // emergency contact
  ecName: string;
  ecRelationship: string;
  ecMobile: string;
  ecEmail: string;
  ecAddress: string;
  ecPostcode: string;
  ecState: string;
  ecCountry: string;
  // payment
  payMethod: string;
  paySchedule: string;
  payerName: string;
  payerRelationship: string;
  payerMobile: string;
  payerEmail: string;
  payerAddress: string;
  payerPostcode: string;
  payerState: string;
  payerCountry: string;
  // misc
  status: string;
  portalInvited: boolean;
  docs: ResidentDoc[];
};

export type Task = {
  id: string;
  type: "agreement" | "checkin" | "stamping" | "payment" | "hold";
  title: string;
  refLabel: string;
  refId?: string | undefined;
  dueDate: string;
  status: "open" | "done";
  link?: string | undefined;
};

export type OpsState = {
  units: Unit[];
  /** where each resident is - SQL resident_placements, the one answer (14 Oct 2026); undefined until loaded */
  placements?: Record<string, ResidentPlacement> | undefined;
  residents: Resident[];
  tasks: Task[];
  taTemplate?: { fileName: string; uploadedAt: string } | undefined;
};

const EMPTY: OpsState = {
  units: [],
  residents: [],
  tasks: [],
};

const KEY = "brachtia-ops-v1";

let state: OpsState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      // an old "tenancies" list in the saved copy is dropped - the server has them (13 Oct 2026)
      const { tenancies: _tenancies, ...saved } = JSON.parse(raw) as OpsState & { tenancies?: unknown };
      state = { ...EMPTY, ...saved, units: [], residents: [], placements: undefined };
    }
  } catch {
    /* ignore */
  }
  void refreshUnits();
  void refreshResidents();
}

/** Pull the full unit tree from Supabase and swap it into state - with where each resident is, read together. */
export async function refreshUnits() {
  try {
    const { listUnits, listResidentPlacements } = await import("@/lib/homes.functions");
    const [units, placements] = await Promise.all([listUnits(), listResidentPlacements()]);
    state = { ...state, units, placements };
    listeners.forEach((l) => l());
  } catch {
    /* offline or not signed in: keep whatever is in memory */
  }
}

/** Pull residents from Supabase and swap them into state. */
export async function refreshResidents() {
  try {
    const { listResidents } = await import("@/lib/residents.functions");
    const residents = await listResidents();
    state = { ...state, residents };
    listeners.forEach((l) => l());
  } catch {
    /* offline or not signed in: keep whatever is in memory */
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    // units live in Supabase; never let a stale local copy shadow them
    const { units: _units, residents: _residents, placements: _placements, ...rest } = state;
    window.localStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    /* ignore */
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  hydrate();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The units as they are now, outside a component - after a refresh has been awaited. */
export const getOpsUnits = () => state.units;

export function useOps(): OpsState {
  hydrate();
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
}

export function setState(next: (prev: OpsState) => OpsState) {
  hydrate();
  state = next(state);
  emit();
}

export const uid = () => Math.random().toString(36).slice(2, 10);

// always to the sen: rounding to the ringgit showed RM 2,549.67 as RM 2,550 (Dani, 12 Oct 2026)
export const money = (n: number) =>
  `RM ${Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

/**
 * The same date with the time on it, for the moments where the hour is the
 * point rather than the day.
 *
 * A signature, most of all. "Signed on 23 Sep 2026" and "signed at 14:47 on 23
 * Sep 2026" answer different questions, and only the second settles whether it
 * happened before or after the room changed, or before or after they paid.
 */
export const fmtDateTime = (d?: string) =>
  d
    ? new Date(d).toLocaleString("en-MY", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/* ---------------- Unit helpers ---------------- */

/**
 * The beds a room carries, for the way it is configured right now.
 *
 * A room holds ONE configuration at a time - single, twin, or the whole-unit
 * letting. Converting between them is a change to the room, made while it is
 * empty, not a set of competing slots.
 */
export function bedsFor(occupancy: Occupancy): Bed[] {
  const labels =
    occupancy === "unit" ? ["Unit"] : occupancy === "twin" ? ["Twin 1", "Twin 2"] : ["Single"];
  return labels.map((label) => ({ id: uid(), label, status: "vacant" as BedStatus }));
}

export function blankRoom(letter: string): UnitRoom {
  const occupancy: Occupancy = letter.toLowerCase() === "unit" ? "unit" : "single";
  return {
    id: uid(),
    letter,
    roomTypeCode: "",
    occupancy,
    rent: 0,
    beds: bedsFor(occupancy),
  };
}

export function roomCountFor(unitType: string) {
  if (unitType.startsWith("4")) return 4;
  if (unitType.startsWith("3")) return 3;
  if (unitType.startsWith("2")) return 2;
  return 1;
}

/**
 * A placeholder for the Add unit form, nothing more.
 *
 * The real code is given by the server on save, once the residence is known -
 * it counts within that residence and starts with its letter (A-001, S-001).
 * This cannot do that: the form mints a draft before anybody has chosen one.
 */
export function nextUnitCode(_units: Unit[]) {
  return "";
}

/** Put a unit into local state, replacing any row with the same id. */
function mergeUnit(unit: Unit, replaceId = unit.id) {
  setState((s) => ({
    ...s,
    units: s.units.some((u) => u.id === replaceId)
      ? s.units.map((u) => (u.id === replaceId ? unit : u))
      : [...s.units, unit],
  }));
}

/**
 * Save a unit. Local state updates immediately; the server write follows and
 * the saved row (with real database ids) replaces the optimistic one.
 */
export async function saveUnit(unit: Unit, importBatchId?: string) {
  // a unit already listed is put back as it was if the save fails - not removed
  const before = state.units.find((u) => u.id === unit.id);
  mergeUnit(unit);
  try {
    const { saveUnitRow } = await import("@/lib/homes.functions");
    const saved = await saveUnitRow({
      data: { unit, ...(importBatchId ? { importBatchId } : {}) },
    });
    mergeUnit(saved, unit.id);
    return saved;
  } catch (err) {
    // roll back so the UI never shows a unit the database does not have
    setState((s) => ({
      ...s,
      units: before
        ? s.units.map((u) => (u.id === unit.id ? before : u))
        : s.units.filter((u) => u.id !== unit.id),
    }));
    throw err;
  }
}

/**
 * Take a unit out of service, or put it back.
 *
 * The server refuses while anybody is still in it, and says who - that comes
 * back as a message rather than a throw, so the page can show it. A button that
 * quietly does nothing is worse than one that says why it will not.
 */
export async function setUnitDeactivated(id: string, deactivated: boolean, reason = "") {
  const previous = state.units;
  // a unit already out of service keeps the date it went out - editing the
  // reason must not re-stamp it as today
  const held = state.units.find((u) => u.id === id)?.deactivatedAt ?? "";
  const at = deactivated ? held || new Date().toISOString() : "";
  setState((s) => ({
    ...s,
    units: s.units.map((u) =>
      u.id === id ? { ...u, deactivatedAt: at, deactivationReason: deactivated ? reason : "" } : u,
    ),
  }));
  try {
    const { setUnitDeactivated: call } = await import("@/lib/homes.functions");
    const res = await call({ data: { id, deactivated, reason } });
    if (!res.ok) {
      setState((s) => ({ ...s, units: previous }));
      return res;
    }
    void refreshUnits();
    return res;
  } catch (err) {
    setState((s) => ({ ...s, units: previous }));
    throw err;
  }
}

export async function deleteUnit(id: string) {
  const previous = state.units;
  setState((s) => ({ ...s, units: s.units.filter((u) => u.id !== id) }));
  try {
    const { deleteUnitRow } = await import("@/lib/homes.functions");
    await deleteUnitRow({ data: { id } });
  } catch (err) {
    setState((s) => ({ ...s, units: previous }));
    throw err;
  }
}

/**
 * Why the other bed in a twin room cannot be sold: the room was let whole, to
 * one person, at the single rate.
 *
 * A student paying for a room is not paying for a bed, so the second bed has to
 * stop being sellable - otherwise someone else gets put in the room they bought.
 * It is written into the hold that already exists rather than a new column, so
 * nothing has to change in the database, and releasing the room clears it.
 */
export const SOLD_AS_SINGLE = "Sold as single";

export function isSoldAsSingle(bed: Bed) {
  return bed.holdFor === SOLD_AS_SINGLE;
}

const TAKEN: BedStatus[] = ["held", "booked", "active", "notice"];
const isTaken = (b: Bed) => TAKEN.includes(b.status);

/**
 * Why a bed cannot be sold right now, or "" when it is free.
 *
 * A room holds one configuration, so single and twin never compete. What does
 * compete is the whole-unit letting against the rooms inside it:
 *   - the unit let as a whole -> every room in it is blocked
 *   - any room let            -> the whole-unit slot is blocked
 */
/** The whole-unit letting is modelled as one more room, lettered "unit". */
export function isUnitSlot(room: { letter: string }) {
  return room.letter.toLowerCase() === "unit";
}

export function bedBlockedBy(unit: Unit, room: UnitRoom, bed: Bed): string {
  if (isTaken(bed)) return "";

  if (!isUnitSlot(room)) {
    const unitRoom = unit.rooms.find(isUnitSlot);
    return unitRoom?.beds.some(isTaken) ? "whole unit let" : "";
  }

  for (const r of unit.rooms) {
    if (isUnitSlot(r)) continue;
    const t = r.beds.find(isTaken);
    if (t) return `Room ${r.letter} ${t.label} let`;
  }
  return "";
}

export type BedRow = {
  unit: Unit;
  room: UnitRoom;
  bed: Bed;
  /** found through bed.upcoming: the resident has this bed booked, and someone else is its resident now */
  upcoming?: boolean | undefined;
};

/**
 * Every bed there is to place somebody in.
 *
 * A deactivated unit is not let any more, so its beds are not beds anybody can
 * be put in. Filtered HERE rather than in listUnits on purpose: everything that
 * offers a room - the booking room picker, findBed, the Homes inventory - comes
 * through this one function, so one filter covers them all and none can be
 * forgotten. Unit setup reads the units directly and still sees every one of
 * them, which is the whole point: the unit stays visible, with its reason.
 */
export function allBeds(units: Unit[]): BedRow[] {
  const out: BedRow[] = [];
  for (const unit of units) {
    if (unit.deactivatedAt) continue;
    for (const room of unit.rooms) for (const bed of room.beds) out.push({ unit, room, bed });
  }
  return out;
}

export function findBed(units: Unit[], bedId?: string): BedRow | undefined {
  if (!bedId) return undefined;
  return allBeds(units).find((r) => r.bed.id === bedId);
}

/** The resident a bed points at. beds.resident_id is the resident's uuid. */
export function residentForBed(residents: Resident[], bed: Bed): Resident | undefined {
  if (!bed.residentId) return undefined;
  return residents.find((r) => r.id === bed.residentId);
}

/**
 * A sponsor shortened for a narrow column, without losing which sponsor it is.
 *
 * A single initial would merge Petronas, PTPTN and Perbadanan into one "P", so
 * known sponsors get a fixed code and anything else falls back to the first
 * word. The batch is kept because it is how Brachtia groups a sponsor's intake.
 */
/** The sponsors the master list actually contains, plus the ones Brachtia is
 *  likely to meet next. Anything unknown falls back to its first five letters. */
const SPONSOR_CODES: Record<string, string> = {
  petronas: "PET",
  mara: "MARA",
  kanagawa: "KNGW",
  ydd: "YDD",
  uni: "UNI",
  hwum: "HWUM",
  jpa: "JPA",
  ptptn: "PTPTN",
  yayasan: "YYS",
};

export function sponsorLabel(raw?: string): string {
  const v = (raw ?? "").trim();
  if (!v || /^self$/i.test(v)) return "Self";

  const m = v.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const name = (m?.[1] ?? v).trim();
  const batch = m?.[2]?.trim() ?? "";

  const first = name.split(/\s+/)[0] ?? name;
  const code = SPONSOR_CODES[first.toLowerCase()] ?? first.slice(0, 5).toUpperCase();
  return batch ? `${code} (${batch})` : code;
}

/**
 * The gender a unit has taken on, decided by whoever is living in it.
 *
 * Malaysian practice is that men and women do not share a unit, but a unit is
 * not reserved for either in advance - the first person to move in settles it,
 * and it is free again once everybody has left. So this is worked out from the
 * occupants rather than stored; units.gender stays as the separate, deliberate
 * "this unit is reserved for" setting.
 */
export function unitGender(unit: Unit, residents: Resident[]): "Male" | "Female" | "Mixed" | "" {
  const seen = new Set<string>();
  for (const { bed } of allBeds([unit])) {
    // a bed held for a booking counts too - that student is coming
    if (!bed.residentId && !bed.residentName && !bed.enquiryId) continue;
    const person = residentForBed(residents, bed);
    const g = (person?.gender || bed.gender || "").trim().charAt(0).toUpperCase();
    if (g === "M" || g === "F") seen.add(g);
  }
  if (seen.size > 1) return "Mixed";
  if (seen.has("M")) return "Male";
  if (seen.has("F")) return "Female";
  return "";
}

/**
 * Whether a student may be placed in this unit.
 *
 * Men and women never share a unit. The unit's own "reserved for" setting has
 * to allow the student, and so does everyone already living in it or holding a
 * bed there - an empty unit set to Any takes either. Every place a person is put
 * in a bed asks this, so a mixed unit cannot be made from any of them. A student
 * with no gender on record is not stopped: there is nothing to check.
 */
export function unitAccepts(unit: Unit, residents: Resident[], gender: string | undefined) {
  const g = (gender ?? "").trim().charAt(0).toUpperCase();
  if (g !== "M" && g !== "F") return true;
  const reserved = (unit.gender ?? "").trim().charAt(0).toUpperCase();
  if ((reserved === "M" || reserved === "F") && reserved !== g) return false;
  const taken = unitGender(unit, residents);
  return taken === "" || (taken !== "Mixed" && taken.charAt(0) === g);
}

/**
 * Where a resident is - the one answer every screen gives (14 Oct 2026).
 *
 * It is SQL resident_placements (listResidentPlacements, loaded with the
 * units): the bed they are the resident of, else the bed their tenancy names
 * (still to come, or where they last lived), else their booking's hold. The
 * documents ask the same function on the server (placementForResident), so the
 * resident page, the list, Homes and the agreement cannot name different rooms.
 * `upcoming`: a bed they are not the resident of - somebody else's until their
 * stay starts, or one they have left.
 *
 * Until the placements have loaded, the bed rows are read the old way, so the
 * page does not flash "No room".
 */
export function findBedForResident(
  units: Unit[],
  resident: { id: string; quickbooksId?: string | undefined; bedId?: string | undefined },
  placements: Record<string, ResidentPlacement> | undefined = state.placements,
): BedRow | undefined {
  if (placements) {
    const p = placements[resident.id];
    if (!p) return undefined;
    const row = findBed(units, p.bedId);
    return row && p.via !== "seated" ? { ...row, upcoming: true } : row;
  }
  const beds = allBeds(units);
  const byLink = beds.find((r) => r.bed.residentId === resident.id);
  if (byLink) return byLink;
  // booked into a room somebody else has not left yet: theirs, from their start date
  const later = beds.find((r) => r.bed.upcoming?.some((u) => u.residentId === resident.id));
  if (later) return { ...later, upcoming: true };
  return findBed(units, resident.bedId);
}

/**
 * When a resident's stay starts and ends, from the best record there is.
 *
 * A tenancy made in this app wins. Most residents came from the master list
 * instead, whose dates sit on the bed - and a resident not yet placed still has
 * the move-in date they gave. The list and the resident page both read this, so
 * one cannot show dates the other has not got.
 */
export function stayDates(
  tenancy: { start: string; end: string } | undefined,
  placed: BedRow | undefined,
  resident: { moveIn?: string | undefined },
  /** the tenancies table's dates - the truth, ahead of the browser's own copy */
  saved?: { start: string; end: string } | undefined,
) {
  return {
    start: saved?.start || tenancy?.start || placed?.bed.tenancyStart || resident.moveIn || "",
    end: saved?.end || placed?.bed.tenancyEnd || tenancy?.end || "",
  };
}

/* ---------------- Resident helpers ---------------- */

/** The ID a resident goes by: the new resident ID, or the Brachtia ID they already had. */
export const residentIdOf = (r: Pick<Resident, "residentCode" | "quickbooksId">) =>
  r.residentCode || r.quickbooksId;

export function blankResident(partial: Partial<Resident> = {}): Resident {
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    quickbooksId: "",
    residentCode: "",
    fullName: "",
    email: "",
    mobile: "",
    dob: "",
    nationality: "",
    idNumber: "",
    gender: "",
    address: "",
    postcode: "",
    state: "",
    country: "",
    maritalStatus: "",
    race: "",
    religion: "",
    referralSource: "",
    currentStatus: "",
    university: "",
    levelOfStudy: "",
    course: "",
    studentId: "",
    graduationYear: "",
    sponsor: "",
    company: "",
    occupation: "",
    industry: "",
    employmentType: "",
    occupancy: "",
    moveIn: "",
    leaseMonths: "",
    medicalCondition: "",
    medicalDetail: "",
    ecName: "",
    ecRelationship: "",
    ecMobile: "",
    ecEmail: "",
    ecAddress: "",
    ecPostcode: "",
    ecState: "",
    ecCountry: "",
    payMethod: "",
    paySchedule: "",
    payerName: "",
    payerRelationship: "",
    payerMobile: "",
    payerEmail: "",
    payerAddress: "",
    payerPostcode: "",
    payerState: "",
    payerCountry: "",
    status: "",
    portalInvited: false,
    docs: [],
    ...partial,
  };
}

function mergeResident(resident: Resident, replaceId = resident.id) {
  setState((s) => ({
    ...s,
    residents: s.residents.some((r) => r.id === replaceId)
      ? s.residents.map((r) => (r.id === replaceId ? resident : r))
      : [...s.residents, resident],
  }));
}

/**
 * Save a resident. Local state updates immediately; the server write follows
 * and the saved row (with its real database id) replaces the optimistic one.
 */
export async function saveResidentRecord(resident: Resident, importBatchId?: string) {
  mergeResident(resident);
  try {
    const { saveResidentRow } = await import("@/lib/residents.functions");
    const saved = await saveResidentRow({
      data: { resident, ...(importBatchId ? { importBatchId } : {}) },
    });
    mergeResident(saved, resident.id);
    return saved;
  } catch (err) {
    setState((s) => ({ ...s, residents: s.residents.filter((r) => r.id !== resident.id) }));
    throw err;
  }
}

export async function deleteResident(id: string) {
  const previous = state.residents;
  setState((s) => ({
    ...s,
    residents: s.residents.filter((r) => r.id !== id),
  }));
  try {
    const { deleteResidentRow } = await import("@/lib/residents.functions");
    await deleteResidentRow({ data: { id } });
  } catch (err) {
    setState((s) => ({ ...s, residents: previous }));
    throw err;
  }
}

/* ---------------- Tenancy / task / payment helpers ---------------- */

export type ResidentPatch = { [K in keyof Resident]?: Resident[K] | undefined };

export function addTask(task: Omit<Task, "id" | "status"> & { status?: Task["status"] }) {
  setState((s) => ({ ...s, tasks: [...s.tasks, { id: uid(), status: "open", ...task }] }));
}

export function toggleTask(id: string) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) =>
      t.id === id ? { ...t, status: t.status === "open" ? "done" : "open" } : t,
    ),
  }));
}

export function deleteTask(id: string) {
  setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
}

export function setTaTemplate(fileName: string) {
  setState((s) => ({ ...s, taTemplate: { fileName, uploadedAt: new Date().toISOString() } }));
}

export { SCHEDULES } from "@/lib/reference-data";

// Cash Deposit: cash the student paid in at the bank, or admin banked for them - it has a
// bank slip, unlike cash handed over (Dani, 6 Oct 2026)
export const PAY_METHODS = ["DuitNow QR Pay", "Bank Transfer", "Cash Deposit", "Cheque", "Cash"];

export const LEVELS = [
  "Undergraduate (Degree, Diploma, Foundation)",
  "Postgraduate (Masters)",
  "Postgraduate (PhD, Doctorate)",
  "Other",
];

export const GENDERS = ["Female", "Male", "Any"];
