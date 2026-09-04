/**
 * Front-end only store for the Homes / Residents / Tasks modules.
 * No backend yet: state lives in memory and is mirrored to localStorage so a
 * session survives page reloads while the flow is being designed.
 * Starts completely empty — no seed rows.
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

export type UnitRoom = {
  id: string;
  letter: string; // A / B / C / D
  roomTypeCode: string; // matches a room type from the Website module
  occupancy: "single" | "twin";
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
  // personal
  fullName: string;
  email: string;
  mobile: string;
  dob: string;
  nationality: string;
  idNumber: string;
  gender: string;
  maritalStatus: string;
  race: string;
  religion: string;
  // academic
  university: string;
  levelOfStudy: string;
  course: string;
  studentId: string;
  graduationYear: string;
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
  // misc
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
    if (raw) state = { ...EMPTY, ...(JSON.parse(raw) as OpsState) };
  } catch {
    /* ignore */
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
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
  d ? new Date(d).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/* ---------------- Unit helpers ---------------- */

export function bedsFor(occupancy: "single" | "twin"): Bed[] {
  const labels = occupancy === "twin" ? ["Twin 1", "Twin 2"] : ["Single"];
  return labels.map((label) => ({ id: uid(), label, status: "vacant" as BedStatus }));
}

export function blankRoom(letter: string): UnitRoom {
  return {
    id: uid(),
    letter,
    roomTypeCode: "",
    occupancy: "single",
    rent: 0,
    beds: bedsFor("single"),
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

export function saveUnit(unit: Unit) {
  setState((s) => ({
    ...s,
    units: s.units.some((u) => u.id === unit.id)
      ? s.units.map((u) => (u.id === unit.id ? unit : u))
      : [...s.units, unit],
  }));
}

export function deleteUnit(id: string) {
  setState((s) => ({ ...s, units: s.units.filter((u) => u.id !== id) }));
}

export type BedPatch = { [K in keyof Bed]?: Bed[K] | undefined };

export function updateBed(bedId: string, patch: BedPatch) {
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

export type BedRow = {
  unit: Unit;
  room: UnitRoom;
  bed: Bed;
};

export function allBeds(units: Unit[]): BedRow[] {
  const out: BedRow[] = [];
  for (const unit of units) for (const room of unit.rooms) for (const bed of room.beds) out.push({ unit, room, bed });
  return out;
}

export function findBed(units: Unit[], bedId?: string): BedRow | undefined {
  if (!bedId) return undefined;
  return allBeds(units).find((r) => r.bed.id === bedId);
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
    fullName: "",
    email: "",
    mobile: "",
    dob: "",
    nationality: "",
    idNumber: "",
    gender: "",
    maritalStatus: "",
    race: "",
    religion: "",
    university: "",
    levelOfStudy: "",
    course: "",
    studentId: "",
    graduationYear: "",
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
  const pct = Math.round(((REQUIRED_RESIDENT_FIELDS.length - missing.length) / REQUIRED_RESIDENT_FIELDS.length) * 100);
  return { pct, missing };
}

export function saveResidentRecord(resident: Resident) {
  setState((s) => ({
    ...s,
    residents: s.residents.some((r) => r.id === resident.id)
      ? s.residents.map((r) => (r.id === resident.id ? resident : r))
      : [...s.residents, resident],
  }));
}

export function deleteResident(id: string) {
  setState((s) => ({
    ...s,
    residents: s.residents.filter((r) => r.id !== id),
    tenancies: s.tenancies.filter((t) => t.residentId !== id),
    payments: s.payments.filter((p) => p.residentId !== id),
  }));
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
  setState((s) => ({ ...s, tenancies: s.tenancies.map((t) => (t.id === tenancy.id ? tenancy : t)) }));
}

export function addTask(task: Omit<Task, "id" | "status"> & { status?: Task["status"] }) {
  setState((s) => ({ ...s, tasks: [...s.tasks, { id: uid(), status: "open", ...task }] }));
}

export function toggleTask(id: string) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: t.status === "open" ? "done" : "open" } : t)),
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
