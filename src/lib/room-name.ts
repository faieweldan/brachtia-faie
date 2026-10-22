/**
 * How a room is named, on every screen and document (Dani, 22 Oct 2026).
 *
 * The whole-unit letting is stored as the room "Unit" with its one bed "Unit"
 * (syncWholeUnitSlots). Printed as it is stored it read "Room Unit · Unit" on
 * the resident page, the invoice and the TA. It is "Whole unit" everywhere -
 * one meaning, one label - and every place that names a room asks here.
 */
export function isWholeUnitLetter(letter: string | null | undefined): boolean {
  return String(letter ?? "").trim().toLowerCase() === "unit";
}

/** "Room A", or "Whole unit" for the whole-unit letting; "" for none. */
export function roomName(letter: string | null | undefined): string {
  if (isWholeUnitLetter(letter)) return "Whole unit";
  const l = String(letter ?? "").trim();
  return l ? `Room ${l}` : "";
}

/** "Room A · Twin 1", or just "Whole unit" - its one bed is the unit itself. */
export function roomAndBed(letter: string | null | undefined, bed: string | null | undefined): string {
  if (isWholeUnitLetter(letter)) return "Whole unit";
  return [roomName(letter), String(bed ?? "").trim()].filter(Boolean).join(" · ");
}

/** A room already written into a record (an invoice's room line) before this rule. */
export function roomText(stored: string | null | undefined): string {
  return String(stored ?? "").replace(/Room\s+Unit(\s*·\s*Unit)?/gi, "Whole unit");
}
