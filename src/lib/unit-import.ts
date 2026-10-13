import type { Unit, UnitRoom } from "@/lib/ops-store";

/*
 * The units bulk upload UPDATES the units it names (Dani, 12 Oct 2026).
 *
 * The master list is the true list of units, and it is uploaded again whenever
 * it changes. The upload used to save each unit over the one in the database:
 * every bed came back empty, so anybody placed in it lost their bed, and the
 * unit code was never read - the server handed out the next free number.
 * Now a unit in the file is matched to the one already there (by code, then by
 * unit number), and only what the file says is changed.
 */

/** Somebody is in the room, holds it, or has a stay coming onto it. */
export function roomInUse(room: Pick<UnitRoom, "beds">) {
  return room.beds.some(
    (b) => b.residentId || b.enquiryId || b.status !== "vacant" || (b.upcoming?.length ?? 0) > 0,
  );
}

const isSlot = (r: Pick<UnitRoom, "letter">) => r.letter.toLowerCase() === "unit";

/**
 * The unit as the file says it is, laid over the one already saved.
 *
 * - its unit number, type and residence follow the file
 * - a room the file names keeps its id and beds when it is already there; its
 *   room type follows the file, and its shape too unless somebody is in it
 * - a room the file does not name goes, unless somebody is in it - then it is
 *   kept and listed, never emptied
 * Returns what could not be changed, so the upload can say so.
 */
export function mergeUnitFromFile(
  existing: Unit | undefined,
  incoming: Unit,
): { unit: Unit; kept: string[] } {
  if (!existing) return { unit: incoming, kept: [] };
  const kept: string[] = [];

  // a unit let whole to somebody stays whole until they are moved
  const takenSlot = existing.rooms.find((r) => isSlot(r) && roomInUse(r));
  if (takenSlot && !incoming.rooms.some(isSlot)) {
    kept.push(`${existing.unitNo}: somebody has the whole unit - left as it is`);
    return { unit: { ...existing, unitNo: incoming.unitNo }, kept };
  }

  const rooms: UnitRoom[] = incoming.rooms.map((room) => {
    const old = existing.rooms.find((r) => r.letter.toLowerCase() === room.letter.toLowerCase());
    if (!old) return room;
    if (roomInUse(old)) {
      if (old.occupancy !== room.occupancy) {
        kept.push(`${existing.unitNo} Room ${old.letter}: somebody is in it - stays ${old.occupancy}`);
      }
      return { ...old, roomTypeCode: room.roomTypeCode, rent: room.rent };
    }
    return { ...room, id: old.id };
  });
  for (const old of existing.rooms) {
    if (rooms.some((r) => r.letter.toLowerCase() === old.letter.toLowerCase())) continue;
    if (roomInUse(old)) {
      kept.push(`${existing.unitNo} Room ${old.letter}: not in the file, but somebody is in it - kept`);
      rooms.push(old);
    }
  }

  return {
    unit: {
      ...existing,
      residenceId: incoming.residenceId,
      residenceName: incoming.residenceName,
      residenceSlug: incoming.residenceSlug,
      unitNo: incoming.unitNo,
      unitType: incoming.unitType,
      wholeUnit: rooms.some(isSlot),
      rooms,
    },
    kept,
  };
}

/** "The Arc" in a file is "The Arc, Cyberjaya" in Website. */
export function findResidence<T extends { name?: unknown }>(residences: T[], fromFile: string) {
  const want = fromFile.trim().toLowerCase();
  if (!want) return undefined;
  return (
    residences.find((r) => String(r.name).toLowerCase() === want) ??
    residences.find((r) => String(r.name).toLowerCase().startsWith(`${want},`))
  );
}

/** "B-08-3A" in the master list is "B-08-03A" in the system. */
export function normalUnitNo(raw: string) {
  return raw.trim().toUpperCase().replace(/-(\d)A$/, "-0$1A");
}
