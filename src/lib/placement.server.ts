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
 * In order:
 *   1. the bed they are the resident of (checked in, or assigned after the
 *      last resident left)
 *   2. the bed their latest tenancy names - a paid stay still to come on
 *      somebody else's bed, or, after they leave, where they lived
 *
 * Server only - handed the service-role client by a server function.
 */
export type Placement = {
  bed: any;
  room: any | null;
  unit: any | null;
  residence: { id: string; name: string; slug: string } | null;
  /** "tenancy": a room they are not the resident of now - still to come, or left */
  via: "live" | "tenancy";
};

export async function placementForResident(sb: any, residentId: string): Promise<Placement | null> {
  if (!residentId) return null;
  let via: Placement["via"] = "live";
  let enquiryId: string | null = null;

  const { data: live } = await sb
    .from("beds")
    .select("*")
    .eq("resident_id", residentId)
    .limit(1)
    .maybeSingle();
  let bed: any = live ?? null;

  if (!bed) {
    const { data: ts } = await sb
      .from("tenancies")
      .select("enquiry_id, bed_id, start_date, created_at")
      .eq("resident_id", residentId)
      .not("bed_id", "is", null)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1);
    const t = ((ts ?? []) as any[])[0];
    if (t) {
      const { data: b } = await sb.from("beds").select("*").eq("id", t.bed_id).maybeSingle();
      if (b) {
        bed = b;
        via = "tenancy";
        enquiryId = t.enquiry_id ?? null;
      }
    }
  }
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

  const { data: room } = await sb.from("rooms").select("*").eq("id", bed.room_id).maybeSingle();
  const { data: unit } = room
    ? await sb.from("units").select("*").eq("id", room.unit_id).maybeSingle()
    : { data: null };
  const { data: residence } = unit
    ? await sb.from("residences").select("id, name, slug").eq("id", unit.residence_id).maybeSingle()
    : { data: null };
  return { bed, room: room ?? null, unit: unit ?? null, residence: residence ?? null, via };
}
