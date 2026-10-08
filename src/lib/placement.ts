import type { Bed, Resident, Unit, UnitRoom } from "@/lib/ops-store";

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
          // a hold on somebody else's bed is in bed.upcoming, not here
          enquiryId: bed.residentId ? undefined : bed.enquiryId,
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
 *            Occupied (checked in) · Inactive (checked out)
 *   timing   Upcoming (Reserved/Booked) · Current (Occupied) · Former (Inactive)
 *
 * The status is the pill. The timing is quiet text under the dates, where
 * "when" is already being read - never beside the place.
 */
export type PersonStatus = "none" | "held" | "booked" | "active" | "inactive";

export function personStatus(p: {
  inactive?: boolean | undefined;
  bedStatus?: string | undefined;
  /** placed through a stay to come, on a bed somebody else is the resident of */
  upcomingAs?: "reserved" | "booked" | undefined;
}): PersonStatus {
  if (p.inactive) return "inactive";
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
  inactive: "Inactive",
};

const days = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) /
      86400000,
  );

/**
 * The line under the dates: "Upcoming · in 11 days", "Current · ends in 3 days",
 * "Checkout overdue", "Former". Empty for somebody with no room.
 */
export function timingLine(
  status: PersonStatus,
  start: string | undefined,
  end: string | undefined,
  today: string,
) {
  if (status === "inactive") return "Former";
  if (status === "held" || status === "booked") {
    if (!start) return "Upcoming";
    const n = days(today, start);
    return n > 1
      ? `Upcoming · in ${n} days`
      : n === 1
        ? "Upcoming · tomorrow"
        : n === 0
          ? "Upcoming · today"
          : "Upcoming · not checked in";
  }
  if (status === "active") {
    if (end && end < today) return "Checkout overdue";
    if (end) {
      const n = days(today, end);
      if (n <= 30)
        return n === 0 ? "Current · ends today" : `Current · ends in ${n} day${n === 1 ? "" : "s"}`;
    }
    return "Current";
  }
  return "";
}
