import type { Bed, Resident, Unit, UnitRoom } from "@/lib/ops-store";
import { residentForBed, residentIdOf, residentSponsorLabel } from "@/lib/ops-store";
import { universityAbbr } from "@/data/form-options";

export { occupancyKey, occupancyLabel, occupancyPrinted } from "@/lib/occupancy";
import { occupancyLabel } from "@/lib/occupancy";

/**
 * Who has a claim on a unit, and when (Dani, 8 Oct 2026).
 *
 * A room is free for a stay when nobody's dates overlap it - not when its bed
 * row happens to be empty. Muhammad in Room C to 30 Sep does not stop Aisha
 * booking it from 20 Oct; he only stops somebody who wants it in September.
 *
 * The browser asks this to draw the room picker. The database asks the same
 * questions again in place_stay (supabase/migrations/20261009100000_
 * dated_placement.sql) under a lock, and its answer is the one that counts:
 * the picker can be a minute out of date, the lock cannot.
 */

export const SOLD_AS_SINGLE_MARK = "Sold as single";

/**
 * How a placement was SOLD, not how the room is built (Dani, 14 Oct 2026).
 *
 * A twin room nobody was in can be let whole as one single (roomOffer
 * "whole"): the resident has Twin 1, and Twin 2 is marked Sold as single. The
 * room is still built as a twin, so every screen that read room.occupancy said
 * "Twin sharing · Twin 1" for a resident paying the single rate - the booking
 * card, the resident page, and the Occupancy in their agreement. Every place
 * that describes a placement asks here instead.
 */
type SoldRoom = {
  occupancy?: string | null | undefined;
  beds?: { holdFor?: string | null | undefined; hold_for?: string | null | undefined }[] | null | undefined;
};

/**
 * The room is let whole. `letWhole` is the placement's own record of it
 * (placement_holds / tenancies .let_whole, 20261019100000_let_whole.sql) and
 * wins whenever the caller has it; only a placement read without it (a
 * resident seated on the bed) falls back to the mark on the other bed.
 */
export const soldWhole = (room: SoldRoom | null | undefined, letWhole?: boolean | undefined) =>
  letWhole ?? !!room?.beds?.some((b) => (b.holdFor ?? b.hold_for) === SOLD_AS_SINGLE_MARK);

/** "single" for a twin room let whole; otherwise the room's own occupancy */
export const soldOccupancy = (room: SoldRoom | null | undefined, letWhole?: boolean | undefined) =>
  room?.occupancy === "twin" && soldWhole(room, letWhole) ? "single" : String(room?.occupancy ?? "");

/** "Twin Sharing" or "Single", as sold */
export const soldOccupancyLabel = (room: SoldRoom | null | undefined, letWhole?: boolean | undefined) =>
  occupancyLabel(soldOccupancy(room, letWhole)) || "Single";

/** the bed as the resident has it: "Single" for a twin room let whole, else its label ("Twin 1") */
export const soldBedLabel = (
  room: SoldRoom | null | undefined,
  bed: { label?: string | null | undefined } | null | undefined,
  letWhole?: boolean | undefined,
) => (room?.occupancy === "twin" && soldWhole(room, letWhole) ? "Single" : String(bed?.label ?? ""));

export type Claim = {
  bedId: string;
  roomId: string;
  enquiryId?: string | undefined;
  residentId?: string | undefined;
  who: string;
  gender: string;
  start?: string | undefined;
  end?: string | undefined;
  /** the person in the bed now, or the booking that has it next */
  kind: "current" | "next";
};

export type Period = { start?: string | null | undefined; end?: string | null | undefined };

const g1 = (g?: string | null) => {
  const c = String(g ?? "")
    .trim()
    .charAt(0)
    .toUpperCase();
  return c === "M" || c === "F" ? c : "";
};

/** Two stays overlap when neither ends before the other starts. No date means forever. */
export function overlaps(a: Period, b: Period) {
  const aStart = a.start || "0000-01-01";
  const aEnd = a.end || "9999-12-31";
  const bStart = b.start || "0000-01-01";
  const bEnd = b.end || "9999-12-31";
  return aStart <= bEnd && aEnd >= bStart;
}

