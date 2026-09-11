/**
 * Store for the Homes / Residents / Tasks modules.
 *
 * Units / rooms / beds are backed by Supabase (see src/lib/homes.functions.ts).
 * Writes update memory first so the UI stays instant, then persist in the
 * background and reconcile with whatever the server saved.
 *
 * Residents / tenancies / payments / tasks are still front-end only and are
 * mirrored to localStorage until their tables exist.
 */
import { useSyncExternalStore } from "react";

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
  rooms: UnitRoom[];
};

export type ResidentDoc = {
  key: string;
  label: string;
  fileName?: string | undefined;
  uploadedAt?: string | undefined;
};

export type Resident = {
  id: string;
  createdAt: string;
  enquiryId?: string | undefined;
  /** Brachtia's own resident number, e.g. "00256". Blank for in-app signups. */
  legacyId: string;
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
  // academic
  university: string;
  levelOfStudy: string;
  course: string;
  studentId: string;
  graduationYear: string;
  sponsor: string;
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

export type TenancyStage =
  | "draft"
  | "admin_signed"
  | "sent"
  | "student_signed"
  | "checkin_scheduled"
  | "checked_in"
  | "stamped";

export type Tenancy = {
  id: string;
  residentId: string;
  unitId?: string | undefined;
  roomId?: string | undefined;
  bedId?: string | undefined;
  start: string;
  end: string;
  rent: number;
  schedule: string;
  stage: TenancyStage;
  checkinDate: string;
  checklist: { key: string; label: string; done: boolean; date?: string | undefined }[];
  agreementFile?: string | undefined;
  stampedFile?: string | undefined;
};

export type Payment = {
  id: string;
  residentId: string;
  tenancyId?: string | undefined;
  kind: "booking_fee" | "deposit" | "rent" | "other";
  label: string;
  periodFrom: string;
  periodTo: string;
  amount: number;
  dueDate: string;
  paidDate?: string | undefined;
  method?: string | undefined;
  reference?: string | undefined;
  proofFile?: string | undefined;
  status: "due" | "paid" | "partial" | "overdue";
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
  residents: Resident[];
  tenancies: Tenancy[];
  payments: Payment[];
  tasks: Task[];
  taTemplate?: { fileName: string; uploadedAt: string } | undefined;
};

const EMPTY: OpsState = {
  units: [],
  residents: [],
  tenancies: [],
  payments: [],
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
    if (raw) state = { ...EMPTY, ...(JSON.parse(raw) as OpsState), units: [], residents: [] };
  } catch {
    /* ignore */
  }
  void refreshUnits();
  void refreshResidents();
}

