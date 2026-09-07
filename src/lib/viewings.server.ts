/* eslint-disable @typescript-eslint/no-explicit-any */
/** Shared server-only helpers for viewing appointments tied to a booking (enquiry). */

export type ViewingMode = "in_person" | "virtual";

export function viewingTypeSlug(mode: ViewingMode) {
  return mode === "virtual" ? "viewing-virtual" : "viewing-in-person";
}

export function makeViewingToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Creates (or reschedules) the viewing appointment for an enquiry and links it back.
 * Returns the appointment id.
 */
export async function upsertViewing(opts: {
  enquiry: any;
  startsAt: string;
  mode: ViewingMode;
  assignedStaff?: string;
  appointmentId?: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const enquiry = opts.enquiry;
  const typeSlug = viewingTypeSlug(opts.mode);

  const [{ data: residence }, { data: type }] = await Promise.all([
    supabaseAdmin
      .from("residences")
      .select("id,name")
      .eq("slug", enquiry.residence_slug ?? "")
      .maybeSingle(),
    supabaseAdmin
      .from("appointment_types")
      .select("duration_minutes")
      .eq("slug", typeSlug)
      .maybeSingle(),
  ]);

  const values: Record<string, unknown> = {
    type_slug: typeSlug,
    residence_id: (residence?.id as string | undefined) ?? null,
    residence_slug: enquiry.residence_slug ?? "",
    residence_name: (residence?.name as string | undefined) ?? enquiry.residence_name ?? "",
    residence_slugs: enquiry.residence_slug ? [enquiry.residence_slug] : [],
    residence_names: enquiry.residence_name ? [enquiry.residence_name] : [],
    move_in: enquiry.move_in || null,
    move_out: enquiry.move_out || null,
    sharing_preference: enquiry.occupancy ?? "",
    mode: opts.mode,
    starts_at: opts.startsAt,
    duration_minutes: (type?.duration_minutes as number | undefined) ?? 30,
    status: "confirmed",
    full_name: enquiry.full_name ?? "",
    email: enquiry.email ?? "",
    phone: enquiry.phone ?? "",
    university: enquiry.university ?? "",
    nationality: enquiry.nationality ?? "",
    intake: enquiry.intake ?? "",
    gender: enquiry.gender ?? "",
    enquiry_id: enquiry.id,
    source: "booking",
    updated_at: new Date().toISOString(),
  };
  if (opts.assignedStaff !== undefined) values["assigned_staff"] = opts.assignedStaff;

  if (opts.appointmentId) {
    const { error } = await supabaseAdmin
      .from("appointments")
      .update(values as any)
      .eq("id", opts.appointmentId);
    if (error) throw new Error(error.message);
    return opts.appointmentId;
  }

  const { data, error } = await supabaseAdmin
    .from("appointments")
    .insert(values as any)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("enquiries")
    .update({ status: "viewing_scheduled", stage_changed_at: now, updated_at: now } as any)
    .eq("id", enquiry.id)
    .in("status", ["open", "room_reserved", "viewing_scheduled"]);

  return (data as any)?.id as string | undefined;
}