/** Everyone with a claim on the unit's beds: the bed's own resident or hold, and the stays to come. */
export function unitClaims(unit: Unit, residents: Resident[] = []): Claim[] {
  const out: Claim[] = [];
  for (const room of unit.rooms) {
    for (const bed of room.beds) {
      if (bed.status !== "vacant" && bed.holdFor !== SOLD_AS_SINGLE_MARK) {
        const person = bed.residentId ? residents.find((r) => r.id === bed.residentId) : undefined;
        out.push({
          bedId: bed.id,
          roomId: room.id,
          // holds are in bed.upcoming (placement_holds), never on the bed row
          enquiryId: undefined,
          residentId: bed.residentId,
          who: bed.residentName || person?.fullName || bed.holdFor || "someone",
          gender: person?.gender || bed.gender || "",
          start: bed.tenancyStart,
          end: bed.tenancyEnd,
          kind: "current",
        });
      }
      for (const u of bed.upcoming ?? []) {
        out.push({
          bedId: bed.id,
          roomId: room.id,
          enquiryId: u.enquiryId,
          residentId: u.residentId,
          who: u.name || "someone",
          gender: u.gender || "",
          start: u.start,
          end: u.end,
          kind: "next",
        });
      }
    }
  }
  return out;
}

export type Asking = Period & {
  gender?: string | null | undefined;
  /** the booking being placed - its own current hold never blocks it */
  enquiryId?: string | undefined;
  residentId?: string | undefined;
  /** the whole room is taken, so the other bed in it is too */
  whole?: boolean | undefined;
};

const range = (c: Period) => `${c.start ? fmt(c.start) : "…"} – ${c.end ? fmt(c.end) : "…"}`;

function fmt(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}

/**
 * Why this bed cannot be had for these dates, or "" when it can.
 *
 * Never overridden by "Show all rooms": that relaxes what the student would
 * prefer, not what is physically or safely possible.
 *   - somebody else's dates overlap on this bed
 *   - the room is let whole (or is being taken whole) and the other bed is taken then
 *   - the whole unit is let then, or this asks for the whole unit and any room is
 *   - somebody of the other gender is in the unit then
 */
export function placementConflict(
  unit: Unit,
  room: UnitRoom,
  bed: Bed,
  asking: Asking,
  residents: Resident[] = [],
): string {
  if (unit.deactivatedAt) return "Unit out of service";
  const g = g1(asking.gender);
  const kept = g1(unit.gender);
  if (g && kept && kept !== g) return `Kept for ${unit.gender} residents`;

  const soldWhole = room.beds.some((b) => b.holdFor === SOLD_AS_SINGLE_MARK);
  const isUnit = (letter: string) => letter.toLowerCase() === "unit";
  const letterOf = new Map(unit.rooms.map((r) => [r.id, r.letter]));

  for (const c of unitClaims(unit, residents)) {
    if (asking.enquiryId && c.enquiryId === asking.enquiryId) continue;
    if (asking.residentId && c.residentId === asking.residentId) continue;
    if (!overlaps(c, asking)) continue;
    const cg = g1(c.gender);
    if (g && cg && cg !== g)
      return `${c.who} (${cg === "M" ? "male" : "female"}) in this unit ${range(c)}`;
    if (
      c.bedId === bed.id ||
      isUnit(room.letter) ||
      isUnit(letterOf.get(c.roomId) ?? "") ||
      (c.roomId === room.id && (asking.whole || soldWhole))
    ) {
      return `${c.kind === "next" ? "Reserved for" : "Taken by"} ${c.who} ${range(c)}`;
    }
  }
  return "";
}

/**
 * What the picker says about a bed that is free for the dates asked but has
 * somebody in it now: "Currently occupied by Muhammad until 30 Sep 2026 ·
 * Checkout pending". Empty when nobody is in it.
 */
export function occupiedNote(bed: Bed, today: string, short = false) {
  if (bed.status === "vacant" || !bed.residentId || bed.holdFor === SOLD_AS_SINGLE_MARK) return "";
  const until = bed.tenancyEnd ? ` until ${fmt(bed.tenancyEnd)}` : "";
  // the room picker's list: who it is is one click away, in the unit's details
  if (short) return `Currently occupied${until}`;
  const who = bed.residentName || "a resident";
  const pending =
    bed.tenancyEnd && bed.tenancyEnd < today && bed.status !== "booked"
      ? " · Checkout pending"
      : "";
  return `Currently occupied by ${who}${until}${pending}`;
}

