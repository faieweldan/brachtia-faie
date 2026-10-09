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
 *   convert  a single room nobody is in, made twin for a twin request
 *   blocked  not for this request, and why
 *
 * `wanted` undefined is Homes, which lists every way a room can be sold.
 * `sellsSingle`: the room type has a single rate in Website.
 */
export function roomOffer(
  room: { letter: string; occupancy: string; beds: { status: string; upcoming?: unknown[] | undefined }[] },
  wanted: Sharing | undefined,
  sellsSingle: boolean,
): { as: "bed" | "whole" | "convert" } | { blocked: string } {
  const unitSlot = room.letter.toLowerCase() === "unit";
  const twin = room.occupancy === "twin" && room.beds.length > 1;
  const untouched = roomUntouched(room);
  if (unitSlot) return !wanted || wanted === "unit" ? { as: "bed" } : { blocked: "Whole unit" };
  if (wanted === "unit") return { blocked: "Not a whole unit" };
  if (wanted === "twin") {
    if (twin) return { as: "bed" };
    return untouched ? { as: "convert" } : { blocked: "Single room already occupied" };
  }
  if (!twin) return { as: "bed" };
  if (untouched && sellsSingle) return { as: "whole" };
  if (!wanted) return { as: "bed" };
  return { blocked: "Twin room" };
}
