/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Where a booking's bed is: its unit number and room letter.
 *
 * Named rather than implied: "Unit A-07-03 · Room C" is a place, where "Room C"
 * on its own is a description. Empty until a bed is held for them, because
 * inventing one would be worse than saying nothing.
 *
 * Three plain lookups rather than one nested select. Embedding beds -> rooms ->
 * units asks PostgREST to infer two relationships, and when that inference
 * fails it fails as an empty result - which is exactly what a booking with no
 * bed held looks like, so nobody could tell the two apart.
 *
 * A bed still holding a released booking is skipped: changing rooms leaves the
 * old one behind, and the student must be told where they are now.
 *
 * Shared by the viewing page and the application link, so both say the same
 * place the same way.
 */
export async function heldPlace(
  supabase: any,
  enquiryId: string,
): Promise<{ unitNo: string; roomLetter: string }> {
  let unitNo = "";
  let roomLetter = "";
  if (!enquiryId) return { unitNo, roomLetter };

  const { data: beds, error: bedError } = await supabase
    .from("beds")
    .select("room_id, status")
    .eq("enquiry_id", enquiryId);
  if (bedError) console.warn("unit lookup failed at beds", bedError.message);
  // paid for a room somebody else still lives in: the tenancy names the bed
  let later: { room_id: string } | null = null;
  const own = ((beds ?? []) as { room_id: string; status: string }[]).find((b) => b.status !== "vacant");
  if (!own) {
    const { data: t } = await supabase.from("tenancies").select("bed_id").eq("enquiry_id", enquiryId).maybeSingle();
    if (t?.bed_id) {
      const { data: b } = await supabase.from("beds").select("room_id").eq("id", t.bed_id).maybeSingle();
      later = b ?? null;
    }
  }
  const held = own ?? later;
  if (!held?.room_id) return { unitNo, roomLetter };

  const { data: theRoom, error: roomError } = await supabase
    .from("rooms")
    .select("letter, unit_id")
    .eq("id", held.room_id)
    .maybeSingle();
  if (roomError) console.warn("unit lookup failed at rooms", roomError.message);
  roomLetter = String((theRoom as { letter?: string } | null)?.letter ?? "");
  const unitId = (theRoom as { unit_id?: string } | null)?.unit_id;
  if (unitId) {
    const { data: theUnit, error: unitError } = await supabase
      .from("units")
      .select("unit_no")
      .eq("id", unitId)
      .maybeSingle();
    if (unitError) console.warn("unit lookup failed at units", unitError.message);
    unitNo = String((theUnit as { unit_no?: string } | null)?.unit_no ?? "");
  }
  return { unitNo, roomLetter };
}

/** "Unit A-07-03 · Room C", or as much of it as is known. */
export function placeLabel(unitNo: string, roomLetter: string): string {
  return [unitNo ? `Unit ${unitNo}` : "", roomLetter ? `Room ${roomLetter}` : ""]
    .filter(Boolean)
    .join(" · ");
}