/** The day before an ISO date - "Vacant until 19 Oct" for a stay starting 20 Oct. */
export function dayBefore(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* ---------------- what a person is, and when ---------------- */

/**
 * A person's status and their timing are two different answers (Dani, 9 Oct
 * 2026), and neither is stored - both follow from payment, check-in, checkout
 * and dates:
 *   status   No room · Reserved (fee unpaid) · Booked (fee paid, not in) ·
 *            Occupied (checked in) · Moved out (left, checkout not settled)
 *            · Inactive (checked out and settled)
 *   timing   Upcoming (Reserved/Booked) · Current (Occupied) · Settlement open
 *            (Moved out) · Former (Inactive)
 *
 * The status is the pill. The timing is quiet text under the dates, where
 * "when" is already being read - never beside the place.
 */
export type PersonStatus = "none" | "held" | "booked" | "active" | "moved_out" | "inactive";

export function personStatus(p: {
  inactive?: boolean | undefined;
  /** the day they handed the room back (their tenancy's moved_out_on) - the room is no longer theirs */
  movedOut?: string | undefined;
  bedStatus?: string | undefined;
  /** placed through a stay to come, on a bed somebody else is the resident of */
  upcomingAs?: "reserved" | "booked" | undefined;
}): PersonStatus {
  if (p.inactive) return "inactive";
  // before any bed is read: a room they left is the next person's (22 Oct 2026)
  if (p.movedOut) return "moved_out";
  if (p.upcomingAs) return p.upcomingAs === "reserved" ? "held" : "booked";
  if (p.bedStatus === "active" || p.bedStatus === "notice") return "active";
  if (p.bedStatus === "booked") return "booked";
  if (p.bedStatus === "held") return "held";
  return "none";
}

export const PERSON_LABEL: Record<PersonStatus, string> = {
  none: "No room",
  held: "Reserved",
  booked: "Booked",
  active: "Occupied",
  moved_out: "Moved out",
  inactive: "Inactive",
};

const days = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) /
      86400000,
  );

/**
 * Coming Due: the tenancy ends within this many days (Dani, 13 Oct 2026). One
 * number for the resident's timing line and Schedule C's status - they were
 * 30 and 60, so a resident could read "Current" while their Schedule C said
 * "Coming Due".
 */
export const COMING_DUE_DAYS_BEFORE_END = 60;

/**
 * The line under the dates: "Upcoming · in 11 days", "Coming due · ends in 3 days",
 * "Checkout overdue", "Former". Empty for somebody with no room.
 */
export function timingLine(
  status: PersonStatus,
  start: string | undefined,
  end: string | undefined,
  today: string,
  /** the day their check-in appointment is booked for - arriving then is not overdue */
  checkInOn?: string | undefined,
) {
  if (status === "inactive") return "Former";
  if (status === "moved_out") return "Settlement open";
  if (status === "held" || status === "booked") {
    if (!start) return "Upcoming";
    // a check-in booked for after the start date: they are expected that day (10 Oct 2026)
    const day = checkInOn && checkInOn > start ? checkInOn.slice(0, 10) : start;
    const n = days(today, day);
    if (n < 0) return "Check-in overdue";
    const when = n > 1 ? `in ${n} days` : n === 1 ? "tomorrow" : "today";
    return day === start ? `Upcoming · ${when}` : `Upcoming · check-in ${when}`;
  }
  if (status === "active") {
    if (end && end < today) return "Checkout overdue";
    if (end) {
      const n = days(today, end);
      if (n <= COMING_DUE_DAYS_BEFORE_END)
        return n === 0 ? "Coming due · ends today" : `Coming due · ends in ${n} day${n === 1 ? "" : "s"}`;
    }
    return "Current";
  }
  return "";
}

/** The timing line's colour, the same on every list: red when late, orange when coming due. */
export function timingTone(line: string) {
  if (line.endsWith("overdue")) return "font-medium text-rose-700";
  if (line.startsWith("Coming due") || line === "Settlement open") return "font-medium text-orange-700";
  return "";
}

/**
 * The room status a bed shows (10 Oct 2026): whoever is physically in it
 * decides; an empty bed shows its first stay to come - Reserved for an unpaid
 * hold, Booked for a paid one - and Vacant only when nobody is coming.
 */
