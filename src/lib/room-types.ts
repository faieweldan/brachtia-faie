import { isSoldAsSingle, isUnitSlot, type BedRow, type Unit, type UnitRoom } from "@/lib/ops-store";

/**
 * Room types as Website configures them, and the rules read from them.
 *
 * Inventory and Unit setup both quote prices and unit types from this list.
 * Each used to carry its own reading of it, which is how the same room ended up
 * described two ways. They read it here instead.
 */

/** Only the part of a Website room type these rules read. */
export type SiteRoomType = {
  code: string;
  residence_id?: string | undefined;
  unit_type?: string | undefined;
  occupancies?: string[] | undefined;
  rent?: { long?: { single?: number | null; twin?: number | null } } | undefined;
};

/** One empty list for every page still loading, so their memos hold still. */
export const NO_ROOM_TYPES: SiteRoomType[] = [];

type HasUnitType = { unit_type?: string | null | undefined };

export function unitTypeOf(r: HasUnitType): string {
  return String(r.unit_type ?? "").trim();
}

/** The unit types a list of room types describes, each once, in list order. */
export function unitTypeNames(list: HasUnitType[]): string[] {
  return Array.from(new Set(list.map(unitTypeOf).filter(Boolean)));
}

/**
 * The room types belonging to one unit type - or all of them, if none do.
 *
 * The Arc has a Room A in its 3-bedroom and another in its 4-bedroom at
 * different prices, so a unit must only be offered its own.
 */
export function typesOfUnitType<T extends HasUnitType>(list: T[], unitType?: string): T[] {
  const matching = list.filter((r) => unitTypeOf(r) === unitType);
  return matching.length ? matching : list;
}

/**
 * What one bed costs, by the prices set in Website.
 *
 * A room carries two rates: the whole room to one person, and the per-bed rate
 * when it is shared. The stored room rent is a single number and could only
 * ever hold one of them, so every vacant twin was showing the single rate -
 * RM1,050 against a bed that is sold at RM550.
 *
 * The bed's own rent wins when it has one, because that is a real tenancy at an
 * agreed price (including anything bulk-uploaded) and must not move when the
 * price list changes. A vacant bed has no such promise, so it quotes today's
 * configured rate.
 */
export function bedRent(
  roomTypes: SiteRoomType[],
  unit: Unit,
  room: Pick<UnitRoom, "letter" | "occupancy" | "rent" | "roomTypeCode">,
  bed: { rent?: number | undefined },
  asSingle = false,
) {
  if (bed.rent != null) return bed.rent;
  if (isUnitSlot(room)) return unit.wholeUnitRent;
  const rt = roomTypes.find((r) => r.code === room.roomTypeCode);
  // a whole empty room quoted as a single is priced as one, whatever the room
  // is normally sold as
  const want = asSingle ? "single" : room.occupancy === "twin" ? "twin" : "single";
  return Number(rt?.rent?.long?.[want]) || room.rent;
}

/**
 * An empty twin room, offered as a single.
 *
 * While both beds are free the room can still be sold whole to one person, so
 * it is listed once as "Single" at the single rate. The moment either bed is
 * taken that choice is gone, and the room goes back to being twin beds at the
 * twin rate. Nothing is stored: the rows follow who is actually in the room.
 *
 * The admin keeps the last word. Reserving the single row reserves the first
 * bed, so a student who asked for a twin can be put in it and the room simply
 * becomes twin again.
 */
export function collapseSingles(
  rows: BedRow[],
  roomTypes: SiteRoomType[],
): (BedRow & { asSingle: boolean })[] {
  const byRoom = new Map<string, BedRow[]>();
  for (const r of rows) byRoom.set(r.room.id, [...(byRoom.get(r.room.id) ?? []), r]);

  const out: (BedRow & { asSingle: boolean })[] = [];
  for (const group of byRoom.values()) {
    const room = group[0]!.room;

    // already let to one person: that is one let, so it is one row. The bed
    // held to keep the room empty is not a thing anybody can act on, and
    // listing it only invites someone to release it by mistake.
    const taken = group.some((g) => isSoldAsSingle(g.bed))
      ? group.find((g) => !isSoldAsSingle(g.bed))
      : undefined;
    if (taken) {
      out.push({ ...taken, asSingle: true });
      continue;
    }

    const rt = roomTypes.find((t) => t.code === room.roomTypeCode);
    const offersSingle = (rt?.occupancies ?? []).includes("single");
    const wholeRoomFree = group.length > 1 && group.every((g) => g.bed.status === "vacant");
    if (offersSingle && wholeRoomFree && !isUnitSlot(room)) {
      out.push({ ...group[0]!, asSingle: true });
    } else {
      for (const g of group) out.push({ ...g, asSingle: false });
    }
  }
  return out;
}
