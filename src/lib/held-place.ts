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
  /** the resident, when the caller knows them - their place is the one every screen shows */
  residentId?: string,
): Promise<{ unitNo: string; roomLetter: string }> {
  let unitNo = "";
  let roomLetter = "";
  if (!enquiryId && !residentId) return { unitNo, roomLetter };

  /*
   * A resident's place is SQL resident_placements - the same answer the admin
   * pages give (14 Oct 2026). Before, this read the booking's own tenancy, so
   * after an Update Tenancy move the student's link still named the old room.
   * A booking with nobody made from it yet: its unpaid hold.
   */
  let who = residentId ?? "";
  if (!who && enquiryId) {
    const { data: e } = await supabase
      .from("enquiries")
      .select("resident_id")
      .eq("id", enquiryId)
      .maybeSingle();
    who = /^[0-9a-f-]{36}$/i.test(String((e as any)?.resident_id ?? ""))
      ? String((e as any).resident_id)
      : "";
  }
  let bedId: string | null = null;
  if (who) {
    const { data: rows, error } = await supabase.rpc("resident_placements", { p_residents: [who] });
    if (error) console.warn("unit lookup failed at resident_placements", error.message);
    bedId = ((rows ?? []) as any[])[0]?.bed_id ?? null;
  } else {
    const { data: hold, error: bedError } = await supabase
      .from("placement_holds")
      .select("bed_id")
      .eq("enquiry_id", enquiryId)
      .maybeSingle();
    if (bedError) console.warn("unit lookup failed at holds", bedError.message);
    bedId = (hold as any)?.bed_id ?? null;
  }
  const { data: held } = bedId
    ? await supabase.from("beds").select("room_id").eq("id", bedId).maybeSingle()
    : { data: null };
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
