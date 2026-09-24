import { createServerFn } from "@tanstack/react-start";
import { NEED_STAFF, logBookingEvent, rm, staffFor, when, words } from "@/lib/booking-events";

import { BOOKING_FEE, liveInvoices } from "@/lib/invoices";
import { residentCodeFor } from "@/lib/resident-billing.functions";

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
      paymentTerm?: string;
      unitType?: string;
      /** the add-ons chosen, by name */
      addons?: string[];
      /** the quote rebuilt from the stay - Update quote */
      quoteSnapshot?: unknown;
      message?: string;
      heardAbout?: string;
      heardAboutOther?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = await admin();
    // a booking always has someone on it: its staff member is changed, never removed
    let staffBefore: string | null = null;
    if (data.assignedStaff !== undefined) {
      if (!data.assignedStaff.trim()) {
        throw new Error("A booking always has a staff member - pick another name instead");
      }
      const { data: before } = await supabase
        .from("enquiries")
        .select("assigned_staff")
        .eq("id", data.id)
        .maybeSingle();
      staffBefore = String((before as any)?.assigned_staff ?? "");
    }
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
    if (data.paymentTerm !== undefined) patch["payment_term"] = data.paymentTerm;
    if (data.unitType !== undefined) patch["unit_type"] = data.unitType;
    if (data.addons !== undefined) patch["addons"] = data.addons;
    if (data.quoteSnapshot !== undefined) patch["quote_snapshot"] = data.quoteSnapshot;
    if (data.message !== undefined) patch["message"] = data.message;
    if (data.heardAbout !== undefined) patch["heard_about"] = data.heardAbout;
    if (data.heardAboutOther !== undefined) patch["heard_about_other"] = data.heardAboutOther;

    const stayChanged = [
      data.residenceSlug,
      data.roomCode,
      data.roomName,
      data.unitType,
      data.occupancy,
      data.term,
      data.moveIn,
      data.moveOut,
      data.paymentTerm,
    ].some((value) => value !== undefined);

    if (stayChanged) {
      const { data: current, error: currentError } = await supabase
        .from("enquiries")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      if (currentError) throw new Error(currentError.message);
      if (!current) throw new Error("Booking not found");

      const residenceSlug = String(patch["residence_slug"] ?? current.residence_slug ?? "");
      const roomCode = String(patch["room_code"] ?? current.room_code ?? "");
      const occupancy = String(patch["occupancy"] ?? current.occupancy ?? "single");
      const moveIn = String(patch["move_in"] ?? current.move_in ?? "");
      const moveOut = String(patch["move_out"] ?? current.move_out ?? "");
      const paymentTerm = String(patch["payment_term"] ?? current.payment_term ?? "bimonthly");

      const { data: residence, error: residenceError } = await supabase
        .from("residences")
        .select("*")
        .eq("slug", residenceSlug)
        .maybeSingle();
      if (residenceError) throw new Error(residenceError.message);

      if (residence && roomCode) {
        const { data: room, error: roomError } = await supabase
          .from("room_types")
          .select("*")
          .eq("residence_id", residence.id)
          .eq("code", roomCode)
          .maybeSingle();
        if (roomError) throw new Error(roomError.message);

        if (room) {
          const { stayQuote, termForRange } = await import("@/data/properties");
          const { rowToProperty, rowToRoomType } = await import("@/lib/site-mappers");
          const property = rowToProperty(residence);
          const roomType = rowToRoomType(room, residenceSlug);
          const term = moveIn && moveOut
            ? termForRange(moveIn, moveOut)
            : String(patch["term"] ?? current.term ?? "long");
          const rent = Number(roomType.rent[term as "long" | "short"]?.[occupancy as "single" | "twin"] ?? 0);
          /*
           * A booking names its add-ons. Everything that writes them - the
           * enquiry form, the cost calculator, Stay details - stores the label
           * a student saw, and this matched them against the id, so nothing
           * ever matched: the quote was rebuilt here WITHOUT the add-ons the
           * booking had, overwrote the one the card had just saved with them
           * in, and left "Quote is out of date" standing after every press of
           * Update quote.
           *
           * Both are accepted. The id is what should be stored, and matching it
           * first means a booking already saved that way keeps working when the
           * label is later reworded.
           */
          const chosen = Array.isArray(current.addons) ? current.addons.map(String) : [];
          const selectedAddons = (property.addons ?? []).filter(
            (addon) => chosen.includes(addon.id) || chosen.includes(addon.label),
          );
          const quote = moveIn && moveOut && rent
            ? stayQuote(
                property,
                rent,
                term as "long" | "short",
                moveIn,
                moveOut,
                paymentTerm as "bimonthly" | "quarterly" | "full",
                selectedAddons,
              )
            : null;

          patch["unit_type"] = room.unit_type;
          patch["room_name"] = room.name;
          patch["term"] = term;
          patch["monthly_rent"] = rent;
          patch["first_payment"] = quote?.totalUpfront ?? 0;
          patch["quote_snapshot"] = {
            ...(current.quote_snapshot && typeof current.quote_snapshot === "object" ? current.quote_snapshot : {}),
            property,
            room: roomType,
            occupancy,
            term,
            moveIn,
            moveOut,
            quote,
          };
        }
      }
    }
    const { error } = await supabase.from("enquiries").update(patch as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    if (staffBefore !== null && data.assignedStaff && staffBefore !== data.assignedStaff) {
      await logBookingEvent(supabase, {
        enquiryId: data.id,
        staff: data.assignedStaff,
        kind: "staff_assigned",
        summary: `Assigned to ${data.assignedStaff}${staffBefore ? ` · was ${staffBefore}` : ""}`,
      });
    }
    return { ok: true };
  });

