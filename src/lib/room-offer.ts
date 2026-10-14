/*
 * How a room can be sold - kept in its own file so every screen, and every copy
 * of this app (Lovable's too), uses this one rule (11 Oct 2026).
 */
/**
 * Nobody is in the room and nobody is booked into it, now or later: the only
 * room whose shape may change - a single let as a twin, or a twin let whole as
 * one single (11 Oct 2026).
 */
export function roomUntouched(room: { beds: { status: string; upcoming?: unknown[] | undefined }[] }) {
  return room.beds.every((b) => b.status === "vacant" && !b.upcoming?.length);
}

export type Sharing = "single" | "twin" | "unit";

/**
 * How a room can be sold to someone who wants `wanted` - THE rule for every
 * screen that offers a room (Homes, the booking's room picker). Written once so
 * the screens cannot drift apart again: the picker had no "a twin room nobody
 * is in, sold whole as a single", which Homes had (A-07-03, Dani, 11 Oct 2026).
 *
 *   bed      the bed itself, as it is
 *   whole    a twin room nobody is in, let as one single - its other bed is
 *            marked Sold as single (place_stay with whole)
 *   (a single room is no longer made twin for a twin request: twin or single
 *   is Website's - shapeFromWebsite - so a single room is single, 11 Oct 2026)
 *   blocked  not for this request, and why
 *
 * `wanted` undefined is Homes, which lists every way a room can be sold.
 * `sellsSingle`: the room type has a single rate in Website.
 */
export function roomOffer(
  room: { letter: string; occupancy: string; beds: { status: string; upcoming?: unknown[] | undefined }[] },
  wanted: Sharing | undefined,
  sellsSingle: boolean,
): { as: "bed" | "whole" } | { blocked: string } {
  const unitSlot = room.letter.toLowerCase() === "unit";
  const twin = room.occupancy === "twin" && room.beds.length > 1;
  const untouched = roomUntouched(room);
  if (unitSlot) return !wanted || wanted === "unit" ? { as: "bed" } : { blocked: "Whole unit" };
  if (wanted === "unit") return { blocked: "Not a whole unit" };
  if (wanted === "twin") {
    if (twin) return { as: "bed" };
    return { blocked: "Single room" };
  }
  if (!twin) return { as: "bed" };
  if (untouched && sellsSingle) return { as: "whole" };
  if (!wanted) return { as: "bed" };
  return { blocked: "Twin room" };
}

/**
 * How many beds a room has, from its room type in Website (Dani, 11 Oct 2026):
 * twin if the type is sold as twin at all, else single. A room of a type sold
 * both ways is a twin room; while both beds are empty it is sold as a single
 * (roomOffer "whole"). Homes, the bulk upload and the server all ask this -
 * the room no longer keeps its own idea of its shape.
 */
export function shapeFromWebsite(type: { occupancies?: unknown } | null | undefined): "single" | "twin" {
  const occ = Array.isArray(type?.occupancies) ? (type!.occupancies as unknown[]) : [];
  return occ.includes("twin") ? "twin" : "single";
}

/** A unit can be let whole only when Website sets a whole-unit rate for its unit type. */
export function wholeUnitOffered(
  residence: { unit_rates?: unknown } | null | undefined,
  unitType: string,
) {
  const rates = (residence?.unit_rates ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const r = rates[unitType];
  return Number(r?.["long"]) > 0 || Number(r?.["short"]) > 0;
}

/**
 * The bed a placement written as text means (Dani, 12 Oct 2026). The master
 * list writes "Single" for one person alone in a room; a room that Website
 * sells as twin has "Twin 1" and "Twin 2" and no bed called "Single" - and that
 * one person has the room let whole as a single (roomOffer "whole"): Twin 1,
 * with Twin 2 marked Sold as single. Undefined when the bed is not there.
 */
export function bedForPlacement<B extends { label: string }>(
  room: { occupancy: string; beds: B[] },
  label: string,
): { bed: B; whole: boolean } | undefined {
  const want = label.trim().toLowerCase().replace(/\s+/g, " ");
  const exact = room.beds.find((b) => b.label.trim().toLowerCase().replace(/\s+/g, " ") === want);
  if (exact) return { bed: exact, whole: false };
  if (want === "single" && room.occupancy === "twin" && room.beds.length > 1) {
    const first = room.beds.find((b) => /1$/.test(b.label.trim())) ?? room.beds[0]!;
    return { bed: first, whole: true };
  }
  return undefined;
}

/**
 * The bed answers a placement in this room can be written as - the other way
 * round from bedForPlacement (Add existing resident, 14 Oct 2026): each bed's
 * own label, and "Single" for a twin room nobody is in, let whole.
 */
export function placementBedOptions(room: {
  occupancy: string;
  beds: { label: string; status: string; upcoming?: unknown[] | undefined }[];
}): { value: string; label: string }[] {
  const options = room.beds.map((b) => ({ value: b.label, label: b.label }));
  if (room.occupancy === "twin" && room.beds.length > 1 && roomUntouched(room)) {
    options.push({ value: "Single", label: "Single (whole room)" });
  }
  return options;
}