export function roomStatusOf(bed: Bed): "vacant" | "held" | "booked" | "active" {
  if (bed.status === "notice" || bed.status === "active") return "active";
  if (bed.status !== "vacant") return bed.status;
  const first = bed.upcoming?.[0];
  return first ? (first.status === "reserved" ? "held" : "booked") : "vacant";
}

/** What the Room assignment card offers, by where the booking stands (10 Oct 2026). */
export function roomActions(p: {
  closed: boolean;
  hasRoom: boolean;
  paid: boolean;
  started: boolean;
}) {
  if (p.closed || !p.hasRoom) return [] as ("choose" | "release" | "change" | "update_tenancy")[];
  if (p.started) return ["update_tenancy"] as const;
  return p.paid ? (["change"] as const) : (["choose", "release"] as const);
}

/** One person on a bed: whoever lives there now, then each stay to come. */
export type BedStay = {
  key: string;
  name: string;
  residentId?: string | undefined;
  enquiryId?: string | undefined;
  reference?: string | undefined;
  code?: string | undefined;
  university?: string | undefined;
  nationality?: string | undefined;
  sponsor?: string | undefined;
  start?: string | undefined;
  end?: string | undefined;
  /** their rent, when known - Homes falls back to the room's */
  rent?: number | undefined;
  status: PersonStatus;
  /** "Next ·" - after somebody else on the same bed */
  later: boolean;
};

/**
 * Who is on a bed, and when (Dani, 14 Oct 2026) - the person living there,
 * then every Reserved and Booked stay to come (bed.upcoming: holds and paid
 * tenancies). Homes worked this out on its own screen while the booking's room
 * picker and Update Tenancy's each read only the bed row, and called a bed
 * Vacant that a booking held. Every screen that shows who is in a unit reads
 * this; tests/one-rule.test.ts fails if one goes back to the bed row.
 */
export function bedStays(bed: Bed, residents: Resident[]): BedStay[] {
  const stays: BedStay[] = [];
  const person = residentForBed(residents, bed);
  if (bed.status !== "vacant" && (bed.residentId || bed.residentName || bed.holdFor)) {
    stays.push({
      key: "now",
      name: person?.fullName || bed.residentName || bed.holdFor || "—",
      residentId: person?.id,
      // the bed's own resident's booking - where their room is changed
      enquiryId: person?.enquiryId,
      code: person ? residentIdOf(person) : undefined,
      university: person?.university || bed.university,
      nationality: person?.nationality || bed.nationality,
      sponsor: person ? residentSponsorLabel(person) : undefined,
      // an older hold kept only the move-in date, in hold_until
      start: bed.tenancyStart || (bed.status === "held" ? bed.holdUntil?.slice(0, 10) : undefined),
      end: bed.tenancyEnd,
      rent: bed.rent,
      status: personStatus({ bedStatus: bed.status }),
      later: false,
    });
  }
  for (const [i, u] of (bed.upcoming ?? []).entries()) {
    const who = u.residentId ? residents.find((r) => r.id === u.residentId) : undefined;
    stays.push({
      key: `later-${i}`,
      name: u.name,
      residentId: u.residentId,
      enquiryId: u.enquiryId,
      reference: u.reference,
      code: u.code,
      university: who?.university || universityAbbr(u.university) || undefined,
      nationality: who?.nationality,
      sponsor: who ? residentSponsorLabel(who) : undefined,
      start: u.start,
      end: u.end,
      rent: u.rent,
      status: personStatus({ upcomingAs: u.status }),
      // "Next ·" only after somebody - the first stay on an empty bed is just theirs
      later: stays.length > 0,
    });
  }
  return stays;
}

/** A room as sold, for a list of who is in it: "Single (whole room)", "Twin" or "Single". */
export const roomShapeLabel = (room: { occupancy?: string | null | undefined; beds?: { holdFor?: string | null | undefined }[] | null | undefined }) =>
  room.occupancy === "twin" && soldWhole(room) ? "Single (whole room)" : room.occupancy === "twin" ? "Twin" : "Single";

/** The beds people can be in - a room let whole's other bed only carries the Sold-as-single mark. */
export const bedsForPeople = <B extends { holdFor?: string | null | undefined }>(room: { beds: B[] }) =>
  room.beds.filter((b) => b.holdFor !== SOLD_AS_SINGLE_MARK);