/** Moves an enquiry along the pipeline and stamps the matching milestone. */
export const advanceEnquiryStage = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      id: string;
      to:
        | "open"
        | "room_reserved"
        | "viewing_scheduled"
        | "viewing_completed"
        | "awaiting_fee"
        | "awaiting_payment"
        | "booked"
        | "closed";
      note?: string;
      residentId?: string;
      /** why it was closed - a field, because "Duplicate" decides what the list shows */
      closeReason?: string;
      /** the booking being kept, when this one is closed as its duplicate */
      duplicateOf?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = await admin();
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now, stage_changed_at: now };
    const staff = await staffFor(supabase, data.id);

    /*
     * Their money is in and a resident was made from it, so there is no lead
     * here left to close - there is a tenancy, and a tenancy ends by refunding
     * and moving them out, not by closing the booking they arrived on. Every
     * reason on that menu describes somebody who never paid.
     *
     * The page greys the whole Close panel; this is the same rule where it
     * cannot be got round, because closing a paid booking strands the payment,
     * the invoice and the resident already made from it.
     */
    if (data.to === "closed") {
      const { data: paid } = await supabase
        .from("enquiries")
        .select("fee_received_at, resident_id")
        .eq("id", data.id)
        .maybeSingle();
      if ((paid as any)?.fee_received_at || (paid as any)?.resident_id) {
        throw new Error("This booking has been paid for, so it cannot be closed as a duplicate");
      }
    }

    switch (data.to) {
      /*
       * Reopening something closed by mistake. It comes back as New rather than
       * where it was: nothing records the stage a booking was at before it
       * closed, and putting it back at a guessed stage would be worse than
       * putting it back at the start. The reason and any duplicate link are
       * cleared by the caller, so it stops being marked as anybody's repeat.
       */
      case "open":
        patch["status"] = "open";
        break;
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
      case "awaiting_payment":
        patch["status"] = "awaiting_payment";
        patch["fee_received_at"] = now;
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
    if (data.closeReason !== undefined) patch["close_reason"] = data.closeReason;
    /*
     * The admin's answer, which overwrites whatever the submit-time guess made
     * of it: they are the one who looked at both bookings. Kept even when the
     * link is cleared, so "" really does mean "not a duplicate of anything".
     */
    if (data.duplicateOf !== undefined) patch["duplicate_of"] = data.duplicateOf || null;

    const { error } = await supabase.from("enquiries").update(patch as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    if (data.to === "closed") {
      const lastLine = (data.note ?? "").split("\n").pop() ?? "";
      const reason = lastLine.replace(/^Closed:\s*/, "");
      await logBookingEvent(supabase, {
        enquiryId: data.id,
        staff,
        kind: "booking_closed",
        summary: `Booking closed${reason ? ` · ${reason}` : ""}`,
      });
    }
    if (data.to === "viewing_completed") {
      await logBookingEvent(supabase, {
        enquiryId: data.id,
        staff,
        kind: "viewing_completed",
        summary: "Viewing completed",
      });
    }
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

/** Replaces every availability row for one capacity group in a single save. */
export const saveAvailabilityGrid = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      group: number;
      ranges: { weekday: number; start_time: string; end_time: string }[];
      validFrom?: string | null;
      validTo?: string | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = await admin();
    const del = await supabase
      .from("availability_rules")
      .delete()
      .eq("capacity_group", data.group);
    if (del.error) throw new Error(del.error.message);
    if (data.ranges.length) {
      const rows = data.ranges.map((r) => ({
        capacity_group: data.group,
        weekday: r.weekday,
        start_time: r.start_time,
        end_time: r.end_time,
        slot_minutes: 30,
        buffer_minutes: 0,
        capacity: 1,
        mode: "any",
        type_slug: "",
        residence_id: null,
        active: true,
        valid_from: data.validFrom || null,
        valid_to: data.validTo || null,
      }));
      const ins = await supabase.from("availability_rules").insert(rows as any);
      if (ins.error) throw new Error(ins.error.message);
    }
    return { ok: true };
  });

