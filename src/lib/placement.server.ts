/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Where a resident is placed, for anything that prints or picks by it - the
 * agreement and its templates, the inventory, the checkout statement
 * (Dani, 8-9 Oct 2026).
 *
 * Each of those used to find the bed whose resident_id was theirs. That is
 * right for somebody living there, and wrong twice over for a room booked for
 * after somebody else leaves: Aisha, booked into Room C from 20 Oct, is not on
 * Room C's bed while Muhammad still is - so her agreement had no room - and
 * once Muhammad leaves and Aisha takes the bed, his checkout statement lost
 * his room.
 *
 * The bed is SQL resident_placements (20261014100000_one_placement.sql) - the
 * same answer the Residents list, the resident page and Homes give (14 Oct
 * 2026). In order:
 *   1. the bed they are the resident of (checked in, or assigned after the
 *      last resident left)
 *   2. the bed their latest tenancy names - a paid stay still to come on
 *      somebody else's bed, or, after they leave, where they lived
 *   3. the bed their booking still holds
 *
 * Server only - handed the service-role client by a server function.
 */
export type Placement = {
  bed: any;
  room: any | null;
  unit: any | null;
  residence: { id: string; name: string; slug: string; rental_terms?: unknown } | null;
  /** "tenancy": a room they are not the resident of now - still to come, or left */
  via: "live" | "tenancy";
  /** a twin room let whole as one single - the placement's own record (let_whole) */
  letWhole: boolean;
};

/**
 * A bed's room (with its beds), unit and residence - the one way every
 * document reads where a placement is (14 Oct 2026). The room carries its beds
 * so a twin room let whole reads as the single it was sold as (soldOccupancy):
 * a room change's documents read the new room by hand, without them, and the
 * revised Schedule A said "twin" for a single.
 */
export async function bedSurroundings(sb: any, roomId: string | null | undefined) {
  if (!roomId) return { room: null, unit: null, residence: null };
  const [{ data: roomRow }, { data: siblings }] = await Promise.all([
    sb.from("rooms").select("*").eq("id", roomId).maybeSingle(),
    sb.from("beds").select("id, label, hold_for").eq("room_id", roomId),
  ]);
  const room = roomRow ? { ...roomRow, beds: siblings ?? [] } : null;
  const { data: unit } = room
    ? await sb.from("units").select("*").eq("id", room.unit_id).maybeSingle()
    : { data: null };
  // "*", like the room and unit above: naming rental_terms failed the whole
  // query on a database without the column yet, and with no residence the
  // pack found none of its templates (27 Oct 2026)
  const { data: residence } = unit
    ? await sb.from("residences").select("*").eq("id", unit.residence_id).maybeSingle()
    : { data: null };
  return { room, unit: unit ?? null, residence: residence ?? null };
}

/**
 * Where a placement is, as an invoice states it (14 Oct 2026) - the residence,
 * "Unit A-07-03 · Room B", and the occupancy AS SOLD (soldOccupancy): a twin
 * room let whole is "single". Every invoice row that names a place is written
 * from here - the scheduled rent, an Update Tenancy IP, a room change - never
 * copied from another invoice or from what a screen sent: the rent rows copied
 * the first invoice and said "twin" for a resident paying the single rate.
 * `letWhole` is the placement's own record when the caller has it.
 */
export async function invoicePlace(sb: any, bedId: string | null | undefined, letWhole?: boolean | undefined) {
  if (!bedId) return null;
  const { data: bed } = await sb.from("beds").select("room_id").eq("id", bedId).maybeSingle();
  const { room, unit, residence } = await bedSurroundings(sb, bed?.room_id);
  if (!room) return null;
  const { soldOccupancy } = await import("@/lib/placement");
  const { placeLabel } = await import("@/lib/held-place");
  return {
    residence_name: String(residence?.name ?? ""),
    room_name: placeLabel(String(unit?.unit_no ?? ""), String(room.letter ?? "")),
    occupancy: soldOccupancy(room, letWhole),
  };
}

/** the resident's own placement, as an invoice states it - their bed and how it was sold */
export async function residentInvoicePlace(sb: any, residentId: string) {
  const p = await placementForResident(sb, residentId);
  return p ? invoicePlace(sb, String(p.bed.id), p.letWhole) : null;
}

export async function placementForResident(sb: any, residentId: string): Promise<Placement | null> {
  if (!residentId) return null;
  const { data: rows, error } = await sb.rpc("resident_placements", { p_residents: [residentId] });
  if (error) throw new Error(error.message);
  const p = ((rows ?? []) as any[])[0];
  if (!p?.bed_id) return null;
  const via: Placement["via"] = p.via === "seated" ? "live" : "tenancy";
  const enquiryId: string | null = p.enquiry_id ?? null;
  const { data: found } = await sb.from("beds").select("*").eq("id", p.bed_id).maybeSingle();
  let bed: any = found ?? null;
  if (!bed) return null;

  /*
   * A bed found through a tenancy may carry whoever is its resident now -
   * Muhammad's rent and dates on Room C. None of that is this resident's, so
   * it is cleared, and the rent is the one their booking agreed.
   */
  if (bed.resident_id !== residentId) {
    let rent: number | null = null;
    if (enquiryId) {
      const { data: inv } = await sb
        .from("invoices")
        .select("monthly_rent")
        .eq("enquiry_id", enquiryId)
        .neq("status", "void")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      rent = Number(inv?.monthly_rent || 0) || null;
    }
    bed = {
      ...bed,
      resident_id: residentId,
      resident_name: null,
      student_id: null,
      university: null,
      nationality: null,
      gender: null,
      tenancy_start: null,
      tenancy_end: null,
      rent,
      hold_for: null,
      hold_until: null,
      enquiry_id: enquiryId,
      status: "booked",
    };
  }

  const { room, unit, residence } = await bedSurroundings(sb, bed.room_id);
  // how it was sold: the tenancy's record for this bed, else the booking's hold
  const [{ data: ten }, { data: hold }] = await Promise.all([
    sb.from("tenancies").select("let_whole").eq("resident_id", residentId).eq("bed_id", String(bed.id)).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("placement_holds").select("let_whole").eq("bed_id", bed.id).or(`resident_id.eq.${residentId}${enquiryId ? `,enquiry_id.eq.${enquiryId}` : ""}`).limit(1).maybeSingle(),
  ]);
  const { soldWhole } = await import("@/lib/placement");
  const stored = (ten as any)?.let_whole ?? (hold as any)?.let_whole;
  const letWhole = soldWhole(room, typeof stored === "boolean" ? stored : undefined);
  return { bed, room: room ?? null, unit: unit ?? null, residence: residence ?? null, via, letWhole };
}