/** Pull the full unit tree from Supabase and swap it into state. */
export async function refreshUnits() {
  try {
    const { listUnits } = await import("@/lib/homes.functions");
    const units = await listUnits();
    state = { ...state, units };
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
    const { units: _units, residents: _residents, ...rest } = state;
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

export const money = (n: number) =>
  `RM ${Number(n || 0).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;

export const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })
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

export function nextUnitCode(units: Unit[]) {
  return `U${String(units.length + 1).padStart(3, "0")}`;
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
    setState((s) => ({ ...s, units: s.units.filter((u) => u.id !== unit.id) }));
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

export type BedPatch = { [K in keyof Bed]?: Bed[K] | undefined };

export function updateBed(bedId: string, patch: BedPatch) {
  void (async () => {
    try {
      const { updateBedRow } = await import("@/lib/homes.functions");
      await updateBedRow({ data: { bedId, patch } });
    } catch {
      void refreshUnits();
    }
  })();
  setState((s) => ({
    ...s,
    units: s.units.map((u) => ({
      ...u,
      rooms: u.rooms.map((r) => ({
        ...r,
        beds: r.beds.map((b) => (b.id === bedId ? ({ ...b, ...patch } as Bed) : b)),
      })),
    })),
  }));
}

/**
 * Re-configure a room: single <-> twin <-> whole unit. The beds are rebuilt to
 * match. An occupied bed is carried over into the first slot so a conversion
 * never loses a resident.
 */
export function convertRoomOccupancy(roomId: string, occupancy: Occupancy) {
  setState((s) => ({
    ...s,
    units: s.units.map((u) => ({
      ...u,
      rooms: u.rooms.map((r) => {
        if (r.id !== roomId || r.occupancy === occupancy) return r;
        const fresh = bedsFor(occupancy);
        const keep = r.beds.find((b) => b.status !== "vacant");
        const beds = keep ? [{ ...keep, label: fresh[0]!.label }, ...fresh.slice(1)] : fresh;
        return { ...r, occupancy, beds };
      }),
    })),
  }));

  const owner = state.units.find((u) => u.rooms.some((r) => r.id === roomId));
  if (owner) {
    void (async () => {
      try {
        const { saveUnitRow } = await import("@/lib/homes.functions");
        const saved = await saveUnitRow({ data: { unit: owner } });
        mergeUnit(saved, owner.id);
      } catch {
        void refreshUnits();
      }
    })();
  }
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
export function bedBlockedBy(unit: Unit, room: UnitRoom, bed: Bed): string {
  if (isTaken(bed)) return "";
  const isUnitSlot = room.letter.toLowerCase() === "unit";

  if (!isUnitSlot) {
    const unitRoom = unit.rooms.find((r) => r.letter.toLowerCase() === "unit");
    return unitRoom?.beds.some(isTaken) ? "whole unit let" : "";
  }

  for (const r of unit.rooms) {
    if (r.letter.toLowerCase() === "unit") continue;
    const t = r.beds.find(isTaken);
    if (t) return `Room ${r.letter} ${t.label} let`;
  }
  return "";
}

/** A bed is usable for a stay when it is free, or its tenancy does not overlap. */
export function bedFreeForPeriod(bed: Bed, from?: string | null, to?: string | null) {
  if (bed.enquiryId) return false;
  if (bed.status === "vacant") return true;
  if (!bed.tenancyEnd && !bed.tenancyStart) return false;
  if (!from) return false;
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : start;
  const bStart = bed.tenancyStart ? new Date(bed.tenancyStart).getTime() : -Infinity;
  const bEnd = bed.tenancyEnd ? new Date(bed.tenancyEnd).getTime() : Infinity;
  return end < bStart || start > bEnd;
}

export type BedRow = {
  unit: Unit;
  room: UnitRoom;
  bed: Bed;
};

export function allBeds(units: Unit[]): BedRow[] {
  const out: BedRow[] = [];
  for (const unit of units)
    for (const room of unit.rooms) for (const bed of room.beds) out.push({ unit, room, bed });
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
 * Where a resident actually sleeps.
 *
 * beds.resident_id is the single record of a placement, so the lookup runs from
 * the bed side. A resident row carries no copy of it - two copies would drift.
 * bedId is still honoured for a placement made by hand before it is saved.
 */
export function findBedForResident(
  units: Unit[],
  resident: { id: string; legacyId?: string | undefined; bedId?: string | undefined },
): BedRow | undefined {
  const byLink = allBeds(units).find((r) => r.bed.residentId === resident.id);
  return byLink ?? findBed(units, resident.bedId);
}

/* ---------------- Resident helpers ---------------- */

export const DOC_TYPES: { key: string; label: string }[] = [
  { key: "photo", label: "Passport size photo" },
  { key: "offer", label: "University offer letter" },
  { key: "id", label: "Passport / NRIC" },
  { key: "declaration", label: "Signed declaration form" },
  { key: "agreement", label: "Tenancy agreement" },
  { key: "stamped", label: "Stamped tenancy agreement" },
  { key: "booking_proof", label: "Booking fee payment proof" },
  { key: "balance_proof", label: "Balance payment proof" },
];

export function blankResident(partial: Partial<Resident> = {}): Resident {
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    legacyId: "",
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
    university: "",
    levelOfStudy: "",
    course: "",
    studentId: "",
    graduationYear: "",
    sponsor: "",
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

export const REQUIRED_RESIDENT_FIELDS: (keyof Resident)[] = [
  "fullName",
  "email",
  "mobile",
  "dob",
  "nationality",
  "idNumber",
  "gender",
  "university",
  "course",
  "studentId",
  "moveIn",
  "leaseMonths",
  "ecName",
  "ecMobile",
  "ecEmail",
  "paySchedule",
  "payerName",
];

export function completeness(r: Resident) {
  const missing = REQUIRED_RESIDENT_FIELDS.filter((k) => !String(r[k] ?? "").trim());
  const pct = Math.round(
    ((REQUIRED_RESIDENT_FIELDS.length - missing.length) / REQUIRED_RESIDENT_FIELDS.length) * 100,
  );
  return { pct, missing };
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
    tenancies: s.tenancies.filter((t) => t.residentId !== id),
    payments: s.payments.filter((p) => p.residentId !== id),
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

export const CHECKIN_CHECKLIST = [
  { key: "keycard", label: "Prepare key card" },
  { key: "clean", label: "Clean & set up room" },
  { key: "residentcard", label: "Resident card application" },
];

export type TenancyPatch = { [K in keyof Tenancy]?: Tenancy[K] | undefined };
export type ResidentPatch = { [K in keyof Resident]?: Resident[K] | undefined };

export function createTenancy(input: TenancyPatch & { residentId: string }): Tenancy {
  const tenancy: Tenancy = {
    id: uid(),
    start: "",
    end: "",
    rent: 0,
    schedule: "",
    stage: "draft",
    checkinDate: "",
    checklist: CHECKIN_CHECKLIST.map((c) => ({ ...c, done: false })),
    ...input,
  } as Tenancy;
  setState((s) => ({ ...s, tenancies: [...s.tenancies, tenancy] }));
  return tenancy;
}

export function saveTenancy(tenancy: Tenancy) {
  setState((s) => ({
    ...s,
    tenancies: s.tenancies.map((t) => (t.id === tenancy.id ? tenancy : t)),
  }));
}

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

export function addPayment(payment: Omit<Payment, "id">) {
  setState((s) => ({ ...s, payments: [...s.payments, { id: uid(), ...payment }] }));
}

export function savePayment(payment: Payment) {
  setState((s) => ({ ...s, payments: s.payments.map((p) => (p.id === payment.id ? payment : p)) }));
}

export function setTaTemplate(fileName: string) {
  setState((s) => ({ ...s, taTemplate: { fileName, uploadedAt: new Date().toISOString() } }));
}

export const SCHEDULES = [
  { value: "bimonthly", label: "Bi-monthly (every 2 months)", months: 2 },
  { value: "quarterly", label: "Quarterly (every 3 months)", months: 3 },
  { value: "semiannual", label: "Semi-annually (every 6 months)", months: 6 },
  { value: "full", label: "Full term", months: 0 },
];

export const PAY_METHODS = ["DuitNow QR Pay", "Bank Transfer", "Cheque", "Cash"];

export const LEVELS = [
  "Undergraduate (Degree, Diploma, Foundation)",
  "Postgraduate (Masters)",
  "Postgraduate (PhD, Doctorate)",
  "Other",
];

export const UNIT_TYPES = ["4-bedroom", "3-bedroom", "2-bedroom", "Studio"];
export const GENDERS = ["Female", "Male", "Any"];