/** Removes an entire additional capacity. */
export const deleteCapacityGroup = createServerFn({ method: "POST" })
  .inputValidator((data: { group: number }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { error } = await supabase
      .from("availability_rules")
      .delete()
      .eq("capacity_group", data.group);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveBlockedDate = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      blockedOn: string;
      reason?: string | undefined;
      startTime?: string | undefined;
      endTime?: string | undefined;
    }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { error } = await supabase.from("blocked_dates").insert({
      blocked_on: data.blockedOn,
      reason: data.reason ?? "",
      start_time: data.startTime || null,
      end_time: data.endTime || null,
    } as any);
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

/** Room types for a residence, optionally filtered by unit type — used by the booking Room Preference dropdown. */
export const listRoomOptions = createServerFn({ method: "GET" })
  .inputValidator((data: { residenceSlug?: string; unitType?: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    let q = supabase.from("room_types").select("code,room_code,name,unit_type,occupancies");
    const { data: res, error } = await (async () => {
      if (data.residenceSlug) {
        const { data: rrow } = await supabase
          .from("residences").select("id").eq("slug", data.residenceSlug).maybeSingle();
        if (!rrow) return { data: null, error: null };
        q = q.eq("residence_id", rrow.id as string);
      }
      if (data.unitType) q = q.eq("unit_type", data.unitType);
      return await q.order("sort_order");
    })();
    if (error) throw new Error(error.message);
    return (res ?? []) as {
      code: string; room_code: string; name: string; unit_type: string; occupancies: string[];
    }[];
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
    const staff = String((enquiry as any).assigned_staff ?? "").trim();
    if (!staff) throw new Error(NEED_STAFF);
    // someone is responsible for every viewing
    const takenBy = String(data.assignedStaff ?? "").trim();
    if (!takenBy) throw new Error("Choose who takes the viewing");

    const { upsertViewing } = await import("@/lib/viewings.server");
    const id = await upsertViewing({
      enquiry,
      startsAt: data.startsAt,
      mode: data.mode,
      ...(data.assignedStaff !== undefined ? { assignedStaff: data.assignedStaff } : {}),
      ...(data.appointmentId ? { appointmentId: data.appointmentId } : {}),
    });
    await logBookingEvent(supabase, {
      enquiryId: data.enquiryId,
      staff,
      kind: data.appointmentId ? "viewing_moved" : "viewing_booked",
      ref: String(id ?? ""),
      summary: `Viewing ${data.appointmentId ? "moved to" : "booked for"} ${when(data.startsAt)} · with ${takenBy}`,
    });
    // the stage follows what is now true - forward or back
    const { syncBookingStage } = await import("@/lib/booking-lifecycle");
    await syncBookingStage(supabase, data.enquiryId);
    return { ok: true, id };
  });

/**
 * Who takes a viewing, set by itself.
 *
 * A student booking through their own link names nobody, so the viewing arrives
 * unstaffed and somebody has to be put on it before it goes ahead. Booking or
 * moving a viewing already asks for this; here it is the only thing that changes.
 */
export const assignViewingStaff = createServerFn({ method: "POST" })
  .inputValidator((data: { appointmentId: string; assignedStaff: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const staffName = data.assignedStaff.trim();
    if (!staffName) throw new Error("Choose who takes the viewing");

    const { data: appt } = await supabase
      .from("appointments")
      .select("enquiry_id, starts_at")
      .eq("id", data.appointmentId)
      .maybeSingle();
    const enquiryId = ((appt as any)?.enquiry_id ?? null) as string | null;
    // the booking's own staff member records it, whoever is taking the viewing
    const staff = enquiryId ? await staffFor(supabase, enquiryId) : "";

    const { error } = await supabase
      .from("appointments")
      .update({ assigned_staff: staffName, updated_at: new Date().toISOString() } as any)
      .eq("id", data.appointmentId);
    if (error) throw new Error(error.message);

    if (enquiryId) {
      await logBookingEvent(supabase, {
        enquiryId,
        staff,
        kind: "staff_assigned",
        ref: data.appointmentId,
        summary: `Viewing on ${when((appt as any).starts_at)} · ${staffName} taking it`,
      });
    }
    return { ok: true };
  });

export const cancelViewing = createServerFn({ method: "POST" })
  .inputValidator((data: { appointmentId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    // a booking's viewing is cancelled by the booking's staff member
    const { data: appt } = await supabase
      .from("appointments")
      .select("enquiry_id, starts_at")
      .eq("id", data.appointmentId)
      .maybeSingle();
    const enquiryId = ((appt as any)?.enquiry_id ?? null) as string | null;
    const staff = enquiryId ? await staffFor(supabase, enquiryId) : "";
    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled", updated_at: new Date().toISOString() } as any)
      .eq("id", data.appointmentId);
    if (error) throw new Error(error.message);
    if (enquiryId) {
      await logBookingEvent(supabase, {
        enquiryId,
        staff,
        kind: "viewing_cancelled",
        ref: data.appointmentId,
        summary: `Viewing on ${when((appt as any).starts_at)} cancelled`,
      });
      // the stage follows what is now true - forward or back
      const { syncBookingStage } = await import("@/lib/booking-lifecycle");
      await syncBookingStage(supabase, enquiryId);
    }
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

/* ---------------- Invoices, payments & receipts ---------------- */

export type InvoiceLine = { label: string; kind: string; amount: number };

/**
 * A booking's money: its one invoice, what has been paid on it - the booking fee
 * first - and every receipt.
 */
export const getBookingBilling = createServerFn({ method: "GET" })
  .inputValidator((data: { enquiryId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    // a cancelled invoice is kept as a record, but it is not this booking's
    // invoice any more - so "Generate invoice" comes back
    const { data: live, error } = await liveInvoices(supabase)
      .eq("enquiry_id", data.enquiryId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // one invoice per booking - the booking fee is its first payment
    const invoice = ((live ?? []) as any[])[0] ?? null;
    if (!invoice) {
      return {
        invoice: null,
        replaces: "",
        items: [],
        payments: [],
        receipts: [],
        paid: 0,
        balance: 0,
      };
    }

    const [items, payments, receipts] = await Promise.all([
      supabase.from("invoice_items").select("*").eq("invoice_id", invoice.id).order("sort_order"),
      supabase.from("payments").select("*").eq("invoice_id", invoice.id).order("paid_on"),
      supabase.from("receipts").select("*").eq("invoice_id", invoice.id).order("issued_at"),
    ]);
    const paid = ((payments.data ?? []) as any[]).reduce((n, p) => n + Number(p.amount || 0), 0);
    // issued again after a cancellation: the card says which one it replaces
    const { data: replaced } = invoice.replaces_invoice_id
      ? await supabase
          .from("invoices")
          .select("number")
          .eq("id", invoice.replaces_invoice_id)
          .maybeSingle()
      : { data: null };

    // the ID the student goes by, once the booking has made them a resident -
    // every invoice and receipt states it
    const residentCode = await residentCodeFor(supabase, String(invoice.resident_id ?? ""));

    return {
      invoice,
      residentCode,
      replaces: String((replaced as any)?.number ?? ""),
      items: items.data ?? [],
      payments: payments.data ?? [],
      receipts: receipts.data ?? [],
      paid,
      balance: Number(invoice.total || 0) - paid,
    };
  });

/**
 * The bookings this one might be a repeat of, for the picker on Close.
 *
 * Two lists in one: the ones that look like the same person - same email, same
 * phone or the same name, any one of which is enough - and then the rest of the
 * open bookings behind them. Detection misses a student who enquired twice with
 * two addresses, two numbers and a typo in their name, and staff still need to
 * link that one by hand.
 *
 * Closed bookings are left out: the point is to point at the one being kept.
 */
export const duplicateCandidates = createServerFn({ method: "GET" })
  .inputValidator((data: { enquiryId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { looksLikeSameSender } = await import("@/lib/enquiry-duplicates");

    const { data: mine } = await supabase
      .from("enquiries")
      .select("id, full_name, email, phone")
      .eq("id", data.enquiryId)
      .maybeSingle();
    if (!mine) return { matches: [], others: [] };

    const { data: rows, error } = await supabase
      .from("enquiries")
      .select("id, reference, full_name, email, phone, status, created_at")
      .neq("id", data.enquiryId)
      .neq("status", "closed")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    const all = (rows ?? []) as any[];
    const same = (r: any) => looksLikeSameSender(mine as any, r);
    return {
      matches: all.filter(same),
      others: all.filter((r) => !same(r)),
    };
  });

/**
 * The bookings closed as duplicates of this one.
 *
 * Shown on the booking being kept, because that is the one staff open. Without
 * it a closed duplicate is gone from their view entirely - it is still there,
 * still has its reference and its history, but nothing points at it.
 */
export const duplicatesOf = createServerFn({ method: "GET" })
  .inputValidator((data: { enquiryId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    /*
     * The generated types predate duplicate_of - the column is there, from the
     * 2026-09-21 migration - so the query is loosened rather than the filter
     * being left out.
     */
    const enquiries = supabase.from("enquiries") as any;
    const { data: rows, error } = await enquiries
      .select("id, reference, full_name, email, phone, status, created_at")
      .eq("duplicate_of", data.enquiryId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

/**
 * The pairs staff have said are different people.
 *
 * Read whole: it is one small table, and the list needs every pair to decide
 * what to stop marking. Each pair is stored once, a_id < b_id, so a dismissal
 * cannot hold in one direction and not the other.
 */
export const listNotDuplicates = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const { data, error } = await supabase
    .from("enquiry_not_duplicates" as never)
    .select("a_id, b_id");
  if (error) {
    // the table missing is not a reason to stop drawing the list
    console.warn(`not-duplicates: ${error.message}`);
    return [] as { a_id: string; b_id: string }[];
  }
  return (data ?? []) as unknown as { a_id: string; b_id: string }[];
});

/**
 * "These two are not the same person."
 *
 * The ids are sorted before writing, so whichever way round staff were looking
 * lands on the same row. Dismissing twice is not an error - the second one is
 * the same statement as the first.
 */
export const dismissDuplicate = createServerFn({ method: "POST" })
  .inputValidator((data: { aId: string; bId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const [a_id, b_id] = [data.aId, data.bId].sort();
    const { error } = await supabase
      .from("enquiry_not_duplicates" as never)
      .upsert({ a_id, b_id } as never, {
        onConflict: "a_id,b_id",
      });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const createInvoice = createServerFn({ method: "POST" })
  .inputValidator((data: {
    enquiryId: string;
    values: Record<string, unknown>;
    items: InvoiceLine[];
    invoiceDate?: string;
    paymentTerms?: string;
  }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    /*
     * An invoice prices a room. Without one reserved there is nothing to price,
     * and the invoice has to be issued again - so the server refuses it, not
     * just the button. A tab left open on an unreserved booking is exactly how
     * one gets through - Lav, 21 Sept 2026.
     */
    // beds is not in the generated types this file reads from, so it is reached
    // the same way booking-lifecycle reaches it
    const { data: held } = await (supabase as any)
      .from("beds")
      .select("id")
      .eq("enquiry_id", data.enquiryId)
      .limit(1);
    if (!((held ?? []) as any[]).length) {
      throw new Error("Reserve a room for this booking before generating its invoice");
    }
    const staff = await staffFor(supabase, data.enquiryId);
    const invoiceDate = data.invoiceDate || new Date().toISOString().slice(0, 10);
    const paymentTerms = data.paymentTerms || "NET15";
    const issuedAt = new Date(`${invoiceDate}T00:00:00Z`).toISOString();

    // the full initial payment - the booking fee is recorded against it later
    const lines = data.items;

    // issued again after one was cancelled: it points at the one it replaces
    const [{ data: voided }, { data: taken }] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, number")
        .eq("enquiry_id", data.enquiryId)
        .eq("status", "void")
        .order("created_at", { ascending: false }),
      supabase
        .from("invoices")
        .select("replaces_invoice_id")
        .eq("enquiry_id", data.enquiryId)
        .not("replaces_invoice_id", "is", null),
    ]);
    const replaced =
      ((voided ?? []) as any[]).find(
        (v) => !((taken ?? []) as any[]).some((t) => t.replaces_invoice_id === v.id),
      ) ?? null;
    const total = lines.reduce((n, l) => n + Number(l.amount || 0), 0);
    const deposits = lines
      .filter((l) => l.kind === "refundable")
      .reduce((n, l) => n + Number(l.amount || 0), 0);

    const { data: inv, error } = await supabase
      .from("invoices")
      .insert({
        ...data.values,
        enquiry_id: data.enquiryId,
        invoice_date: invoiceDate,
        payment_terms: paymentTerms,
        issued_at: issuedAt,
        total,
        deposits_total: deposits,
        ...(replaced ? { replaces_invoice_id: replaced.id } : {}),
      } as any)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const invoiceId = (inv as any).id as string;

    if (lines.length) {
      const rows = lines.map((l, i) => ({
        invoice_id: invoiceId,
        label: l.label,
        kind: l.kind,
        amount: Number(l.amount || 0),
        sort_order: i,
      }));
      const ins = await supabase.from("invoice_items").insert(rows as any);
      if (ins.error) throw new Error(ins.error.message);
    }

    // an issued invoice moves the booking to Awaiting Payment - forward only, so
    // an invoice generated again later never pulls a paying booking back
    const { data: enqNow } = await supabase
      .from("enquiries")
      .select("status")
      .eq("id", data.enquiryId)
      .maybeSingle();
    const beforeInvoice = ["open", "room_reserved", "viewing_scheduled"].includes(
      String((enqNow as any)?.status ?? ""),
    );
    const stamp = new Date().toISOString();
    await supabase
      .from("enquiries")
      .update({
        invoice_issued_at: stamp,
        updated_at: stamp,
        ...(beforeInvoice ? { status: "awaiting_fee", stage_changed_at: stamp } : {}),
      } as any)
      .eq("id", data.enquiryId);

    await logBookingEvent(supabase, {
      enquiryId: data.enquiryId,
      staff,
      kind: "invoice_issued",
      ref: String((inv as any).number ?? ""),
      summary: `Invoice ${(inv as any).number} issued · ${rm(total)}${
        replaced ? ` · replaces ${replaced.number}` : ""
      }`,
    });

    return { id: invoiceId, number: (inv as any).number as string };
  });

/** Nothing paid on it yet. Once money is recorded, an invoice is a record. */
async function paidOnInvoice(supabase: any, invoiceId: string) {
  const { count, error } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/**
 * How much has been paid on an invoice - the money, not the number of payments.
 *
 * RM250 today and RM250 on Friday is two rows and the whole fee; RM1 is one row
 * and none of it. Counting rows cannot tell those apart, so anything that turns
 * on how much is in asks this instead.
 */
async function paidTotalOnInvoice(supabase: any, invoiceId: string) {
  const { data, error } = await supabase
    .from("payments")
    .select("amount")
    .eq("invoice_id", invoiceId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).reduce((n, p) => n + Number(p.amount || 0), 0);
}

const asRM = (n: number) => `RM${n.toFixed(2)}`;

/**
 * Change an invoice: same number, new lines and details.
 *
 * Open to change while what is on it is the booking fee. The fee holds the room
 * and the stay it prices is still being settled - dates move, a room changes -
 * so the invoice has to be able to follow. Past the fee the student is paying
 * for the stay itself, and the figures they paid against are the ones they
 * agreed to, so it is closed.
 *
 * Never below what is already in: an invoice for less than has been paid puts
 * the student in credit, and there is nothing here that holds credit.
 */
export const updateInvoice = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      invoiceId: string;
      values: Record<string, unknown>;
      items: InvoiceLine[];
      invoiceDate?: string;
      paymentTerms?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { data: inv } = await supabase
      .from("invoices")
      .select("id, number, enquiry_id, status, invoice_type")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (!inv || (inv as any).status === "void") throw new Error("Invoice not found");
    // the same tolerance the fee is tested with everywhere else, so one booking
    // is never over the fee here and under it there
    const paidSoFar = await paidTotalOnInvoice(supabase, data.invoiceId);
    if (paidSoFar > BOOKING_FEE + 0.005) {
      throw new Error(
        `More than the ${asRM(BOOKING_FEE)} booking fee has been paid on this invoice, so it can no longer be changed`,
      );
    }
    if (
      paidSoFar > 0 &&
      data.items.reduce((n, l) => n + Number(l.amount || 0), 0) + 0.005 < paidSoFar
    ) {
      throw new Error(
        `${asRM(paidSoFar)} has been paid on this invoice, so it cannot be changed to less than that`,
      );
    }
    // an invoice on a booking is changed by the booking's staff member
    const staff = (inv as any).enquiry_id ? await staffFor(supabase, (inv as any).enquiry_id) : "";

    const enquiryId = (inv as any).enquiry_id as string | null;
    const lines = data.items;
    const invoiceDate = data.invoiceDate || new Date().toISOString().slice(0, 10);

    const { error } = await supabase
      .from("invoices")
      .update({
        ...data.values,
        invoice_date: invoiceDate,
        payment_terms: data.paymentTerms || "NET15",
        issued_at: new Date(`${invoiceDate}T00:00:00Z`).toISOString(),
        total: lines.reduce((n, l) => n + Number(l.amount || 0), 0),
        deposits_total: lines
          .filter((l) => l.kind === "refundable")
          .reduce((n, l) => n + Number(l.amount || 0), 0),
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", data.invoiceId);
    if (error) throw new Error(error.message);

    const { error: dropErr } = await supabase
      .from("invoice_items")
      .delete()
      .eq("invoice_id", data.invoiceId);
    if (dropErr) throw new Error(dropErr.message);
    if (lines.length) {
      const { error: itemErr } = await supabase.from("invoice_items").insert(
        lines.map((l, i) => ({
          invoice_id: data.invoiceId,
          label: l.label,
          kind: l.kind,
          amount: Number(l.amount || 0),
          sort_order: i,
        })) as any,
      );
      if (itemErr) throw new Error(itemErr.message);
    }
    if (enquiryId) {
      await logBookingEvent(supabase, {
        enquiryId,
        staff,
        kind: "invoice_edited",
        ref: String((inv as any).number ?? ""),
        summary: `Invoice ${(inv as any).number} edited · ${rm(lines.reduce((n, l) => n + Number(l.amount || 0), 0))}`,
      });
    }
    return { id: data.invoiceId, number: String((inv as any).number ?? "") };
  });

/**
 * Cancel an invoice nothing has been paid on - marked void, kept as a record,
 * never deleted. The booking can then generate again.
 * Refused once money is recorded on the invoice itself.
 */
export const cancelInvoice = createServerFn({ method: "POST" })
  .inputValidator((data: { invoiceId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { data: inv } = await supabase
      .from("invoices")
      .select("id, enquiry_id, invoice_type, status")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (!inv || (inv as any).status === "void") throw new Error("Invoice not found");
    if (await paidOnInvoice(supabase, data.invoiceId)) {
      throw new Error("Money has been paid on this invoice, so it can no longer be cancelled");
    }
    // an invoice on a booking is cancelled by the booking's staff member
    const staff = (inv as any).enquiry_id ? await staffFor(supabase, (inv as any).enquiry_id) : "";

    const enquiryId = (inv as any).enquiry_id as string | null;
    const targets = [data.invoiceId];

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("invoices")
      .update({ status: "void", updated_at: now } as any)
      .in("id", targets);
    if (error) throw new Error(error.message);

    // the invoice is gone; the stage is worked out once its activity rows are written
    if (enquiryId) {
      await supabase
        .from("enquiries")
        .update({ invoice_issued_at: null, updated_at: now } as any)
        .eq("id", enquiryId);
    }
    if (enquiryId) {
      const { data: gone } = await supabase
        .from("invoices")
        .select("number, invoice_type")
        .in("id", targets);
      for (const g of (gone ?? []) as any[]) {
        await logBookingEvent(supabase, {
          enquiryId,
          staff,
          kind: "invoice_cancelled",
          ref: String(g.number ?? ""),
          summary: `Invoice ${g.number} cancelled`,
        });
      }
    }
    if (enquiryId) {
      // the stage follows what is now true - forward or back
      const { syncBookingStage } = await import("@/lib/booking-lifecycle");
      await syncBookingStage(supabase, enquiryId);
    }
    return { ok: true, cancelled: targets.length };
  });

/** Logs a payment against an invoice and issues the matching receipt. */
export const recordPayment = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      invoiceId: string;
      amount: number;
      paidOn: string;
      method: string;
      reference?: string;
      proofPath?: string;
      /** what the money is for - "Booking fee" */
      description?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice) throw new Error("Invoice not found");
    if ((invoice as any).status === "void") {
      throw new Error("This invoice was cancelled");
    }
    if ((invoice as any).status === "scheduled") {
      throw new Error("This invoice is not billed yet");
    }

    // money on a booking's invoice is recorded by the booking's staff member
    const payStaff = (invoice as any).enquiry_id
      ? await staffFor(supabase, (invoice as any).enquiry_id)
      : "";

    const existing = await supabase.from("payments").select("amount").eq("invoice_id", data.invoiceId);
    const paidBefore = (existing.data ?? []).reduce((n: number, p: any) => n + Number(p.amount || 0), 0);
    const amount = Number(data.amount || 0);
    const balance = Number((invoice as any).total || 0) - paidBefore - amount;

    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .insert({
        invoice_id: data.invoiceId,
        enquiry_id: (invoice as any).enquiry_id,
        resident_id: (invoice as any).resident_id ?? "",
        amount,
        paid_on: data.paidOn,
        method: data.method,
        reference: data.reference ?? "",
        proof_path: data.proofPath ?? "",
        description: data.description ?? "",
      } as any)
      .select("*")
      .maybeSingle();
    if (payErr) throw new Error(payErr.message);

    const { data: receipt, error: recErr } = await supabase
      .from("receipts")
      .insert({
        payment_id: (payment as any).id,
        invoice_id: data.invoiceId,
        enquiry_id: (invoice as any).enquiry_id,
        resident_id: (invoice as any).resident_id ?? "",
        amount,
        balance_after: balance,
        paid_to_date: paidBefore + amount,
      } as any)
      .select("*")
      .maybeSingle();
    if (recErr) throw new Error(recErr.message);
    if ((invoice as any).enquiry_id) {
      const receiptNo = String((receipt as any)?.number ?? "");
      const forWhat = data.description ? ` (${data.description})` : "";
      await logBookingEvent(supabase, {
        enquiryId: (invoice as any).enquiry_id,
        staff: payStaff,
        kind: "payment_recorded",
        ref: String((payment as any).id),
        summary: `${rm(amount)}${forWhat} received for ${(invoice as any).number} by ${words(data.method)}${receiptNo ? ` · Receipt ${receiptNo}` : ""}`,
      });
    }

    await supabase
      .from("invoices")
      .update({
        status: balance <= 0 ? "paid" : "part_paid",
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", data.invoiceId);

    const enquiryId = (invoice as any).enquiry_id as string | null;
    let residentId = "";
    let residentCode = "";
    let residentCreated = false;

    if (enquiryId) {
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { updated_at: now };
      const { data: enq } = await supabase
        .from("enquiries")
        .select("fee_received_at,status,resident_id")
        .eq("id", enquiryId)
        .maybeSingle();

      /*
       * The booking fee is RM500, and it is the fee in full that confirms the
       * room - part of it confirms nothing. So the booking's payments are added
       * up, and only once they reach the fee does the booking become Booked and
       * the student become a resident. Below it the booking waits where it is.
       *
       * The money is not finished either way: the invoice stays part paid, and
       * its balance is chased on the resident's Payments tab and Collections.
       */
      const { data: feePayments } = await supabase
        .from("payments")
        .select("amount")
        .eq("enquiry_id", enquiryId);
      const paidOnBooking = ((feePayments ?? []) as any[]).reduce(
        (n, p) => n + Number(p.amount || 0),
        0,
      );
      const feeIn = paidOnBooking + 0.005 >= BOOKING_FEE;
      const current = String((enq as any)?.status ?? "");

      if (feeIn) {
        if (enq && !(enq as any).fee_received_at) patch["fee_received_at"] = now;
        if (enq && current !== "closed" && current !== "booked") {
          patch["status"] = "booked";
          patch["stage_changed_at"] = now;
        }
      }
      await supabase
        .from("enquiries")
        .update(patch as any)
        .eq("id", enquiryId);

      /*
       * The resident is made here rather than by a button someone has to
       * remember: the fee is in, so they are coming. A booking that already has
       * a resident simply keeps them. If this fails the payment still stands -
       * the booking page offers Create resident to put it right.
       */
      if (feeIn && current !== "closed") {
        try {
          const { residentFromBooking } = await import("@/lib/booking-lifecycle");
          const made = await residentFromBooking(supabase, enquiryId);
          residentId = made.residentId;
          residentCode = made.residentCode;
          residentCreated = made.changed;
        } catch (err) {
          console.warn(
            `resident from booking: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    return { receipt, balance, residentId, residentCode, residentCreated };
  });

/** Whether a booking's bed may be released, and the invoice that goes with it. See booking-lifecycle.ts. */
export const releaseBookingRoom = createServerFn({ method: "POST" })
  .inputValidator((data: { enquiryId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const staff = await staffFor(supabase, data.enquiryId);
    const { releaseBooking } = await import("@/lib/booking-lifecycle");
    const result = await releaseBooking(supabase, data.enquiryId);
    if (result.ok) {
      await logBookingEvent(supabase, {
        enquiryId: data.enquiryId,
        staff,
        kind: "room_released",
        summary: result.voided.length
          ? `Room released · ${result.voided.join(", ")} cancelled`
          : "Room released",
      });
      // the stage follows what is now true - forward or back
      const { syncBookingStage } = await import("@/lib/booking-lifecycle");
      await syncBookingStage(supabase, data.enquiryId);
    }
    return result;
  });

/**
 * Admin creates the resident from a booking once its booking fee is recorded:
 * their bed, dates, rent and payment plan come across, and the booking's
 * invoice, payments and receipts are linked to them - so the same money shows on
 * their profile. Running it on a booking that has its resident is safe.
 */
export const createResidentFromBooking = createServerFn({ method: "POST" })
  .inputValidator((data: { enquiryId: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { count, error } = await supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("enquiry_id", data.enquiryId);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("Record the booking fee first");
    const { residentFromBooking } = await import("@/lib/booking-lifecycle");
    return residentFromBooking(supabase, data.enquiryId);
  });
