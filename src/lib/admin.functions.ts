import { createServerFn } from "@tanstack/react-start";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Admin portal data access. The portal lives at an unlisted /admin URL and has no login. */
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const adminOverview = createServerFn({ method: "GET" })
  .handler(async () => {
    const supabase = await admin();
    const nowISO = new Date().toISOString();
    const [enq, appt, upcoming] = await Promise.all([
      supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("appointments")
        .select("*")
        .gte("starts_at", nowISO)
        .order("starts_at")
        .limit(5),
    ]);

    return {
      newEnquiries: enq.count ?? 0,
      pendingAppointments: appt.count ?? 0,
      upcoming: upcoming.data ?? [],
    };
  });

export const listEnquiries = createServerFn({ method: "GET" })
  .handler(async () => {
    const supabase = await admin();
    const { data, error } = await supabase
      .from("enquiries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getEnquiry = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { data: row, error } = await supabase
      .from("enquiries")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

export const updateEnquiry = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      id: string;
      status?: string;
      adminNotes?: string;
      assignedStaff?: string;
      residentId?: string;
      // editable student details
      fullName?: string;
      email?: string;
      phone?: string;
      nationality?: string;
      university?: string;
      gender?: string;
      intake?: string;
      // editable stay details
      residenceSlug?: string;
      residenceName?: string;
      roomCode?: string;
      roomName?: string;
      occupancy?: string;
      term?: string;
      moveIn?: string;
      moveOut?: string;
      monthlyRent?: number;
      firstPayment?: number;
      message?: string;
      heardAbout?: string;
      heardAboutOther?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = await admin();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.status) {
      patch["status"] = data.status;
      patch["stage_changed_at"] = new Date().toISOString();
    }
    if (data.adminNotes !== undefined) patch["admin_notes"] = data.adminNotes;
    if (data.assignedStaff !== undefined) patch["assigned_staff"] = data.assignedStaff;
    if (data.residentId !== undefined) patch["resident_id"] = data.residentId;
    if (data.fullName !== undefined) patch["full_name"] = data.fullName;
    if (data.email !== undefined) patch["email"] = data.email;
    if (data.phone !== undefined) patch["phone"] = data.phone;
    if (data.nationality !== undefined) patch["nationality"] = data.nationality;
    if (data.university !== undefined) patch["university"] = data.university;
    if (data.gender !== undefined) patch["gender"] = data.gender;
    if (data.intake !== undefined) patch["intake"] = data.intake;
    if (data.residenceSlug !== undefined) patch["residence_slug"] = data.residenceSlug;
    if (data.residenceName !== undefined) patch["residence_name"] = data.residenceName;
    if (data.roomCode !== undefined) patch["room_code"] = data.roomCode;
    if (data.roomName !== undefined) patch["room_name"] = data.roomName;
    if (data.occupancy !== undefined) patch["occupancy"] = data.occupancy;
    if (data.term !== undefined) patch["term"] = data.term;
    if (data.moveIn !== undefined) patch["move_in"] = data.moveIn || null;
    if (data.moveOut !== undefined) patch["move_out"] = data.moveOut || null;
    if (data.monthlyRent !== undefined) patch["monthly_rent"] = data.monthlyRent;
    if (data.firstPayment !== undefined) patch["first_payment"] = data.firstPayment;
    if (data.message !== undefined) patch["message"] = data.message;
    if (data.heardAbout !== undefined) patch["heard_about"] = data.heardAbout;
    if (data.heardAboutOther !== undefined) patch["heard_about_other"] = data.heardAboutOther;
    const { error } = await supabase.from("enquiries").update(patch as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Moves an enquiry along the pipeline and stamps the matching milestone. */
export const advanceEnquiryStage = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      id: string;
      to:
        | "room_reserved"
        | "viewing_scheduled"
        | "viewing_completed"
        | "awaiting_fee"
        | "booked"
        | "closed";
      note?: string;
      residentId?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = await admin();
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now, stage_changed_at: now };

    switch (data.to) {
      case "room_reserved":
        patch["status"] = "room_reserved";
        break;
      case "viewing_scheduled":
        patch["status"] = "viewing_scheduled";
        break;
      case "viewing_completed":
        patch["status"] = "viewing_scheduled";
        patch["viewing_completed_at"] = now;
        break;
      case "awaiting_fee":
        patch["status"] = "awaiting_fee";
        patch["invoice_issued_at"] = now;
        break;
      case "booked":
        patch["status"] = "booked";
        patch["fee_received_at"] = now;
        break;
      case "closed":
        patch["status"] = "closed";
        break;
    }
    if (data.note !== undefined) patch["admin_notes"] = data.note;
    if (data.residentId !== undefined) patch["resident_id"] = data.residentId;

    const { error } = await supabase.from("enquiries").update(patch as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const listAppointments = createServerFn({ method: "GET" })
  .handler(async () => {
    const supabase = await admin();
    const [appts, types, rules, blocked] = await Promise.all([
      supabase.from("appointments").select("*").order("starts_at", { ascending: true }),
      supabase.from("appointment_types").select("*").order("sort_order"),
      supabase.from("availability_rules").select("*").order("weekday"),
      supabase.from("blocked_dates").select("*").order("blocked_on"),
    ]);
    if (appts.error) throw new Error(appts.error.message);
    return {
      appointments: appts.data ?? [],
      types: types.data ?? [],
      rules: rules.data ?? [],
      blocked: blocked.data ?? [],
    };
  });

export const saveAppointment = createServerFn({ method: "POST" })
  .inputValidator((data: { id?: string; values: Record<string, unknown> }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const values = { ...data.values, updated_at: new Date().toISOString() };
    const q = data.id
      ? supabase.from("appointments").update(values as any).eq("id", data.id)
      : supabase.from("appointments").insert(values as any);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAppointment = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { error } = await supabase.from("appointments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveAvailabilityRule = createServerFn({ method: "POST" })
  .inputValidator((data: { id?: string; values: Record<string, unknown> }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const q = data.id
      ? supabase.from("availability_rules").update(data.values as any).eq("id", data.id)
      : supabase.from("availability_rules").insert(data.values as any);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAvailabilityRule = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { error } = await supabase.from("availability_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveBlockedDate = createServerFn({ method: "POST" })
  .inputValidator((data: { blockedOn: string; reason?: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { error } = await supabase
      .from("blocked_dates")
      .insert({ blocked_on: data.blockedOn, reason: data.reason ?? "" } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBlockedDate = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { error } = await supabase.from("blocked_dates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveAppointmentType = createServerFn({ method: "POST" })
  .inputValidator((data: { id?: string; values: Record<string, unknown> }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const q = data.id
      ? supabase.from("appointment_types").update(data.values as any).eq("id", data.id)
      : supabase.from("appointment_types").insert(data.values as any);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAppointmentType = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { error } = await supabase.from("appointment_types").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lightweight residence list for pickers. */
export const listResidenceOptions = createServerFn({ method: "GET" })
  .handler(async () => {
    const supabase = await admin();
    const { data, error } = await supabase
      .from("residences")
      .select("id,slug,name")
      .order("sort_order");
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; slug: string; name: string }[];
  });

/* ---------------- Residences ---------------- */


export const listResidences = createServerFn({ method: "GET" })
  .handler(async () => {
    const supabase = await admin();
    const [res, rooms] = await Promise.all([
      supabase.from("residences").select("*").order("sort_order"),
      supabase.from("room_types").select("*").order("sort_order"),
    ]);
    if (res.error) throw new Error(res.error.message);
    return { residences: res.data ?? [], rooms: rooms.data ?? [] };
  });

export const saveResidence = createServerFn({ method: "POST" })
  .inputValidator((data: { id?: string; values: Record<string, unknown> }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const q = data.id
      ? supabase.from("residences").update(data.values as any).eq("id", data.id).select("id")
      : supabase.from("residences").insert(data.values as any).select("id");
    const { data: row, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as any)?.id as string | undefined };
  });

export const deleteResidence = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { error } = await supabase.from("residences").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveRoomType = createServerFn({ method: "POST" })
  .inputValidator((data: { id?: string; values: Record<string, unknown> }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const q = data.id
      ? supabase.from("room_types").update(data.values as any).eq("id", data.id)
      : supabase.from("room_types").insert(data.values as any);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRoomType = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { error } = await supabase.from("room_types").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Enquiry ↔ viewing links ---------------- */

export const linkAppointmentToEnquiry = createServerFn({ method: "POST" })
  .inputValidator((data: { appointmentId: string; enquiryId: string | null }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { error } = await supabase
      .from("appointments")
      .update({ enquiry_id: data.enquiryId, updated_at: new Date().toISOString() } as any)
      .eq("id", data.appointmentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Viewings ---------------- */

export const bookViewingForEnquiry = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      enquiryId: string;
      startsAt: string;
      mode: "in_person" | "virtual";
      assignedStaff?: string;
      appointmentId?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { data: enquiry, error } = await supabase
      .from("enquiries")
      .select("*")
      .eq("id", data.enquiryId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!enquiry) throw new Error("Booking not found");

    const { upsertViewing } = await import("@/lib/viewings.server");
    const id = await upsertViewing({
      enquiry,
      startsAt: data.startsAt,
      mode: data.mode,
      ...(data.assignedStaff !== undefined ? { assignedStaff: data.assignedStaff } : {}),
      ...(data.appointmentId ? { appointmentId: data.appointmentId } : {}),
    });
    return { ok: true, id };
  });

export const cancelViewing = createServerFn({ method: "POST" })
  .inputValidator((data: { appointmentId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled", updated_at: new Date().toISOString() } as any)
      .eq("id", data.appointmentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Creates (or reuses) the student's self-service viewing link. */
export const generateViewingToken = createServerFn({ method: "POST" })
  .inputValidator((data: { enquiryId: string; regenerate?: boolean }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { data: row, error } = await supabase
      .from("enquiries")
      .select("viewing_token")
      .eq("id", data.enquiryId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const existing = (row as any)?.viewing_token as string | null | undefined;
    if (existing && !data.regenerate) return { token: existing };

    const { makeViewingToken } = await import("@/lib/viewings.server");
    const token = makeViewingToken();
    const { error: upErr } = await supabase
      .from("enquiries")
      .update({ viewing_token: token, updated_at: new Date().toISOString() } as any)
      .eq("id", data.enquiryId);
    if (upErr) throw new Error(upErr.message);
    return { token };
  });
