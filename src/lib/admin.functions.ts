import { nextRentalPayment } from "@/lib/rental-schedule";
import { createServerFn } from "@tanstack/react-start";
import { NEED_STAFF, logBookingEvent, rm, staffFor, when, words } from "@/lib/booking-events";

import { BOOKING_FEE, discountPerMonth, lineQty, liveInvoices } from "@/lib/invoices";
import { residentCodeFor } from "@/lib/resident-billing.functions";
import { cleanPhone } from "@/lib/reference-data";
import { addDays, CHECKIN_WINDOW_DAYS, needsCheckInBooking, todayISO } from "@/lib/checkin";

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
        // new and pending both still need somebody to act on them
        .in("status", ["new", "pending"]),
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
      checkinsToBook: await checkInsToBook(supabase),
    };
  });

/**
 * Residents moving in within the week, or inside their arrival window, with no
 * day and time chosen - including those who ticked "Remind me". The website
 * does not send that reminder yet, so the dashboard asks the admin to
 * (30 Sep 2026).
 */
async function checkInsToBook(supabase: any): Promise<{ id: string; full_name: string; remind: boolean }[]> {
  const today = todayISO();
  const { data: tenancies } = await supabase
    .from("tenancies")
    .select("resident_id, start_date")
    .gte("start_date", addDays(today, -CHECKIN_WINDOW_DAYS))
    .lte("start_date", addDays(today, CHECKIN_WINDOW_DAYS));
  const moveIn = new Map<string, string>();
  for (const t of (tenancies ?? []) as any[]) if (t.start_date) moveIn.set(t.resident_id, t.start_date);
  if (!moveIn.size) return [];
  const { data: residents } = await supabase
    .from("residents")
    .select("id, full_name")
    .in("id", [...moveIn.keys()]);
  // the check-in appointment is the record - a reschedule counts (10 Oct 2026)
  const { checkInsFor } = await import("@/lib/checkin.server");
  const booked = await checkInsFor(supabase, [...moveIn.keys()]);
  return ((residents ?? []) as any[])
    .map((r) => ({ r, status: booked.get(r.id)?.status ?? "none" }))
    .filter(({ r, status }) => needsCheckInBooking(moveIn.get(r.id) ?? "", status, today))
    .map(({ r, status }) => ({ id: r.id, full_name: r.full_name ?? "", remind: status === "remind" }));
}

/** Every booked check-in day, by resident - from the appointments, as rescheduled. */
export const listCheckInDays = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const { data } = await (supabase as any)
    .from("appointments")
    .select("resident_id, starts_at, updated_at")
    .eq("type_slug", "check-in")
    .neq("status", "cancelled")
    .not("resident_id", "is", null)
    .order("updated_at", { ascending: false });
  const out: Record<string, string> = {};
  for (const a of (data ?? []) as any[]) {
    if (out[a.resident_id] || !a.starts_at) continue;
    out[a.resident_id] = new Date(a.starts_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
  }
  return out;
});

/** One resident's arrival, for the Pre-check-in checklist. */
export const getResidentCheckIn = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    // the check-in appointment is the record - what admin reschedules is what shows (10 Oct 2026)
    const { checkInFor } = await import("@/lib/checkin.server");
    const c = await checkInFor(supabase, data.id);
    return { status: c.status, on: c.on, slot: c.slot };
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
      /** where they work - asked of somebody employed, where a student is asked
       *  for a university. Editable for the same reason the rest is. */
      company?: string;
      occupation?: string;
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
    if (data.phone !== undefined) patch["phone"] = cleanPhone(data.phone);
    if (data.nationality !== undefined) patch["nationality"] = data.nationality;
    if (data.university !== undefined) patch["university"] = data.university;
    if (data.company !== undefined) patch["company"] = data.company;
    if (data.occupation !== undefined) patch["occupation"] = data.occupation;
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
      data.addons,
    ].some((value) => value !== undefined);

    // The card already priced the assigned room and current add-ons. Do not
    // overwrite its complete snapshot with a second, different calculation.
    if (stayChanged && data.quoteSnapshot === undefined) {
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
          const { bookingAddonNames, selectedBookingAddons } = await import("@/lib/booking-quote");
          const chosen = data.addons ?? bookingAddonNames(current as any);
          const selectedAddons = selectedBookingAddons(property, chosen);
          const quote = moveIn && moveOut && rent
            ? stayQuote(
                property,
                rent,
                term as "long" | "short",
                moveIn,
                moveOut,
                paymentTerm as import("@/data/properties").PaymentTerm,
                selectedAddons,
              )
            : null;

          patch["unit_type"] = room.unit_type;
          patch["room_name"] = room.name;
          patch["term"] = term;
          // the card already priced the stay - the assigned bed's rent, say -
          // so its figures stand; these are only filled when it sent none
          if (data.monthlyRent === undefined) patch["monthly_rent"] = quote?.monthlyAfter ?? rent;
          if (data.firstPayment === undefined) patch["first_payment"] = quote?.totalUpfront ?? 0;
          /*
           * The quote itself is NOT rewritten here. Save on Stay details saves
           * the stay; the quote only changes when admin presses Update quote,
           * which sends it. Rebuilding it on every save meant the quote was
           * never out of date - so "Quote is out of date" never showed, and
           * the quote changed under a student without anybody choosing to.
           */
        }
      }
    }
    /*
     * New dates on a booking that holds a room (Dani, 10 Oct 2026): checked
     * against everyone else on that bed before they are saved. Dates that still
     * fit move the hold with them; dates that clash are refused - the room is
     * never let go of silently. A paid booking's dates move with Update invoice.
     */
    if (data.moveIn !== undefined || data.moveOut !== undefined) {
      // a stay ends after it starts - refused here too, whatever sent it (10 Oct 2026)
      {
        const { data: cur } = await supabase.from("enquiries").select("move_in, move_out").eq("id", data.id).maybeSingle();
        const inn = String((data.moveIn !== undefined ? data.moveIn : (cur as any)?.move_in) ?? "").slice(0, 10);
        const out = String((data.moveOut !== undefined ? data.moveOut : (cur as any)?.move_out) ?? "").slice(0, 10);
        if (inn && out && out <= inn) throw new Error("Move out must be after move in.");
      }
      const { data: h } = await (supabase as any)
        .from("placement_holds")
        .select("id, bed_id, start_date, end_date")
        .eq("enquiry_id", data.id)
        .maybeSingle();
      if (h) {
        const { data: cur } = await supabase.from("enquiries").select("move_in, move_out, gender").eq("id", data.id).maybeSingle();
        const start = (patch["move_in"] as string | null | undefined) !== undefined ? (patch["move_in"] as string | null) : ((cur as any)?.move_in ?? null);
        const end = (patch["move_out"] as string | null | undefined) !== undefined ? (patch["move_out"] as string | null) : ((cur as any)?.move_out ?? null);
        const { data: clash, error: cErr } = await (supabase as any).rpc("placement_conflict", {
          p_bed: h.bed_id,
          p_enquiry: data.id,
          p_resident: null,
          p_start: start,
          p_end: end,
          p_gender: String((patch["gender"] as string) ?? (cur as any)?.gender ?? ""),
          p_whole: false,
        });
        if (cErr) throw new Error(cErr.message);
        if (clash) throw new Error(`These dates clash with the reserved room: ${clash} Choose other dates, or change the room first.`);
        await (supabase as any).from("placement_holds").update({ start_date: start, end_date: end }).eq("id", h.id);
      }
    }
    const { error } = await supabase.from("enquiries").update(patch as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    // a changed quote becomes the next revision of the one the student asked
    // for - recorded here, where Update quote's new quote lands. A plain save
    // of the stay no longer changes the quote, so it records nothing
    if (patch["quote_snapshot"]) {
      const { data: saved } = await supabase
        .from("enquiries")
        .select("reference")
        .eq("id", data.id)
        .maybeSingle();
      const { recordQuoteVersion } = await import("@/lib/document-versions.functions");
      await recordQuoteVersion(
        supabase,
        data.id,
        String((saved as any)?.reference ?? ""),
        patch["quote_snapshot"],
      );
    }
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
        | "invoice_requested"
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
      case "invoice_requested":
        patch["status"] = "invoice_requested";
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
    const values: Record<string, unknown> = { ...data.values, updated_at: new Date().toISOString() };
    // a staff member taking it confirms it; nobody taking it puts it back to pending
    if (typeof values["status"] === "string" && typeof values["assigned_staff"] === "string") {
      const { statusWithStaff } = await import("@/lib/appointment-status");
      values["status"] = statusWithStaff(values["status"], values["assigned_staff"]);
    }
    /*
     * A check-in marked Completed is the resident arriving: their bed goes
     * Booked -> Active first, and the appointment is only completed if it can -
     * not while the previous resident is still the bed's (8 Oct 2026).
     */
    if (data.id && values["status"] === "completed") {
      const { data: appt } = await supabase.from("appointments").select("type_slug, resident_id, status").eq("id", data.id).maybeSingle();
      const { CHECKIN_TYPE } = await import("@/lib/checkin");
      if (appt?.type_slug === CHECKIN_TYPE && appt.resident_id && appt.status !== "completed") {
        const { activateAtCheckIn } = await import("@/lib/homes.functions");
        const res = await activateAtCheckIn(supabase, String(appt.resident_id));
        if (!res.ok) throw new Error(res.error);
      }
    }
    const q = data.id
      ? supabase.from("appointments").update(values as any).eq("id", data.id)
      : supabase.from("appointments").insert(values as any);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Admin has opened a new appointment, so it is no longer new: "pending" if
 * nobody is taking it yet, "confirmed" if somebody already is. Only a "new"
 * one is moved - if somebody changed it in the meantime, their answer stands.
 */
export const markAppointmentSeen = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { statusWhenOpened } = await import("@/lib/appointment-status");
    const { data: row } = await supabase
      .from("appointments")
      .select("assigned_staff")
      .eq("id", data.id)
      .maybeSingle();
    const next = statusWhenOpened("new", String((row as any)?.assigned_staff ?? ""));
    const { error } = await supabase
      .from("appointments")
      .update({ status: next, updated_at: new Date().toISOString() } as any)
      .eq("id", data.id)
      .eq("status", "new");
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
    // rooms of this type nobody is in take its twin / single (11 Oct 2026)
    const { syncRoomShapes } = await import("@/lib/homes.functions");
    await syncRoomShapes(supabase);
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
      .select("enquiry_id, starts_at, status")
      .eq("id", data.appointmentId)
      .maybeSingle();
    const enquiryId = ((appt as any)?.enquiry_id ?? null) as string | null;
    // the booking's own staff member records it, whoever is taking the viewing
    const staff = enquiryId ? await staffFor(supabase, enquiryId) : "";

    const { statusWithStaff } = await import("@/lib/appointment-status");
    const { error } = await supabase
      .from("appointments")
      .update({
        assigned_staff: staffName,
        // somebody is taking it now, so it is confirmed
        status: statusWithStaff(String((appt as any)?.status ?? ""), staffName),
        updated_at: new Date().toISOString(),
      } as any)
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

/** amount is the price of one; the line is worth quantity x amount. */
export type InvoiceLine = { label: string; kind: string; amount: number; quantity?: number };

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
      /*
       * Cancelled, so the booking can generate again - but the invoice it once
       * had still happened, and its history is the record of what the student
       * was asked for. The card keeps a way in to it rather than going blank as
       * though nothing was ever raised.
       */
      const { data: voided } = await supabase
        .from("invoices")
        .select("id, number")
        .eq("enquiry_id", data.enquiryId)
        .eq("status", "void")
        .order("created_at", { ascending: false })
        .limit(1);
      return {
        invoice: null,
        voided: ((voided ?? []) as any[])[0] ?? null,
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
      .select("id, reference, full_name, email, phone, status, close_reason, created_at")
      .eq("duplicate_of", data.enquiryId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    /*
     * Closed against this one, or only thought to be a repeat of it.
     *
     * Both are stored the same way, and this list called all of them closed -
     * so a booking still being worked on appeared under "Closed against this
     * booking" while its own page offered to close it. The page needs to tell
     * them apart, so the answer says which is which rather than leaving it to
     * be guessed from a status.
     */
    return ((rows ?? []) as any[]).map((r) => ({
      ...r,
      closedAsDuplicate: r.status === "closed" && r.close_reason === "Duplicate",
    }));
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
 *
 * It also takes down the guess the website made when the enquiry arrived. That
 * guess lives in duplicate_of and the dismissal lived here, and nothing joined
 * them - so a pair dismissed on the list lost its chip and the booking's own
 * page carried on naming the other one. Staff said it once and had to say it
 * again somewhere else.
 *
 * A booking CLOSED as a duplicate keeps its link whatever is dismissed here:
 * that is a decision somebody made, not a guess, and it is undone by reopening
 * the booking rather than by tidying a chip off a list.
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

    // whichever of the two points at the other, unless a person put it there
    const enquiries = supabase.from("enquiries") as any;
    const { data: linked } = await enquiries
      .select("id, status, close_reason, duplicate_of")
      .in("id", [a_id, b_id]);
    for (const row of ((linked ?? []) as any[]).filter(
      (r) =>
        (r.id === a_id ? r.duplicate_of === b_id : r.duplicate_of === a_id) &&
        !(r.status === "closed" && r.close_reason === "Duplicate"),
    )) {
      const { error: clearError } = await enquiries
        .update({ duplicate_of: null, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      // the pair is recorded either way - the chip is gone, which is what was asked
      if (clearError) console.warn(`dismiss duplicate: ${clearError.message}`);
    }
    return { ok: true as const };
  });

/** Persist the same calculation the editor and PDF display. */
function nextPaymentValues(values: Record<string, unknown>, items: InvoiceLine[]) {
  const next = nextRentalPayment({
    tenancyStart: String(values["tenancy_start"] ?? ""),
    tenancyEnd: String(values["tenancy_end"] ?? ""),
    monthlyRent: Number(values["monthly_rent"] ?? 0),
    frequency: String(values["payment_frequency"] ?? ""),
    items,
  });
  return { next_payment_date: next?.due ?? null, next_payment_amount: next?.amount ?? null };
}

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
    // a room held for it - its unpaid hold (10 Oct 2026)
    const { data: held } = await (supabase as any)
      .from("placement_holds")
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
    const total = lines.reduce((n, l) => n + Number(l.amount || 0) * lineQty(l.quantity), 0);
    const deposits = lines
      .filter((l) => l.kind === "refundable")
      .reduce((n, l) => n + Number(l.amount || 0) * lineQty(l.quantity), 0);

    const { data: inv, error } = await supabase
      .from("invoices")
      .insert({
        ...data.values,
        ...nextPaymentValues(data.values, lines),
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
        quantity: lineQty(l.quantity),
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
    const beforeInvoice = [
      "open",
      "room_reserved",
      "viewing_scheduled",
      "invoice_requested",
    ].includes(String((enqNow as any)?.status ?? ""));
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

    // the invoice as raised - the original every later edit is a revision of
    {
      const { recordInvoiceVersion } = await import("@/lib/document-versions.functions");
      await recordInvoiceVersion(supabase, invoiceId);
    }

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
type InvoiceRewrite = {
  invoiceId: string;
  values: Record<string, unknown>;
  items: InvoiceLine[];
  invoiceDate?: string | undefined;
  paymentTerms?: string | undefined;
};

/**
 * Change an invoice's lines and details, keeping the old one as a version.
 *
 * Shared by editing an invoice and by Update quote on a booking, so both are
 * held to the same rules - refused once more than the booking fee is paid,
 * never below what has been paid - and both leave the same history.
 */
async function rewriteInvoice(
  supabase: any,
  data: InvoiceRewrite,
  /**
   * Change Room Before Tenancy Start only (Dani, 9 Oct 2026): an initial
   * invoice not yet fully paid may be revised whatever has been paid on it,
   * even below it - the caller turns the excess into account credit.
   */
  opts: { roomChange?: boolean } = {},
) {
  const { data: inv } = await supabase
    .from("invoices")
    .select("id, number, enquiry_id, status, invoice_type")
    .eq("id", data.invoiceId)
    .maybeSingle();
  if (!inv || (inv as any).status === "void") throw new Error("Invoice not found");
  // the same tolerance the fee is tested with everywhere else, so one booking
  // is never over the fee here and under it there
  const paidSoFar = await paidTotalOnInvoice(supabase, data.invoiceId);
  if (!opts.roomChange && paidSoFar > BOOKING_FEE + 0.005) {
    throw new Error(
      `More than the ${asRM(BOOKING_FEE)} booking fee has been paid on this invoice, so it can no longer be changed`,
    );
  }
  if (
    !opts.roomChange &&
    paidSoFar > 0 &&
    data.items.reduce((n, l) => n + Number(l.amount || 0) * lineQty(l.quantity), 0) + 0.005 <
      paidSoFar
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

  const newTotal = lines.reduce((n, l) => n + Number(l.amount || 0) * lineQty(l.quantity), 0);
  const { error } = await supabase
    .from("invoices")
    .update({
      ...data.values,
      // a room change keeps the payments where they are: the status follows them
      ...(opts.roomChange && paidSoFar > 0
        ? { status: paidSoFar + 0.005 >= newTotal ? "paid" : "part_paid" }
        : {}),
      ...nextPaymentValues(data.values, lines),
      invoice_date: invoiceDate,
      payment_terms: data.paymentTerms || "NET15",
      issued_at: new Date(`${invoiceDate}T00:00:00Z`).toISOString(),
      total: lines.reduce((n, l) => n + Number(l.amount || 0) * lineQty(l.quantity), 0),
      deposits_total: lines
        .filter((l) => l.kind === "refundable")
        .reduce((n, l) => n + Number(l.amount || 0) * lineQty(l.quantity), 0),
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
        quantity: lineQty(l.quantity),
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
  // the edited invoice becomes the next revision of the one raised before it
  {
    const { recordInvoiceVersion } = await import("@/lib/document-versions.functions");
    await recordInvoiceVersion(supabase, data.invoiceId);
  }
  return { id: data.invoiceId, number: String((inv as any).number ?? "") };
}

export const updateInvoice = createServerFn({ method: "POST" })
  .inputValidator((data: InvoiceRewrite) => data)
  .handler(async ({ data }) => rewriteInvoice(await admin(), data));

/**
 * Bring a booking's first invoice into line with its quote, after Update quote.
 *
 * Nothing to do when no invoice has been raised yet - the invoice will be
 * worked out from the stay when it is. Refused, like any edit, once more than
 * the booking fee is paid. The discount already on the invoice is kept: it was
 * given to the student, and changing the stay does not take it away.
 */
export const syncInvoiceWithQuote = createServerFn({ method: "POST" })
  .inputValidator((data: { enquiryId: string }) => data)
  .handler(async ({ data }) => syncInitialInvoice(await admin(), data.enquiryId));

/** the body of syncInvoiceWithQuote - also run by a paid room move */
async function syncInitialInvoice(supabase: any, enquiryId: string) {
    const { firstInvoiceLines } = await import("@/lib/invoice-lines");
    const { bookingAddonNames, selectedBookingAddons } = await import("@/lib/booking-quote");

    const { data: row } = await supabase
      .from("enquiries")
      .select("*")
      .eq("id", enquiryId)
      .maybeSingle();
    if (!row) throw new Error("Booking not found");
    const r = row as any;

    const { data: invs } = await liveInvoices(supabase, "*")
      .eq("enquiry_id", enquiryId)
      .eq("invoice_type", "initial")
      // the first - a later Initial Payment invoice for a room-change difference is not it
      .order("created_at", { ascending: true })
      .limit(1);
    const inv = ((invs ?? []) as any[])[0];
    if (!inv) return { ok: true as const, invoice: null };

    const property = r.quote_snapshot?.property;
    const listRent = Number(r.monthly_rent || r.quote_snapshot?.quote?.monthlyAfter || 0);
    const discount = discountPerMonth(listRent, inv.discount_type, Number(inv.discount_value || 0));
    const rent = listRent - discount;
    const frequency = String(r.payment_term || inv.payment_frequency || "bimonthly");
    const lines = property
      ? firstInvoiceLines({
          property,
          rent,
          addons: selectedBookingAddons(property, bookingAddonNames(r)),
          term: r.term === "short" ? "short" : "long",
          moveIn: r.move_in,
          moveOut: r.move_out,
          frequency: frequency as any,
        })
      : null;
    if (!lines)
      throw new Error("The stay has no rent or dates, so the invoice could not be worked out");

    const saved = await rewriteInvoice(supabase, {
      invoiceId: inv.id,
      items: lines,
      invoiceDate: String(inv.invoice_date ?? "") || undefined,
      paymentTerms: String(inv.payment_terms ?? "") || undefined,
      values: {
        occupancy: r.occupancy ?? inv.occupancy ?? "",
        residence_name: r.residence_name ?? inv.residence_name ?? "",
        tenancy_start: r.move_in ?? null,
        tenancy_end: r.move_out ?? null,
        monthly_rent: rent,
        list_rent: discount > 0 ? listRent : null,
        payment_frequency: frequency,
      },
    });
    // paid already: the resident's tenancy, bed and rent follow the invoice (9 Oct 2026)
    const { syncPaidStay } = await import("@/lib/booking-lifecycle");
    const stay = await syncPaidStay(supabase, enquiryId);
    return { ok: true as const, invoice: saved, stay };
}

/**
 * What the booking's first invoice would come to with another monthly rent,
 * worked out the same way as Update invoice - for a room move's prompt.
 */
async function initialWithRent(supabase: any, enquiryId: string, rentOverride: number) {
  const { firstInvoiceLines } = await import("@/lib/invoice-lines");
  const { bookingAddonNames, selectedBookingAddons } = await import("@/lib/booking-quote");
  const { data: r } = await supabase.from("enquiries").select("*").eq("id", enquiryId).maybeSingle();
  if (!r) throw new Error("Booking not found");
  const { data: invs } = await liveInvoices(supabase, "*")
    .eq("enquiry_id", enquiryId)
    .eq("invoice_type", "initial")
    // the first one - a later Initial Payment invoice for a difference is not it
    .order("created_at", { ascending: true })
    .limit(1);
  const inv = ((invs ?? []) as any[])[0];
  if (!inv) return null;
  const listRent = Number(r.monthly_rent || r.quote_snapshot?.quote?.monthlyAfter || 0);
  const discount = discountPerMonth(rentOverride, inv.discount_type, Number(inv.discount_value || 0));
  const property = r.quote_snapshot?.property;
  const lines = property
    ? firstInvoiceLines({
        property,
        rent: rentOverride - discount,
        addons: selectedBookingAddons(property, bookingAddonNames(r)),
        term: r.term === "short" ? "short" : "long",
        moveIn: r.move_in,
        moveOut: r.move_out,
        frequency: String(r.payment_term || inv.payment_frequency || "bimonthly") as any,
      })
    : null;
  const newTotal = lines ? lines.reduce((n: number, l: any) => n + lineQty(l.qty ?? l.quantity) * Number(l.amount || 0), 0) : Number(inv.total || 0);
  const paid = await paidTotalOnInvoice(supabase, inv.id);
  return {
    lines: (lines ?? []) as { label: string; kind: string; amount: number; quantity?: number }[],
    invoiceNumber: String(inv.number ?? ""),
    oldRent: listRent,
    oldTotal: Number(inv.total || 0),
    newTotal: Math.round(newTotal * 100) / 100,
    paid,
    // past the booking fee the invoice is closed (rewriteInvoice), so it stays as paid
    canRewrite: paid <= BOOKING_FEE + 0.005,
  };
}

/**
 * Change Room Before Tenancy Start (Dani, 9 Oct 2026). What the change will do
 * to the money, worked out without writing anything - the review step shows it.
 */
export async function roomChangePlan(supabase: any, enquiryId: string, newRent: number) {
  const { planRoomChangeMoney, beforeTenancyStart, lineDifferences } = await import("@/lib/room-change");
  const { klToday } = await import("@/lib/kl-date");
  const { data: r } = await supabase.from("enquiries").select("*").eq("id", enquiryId).maybeSingle();
  if (!r) throw new Error("Booking not found");
  const { data: t } = await supabase.from("tenancies").select("id, resident_id, start_date, end_date").eq("enquiry_id", enquiryId).maybeSingle();
  const { data: living } = t
    ? await supabase.from("beds").select("id").eq("resident_id", t.resident_id).in("status", ["active", "notice"]).limit(1)
    : { data: [] };
  const start = String(t?.start_date || r.move_in || "");
  const allowed = beforeTenancyStart(start, !!(living ?? []).length, klToday());

  /*
   * The whole initial payment for this stay (10 Oct 2026): the move-in invoice
   * and every room-change difference invoice raised since. Comparing the new
   * room with the first invoice alone missed a difference already paid - an
   * upgrade then a downgrade gave no credit back.
   */
  const { data: invs } = await liveInvoices(supabase, "*")
    .eq("enquiry_id", enquiryId)
    .eq("invoice_type", "initial")
    .order("created_at", { ascending: true });
  const all = (invs ?? []) as any[];
  const inv = all[0] ?? null;
  const others = all.slice(1);
  const ids = all.map((i) => String(i.id));
  const [{ data: itemRows }, { data: payRows }] = ids.length
    ? await Promise.all([
        supabase.from("invoice_items").select("invoice_id, label, kind, amount, quantity").in("invoice_id", ids).order("sort_order"),
        supabase.from("payments").select("invoice_id, amount").in("invoice_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const paidOn = (id: string) =>
    ((payRows ?? []) as any[]).filter((p) => p.invoice_id === id).reduce((n, p) => n + Number(p.amount || 0), 0);
  const linesOf = (id: string) => ((itemRows ?? []) as any[]).filter((l) => l.invoice_id === id);
  // a difference invoice nobody has paid priced a room they are no longer moving to: it goes
  const dropping = others.filter((o) => paidOn(String(o.id)) <= 0.005);
  const kept = all.filter((i) => !dropping.includes(i));
  const paid = kept.reduce((n, i) => n + paidOn(String(i.id)), 0);
  const charged = kept.reduce((n, i) => n + Number(i.total || 0), 0);
  const priced = inv ? await initialWithRent(supabase, enquiryId, newRent) : null;
  // an invoice whose stay cannot be priced again is never treated as "now RM0"
  if (inv && !priced?.lines.length) {
    throw new Error("The stay has no saved quote, rent or dates, so the new room cannot be priced. Update the quote first.");
  }
  const money = planRoomChangeMoney({
    invoice: inv ? { total: charged, lines: kept.flatMap((i) => linesOf(String(i.id))) } : null,
    paid,
    newLines: priced?.lines ?? [],
  });
  // revising: the move-in invoice carries what the kept difference invoices do not
  const otherKept = kept.filter((i) => i !== inv);
  const firstInvoiceLines = otherKept.length
    ? (() => {
        const d = lineDifferences(otherKept.flatMap((i) => linesOf(String(i.id))), priced?.lines ?? []);
        return d.every((x) => x.difference > 0)
          ? d.map((x) => ({ label: x.label.replace(/ - difference$/, ""), kind: x.kind, amount: x.difference, quantity: 1 }))
          : [{ label: "Initial payment", kind: "rent", amount: Math.max(0, (priced?.lines ?? []).reduce((n, l) => n + l.amount, 0) - otherKept.reduce((n, i) => n + Number(i.total || 0), 0)), quantity: 1 }];
      })()
    : (priced?.lines ?? []);
  // the TA: none yet, a pack nothing has happened to (made again), or one already signed (kept)
  let ta: "none" | "draft" | "signed" = "none";
  if (t?.resident_id) {
    const { data: ags } = await supabase.from("tenancy_agreements").select("id").eq("resident_id", t.resident_id).order("created_at", { ascending: false }).limit(1);
    const ag = ((ags ?? []) as any[])[0];
    if (ag) {
      const { RESETTABLE } = await import("@/lib/tenancy-docs.functions");
      const { data: docs } = await supabase.from("agreement_documents").select("status").eq("agreement_id", ag.id);
      ta = ((docs ?? []) as any[]).every((d) => RESETTABLE.has(d.status)) ? "draft" : "signed";
    }
  }
  return {
    ta,
    allowed,
    start,
    end: String(t?.end_date || r.move_out || ""),
    oldRent: Number(r.monthly_rent || 0),
    newRent,
    invoice: inv ? { id: String(inv.id), number: String(inv.number ?? ""), total: charged, paid } : null,
    dropping: dropping.map((d) => ({ id: String(d.id), number: String(d.number ?? "") })),
    firstInvoiceLines,
    newLines: priced?.lines ?? [],
    money,
    tenancyId: t?.id ? String(t.id) : null,
    residentId: t?.resident_id ? String(t.resident_id) : null,
  };
}

export const previewRoomChange = createServerFn({ method: "GET" })
  .inputValidator((data: { enquiryId: string; newRent: number }) => data)
  .handler(async ({ data }) => {
    const plan = await roomChangePlan(await admin(), data.enquiryId, Number(data.newRent || 0));
    const { newLines: _lines, tenancyId: _t, residentId: _r, firstInvoiceLines: _f, ...shown } = plan;
    void _lines;
    void _f;
    void _t;
    void _r;
    return shown;
  });

/**
 * Confirm a room change before the tenancy starts, in this order:
 *   1. the room - one locked step in the database (same booking, resident,
 *      tenancy, payments and receipts; nothing released first)
 *   2. the booking's room and rent, which price everything after
 *   3. the initial payment, by the rules in room-change.ts - never voided
 *   4. the tenancy's rent schedule, once paid
 *   5. the TA: a pack nothing has happened to is reset, to be made again for
 *      the new room; anything signed is left alone and the Tenancy tab asks
 *   6. the audit line on the booking's trail
 */
export const changeRoomBeforeStart = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      enquiryId: string;
      bedId: string;
      newRent: number;
      roomCode?: string;
      roomName?: string;
      unitType?: string;
      residenceSlug?: string;
      residenceName?: string;
      occupancy?: string;
      /** a twin room nobody is in, let whole as one single */
      whole?: boolean;
      approvedBy: string;
      reason: string;
      note?: string;
      fromLabel: string;
      toLabel: string;
    }) => data,
  )
  .handler(async ({ data }) => applyRoomChange(await admin(), data));

export type RoomChangeInput = {
  enquiryId: string;
  bedId: string;
  newRent: number;
  roomCode?: string;
  roomName?: string;
  unitType?: string;
  residenceSlug?: string;
  residenceName?: string;
  occupancy?: string;
  whole?: boolean;
  approvedBy: string;
  reason: string;
  note?: string;
  fromLabel: string;
  toLabel: string;
};

/** changeRoomBeforeStart's body - handed the service-role client, so the database tests can run it too */
export async function applyRoomChange(supabase: any, data: RoomChangeInput) {
  {
    const { STAFF } = await import("@/data/form-options");
    const { ROOM_CHANGE_REASONS } = await import("@/lib/room-change");
    if (!STAFF.includes(String(data.approvedBy ?? ""))) throw new Error("Choose who approved the change.");
    if (!(ROOM_CHANGE_REASONS as readonly string[]).includes(data.reason)) throw new Error("Choose the reason.");
    if (data.reason === "Other" && String(data.note ?? "").trim().length < 3) throw new Error("Say what the other reason is.");

    const plan = await roomChangePlan(supabase, data.enquiryId, Number(data.newRent || 0));
    if (!plan.allowed) throw new Error("The tenancy has started. Use Update Tenancy on the resident's page.");

    // 1. the room
    const { data: placed, error } = await (supabase as any).rpc("place_stay", {
      p_enquiry: data.enquiryId,
      p_resident: null,
      p_bed: data.bedId,
      p_whole: !!data.whole,
      p_hold_until: null,
    });
    if (error) throw new Error(error.message);
    if (!(placed as any)?.ok) {
      return { ok: false as const, error: String((placed as any)?.error ?? "The room could not be reserved."), detail: String((placed as any)?.detail ?? "") };
    }

    // 2. the booking's room and rent
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.roomCode) patch["room_code"] = data.roomCode;
    if (data.roomName) patch["room_name"] = data.roomName;
    if (data.unitType) patch["unit_type"] = data.unitType;
    if (data.residenceSlug) patch["residence_slug"] = data.residenceSlug;
    if (data.residenceName) patch["residence_name"] = data.residenceName;
    if (data.occupancy) patch["occupancy"] = data.occupancy;
    if (data.newRent > 0) patch["monthly_rent"] = data.newRent;
    await supabase.from("enquiries").update(patch as any).eq("id", data.enquiryId);

    // 3. the initial payment - a difference invoice never paid goes first: it priced a room
    //    they are no longer moving to (marked void, kept as a record)
    for (const d of plan.dropping) {
      await supabase.from("invoices").update({ status: "void", updated_at: new Date().toISOString() } as any).eq("id", d.id);
    }
    const m = plan.money;
    const out: { invoice?: string; version?: number; ipNumber?: string; ipAmount?: number; credit?: number; outstanding?: number } = {};
    // the invoice's Room line names the unit and room - "Unit A-10-11 · Room C" - the
    // same as when the invoice is raised, never the room type (10 Oct 2026)
    // plain lookups: a nested select that fails comes back empty, not as an error
    const { data: tb } = await (supabase as any).from("beds").select("room_id").eq("id", data.bedId).maybeSingle();
    const { data: tr } = tb ? await (supabase as any).from("rooms").select("letter, unit_id").eq("id", tb.room_id).maybeSingle() : { data: null };
    const { data: tu } = tr ? await (supabase as any).from("units").select("unit_no").eq("id", tr.unit_id).maybeSingle() : { data: null };
    const placeName = tu?.unit_no ? `Unit ${tu.unit_no} · Room ${tr.letter}` : data.roomName;
    const roomValues = {
      ...(placeName ? { room_name: placeName } : {}),
      ...(data.occupancy ? { occupancy: data.occupancy } : {}),
      ...(data.residenceName ? { residence_name: data.residenceName } : {}),
    };
    if (plan.invoice && (m.kind === "same" || m.kind === "revise")) {
      const { data: inv } = await supabase.from("invoices").select("*").eq("id", plan.invoice.id).maybeSingle();
      await rewriteInvoice(
        supabase,
        {
          invoiceId: plan.invoice.id,
          // same price: the same lines, with the new room's details
          items: m.kind === "same"
            ? (((await supabase.from("invoice_items").select("label, kind, amount, quantity").eq("invoice_id", plan.invoice.id).order("sort_order")).data ?? []) as any[])
            : (plan.firstInvoiceLines as any[]),
          invoiceDate: String(inv?.invoice_date ?? "") || undefined,
          paymentTerms: String(inv?.payment_terms ?? "") || undefined,
          values: {
            ...roomValues,
            tenancy_start: inv?.tenancy_start ?? null,
            tenancy_end: inv?.tenancy_end ?? null,
            monthly_rent: m.kind === "same" ? inv?.monthly_rent : data.newRent,
            payment_frequency: inv?.payment_frequency ?? null,
          },
        },
        { roomChange: true },
      );
      const { data: v } = await supabase
        .from("invoice_versions")
        .select("version")
        .eq("root_invoice_id", plan.invoice.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      out.invoice = plan.invoice.number;
      const version = Number((v as any)?.version ?? 0);
      if (version) out.version = version;
      out.outstanding = m.outstanding;
      if (m.kind === "revise" && m.credit > 0.005 && plan.residentId) {
        const { addCredit } = await import("@/lib/account-credit.server");
        await addCredit(supabase, plan.residentId, [
          { amount: m.credit, reason: `Paid above the revised ${plan.invoice.number} - room change ${data.toLabel}`, kind: "rent" },
        ]);
        out.credit = m.credit;
      }
    } else if (plan.invoice && m.kind === "ip" && plan.residentId && plan.tenancyId) {
      const { raiseIp } = await import("@/lib/tenancy-events.server");
      const { klToday } = await import("@/lib/kl-date");
      const ip = await raiseIp(supabase, plan.residentId, plan.tenancyId, m.lines.map((l) => ({ label: l.label, amount: l.amount, kind: l.kind })), {
        billOn: klToday(),
        note: `Initial payment difference - room change ${data.fromLabel} to ${data.toLabel}`,
        tenancyEnd: plan.end,
        rent: data.newRent,
        roomName: data.roomName ?? "",
        occupancy: data.occupancy ?? "",
      });
      await supabase.from("invoices").update({ enquiry_id: data.enquiryId }).eq("id", ip.id);
      out.ipNumber = ip.number;
      out.ipAmount = m.difference;
    } else if (plan.invoice && m.kind === "credit" && plan.residentId) {
      const { addCredit } = await import("@/lib/account-credit.server");
      const { depositLabel } = await import("@/lib/tenancy-change");
      await addCredit(
        supabase,
        plan.residentId,
        m.parts.map((p) =>
          p.deposit
            ? { amount: p.amount, kind: "deposit" as const, depositKey: p.deposit, depositLabel: depositLabel(p.deposit), reason: `${depositLabel(p.deposit)} reduced - room change ${data.toLabel}` }
            : { amount: p.amount, kind: "rent" as const, reason: `Cheaper room - room change ${data.toLabel}` },
        ),
      );
      out.credit = m.difference;
    }

    // credit given: used at once on anything already owed - the oldest first (10 Oct 2026)
    if (out.credit && plan.residentId) {
      const { applyAccountCredit } = await import("@/lib/account-credit.server");
      await applyAccountCredit(supabase, plan.residentId);
    }

    // 4. the tenancy's rent schedule, at the new rent
    if (plan.tenancyId) {
      const { syncPaidStay } = await import("@/lib/booking-lifecycle");
      await syncPaidStay(supabase, data.enquiryId, data.newRent > 0 ? data.newRent : undefined);
    }

    // 5. the TA
    let ta: "none" | "reset" | "kept" = "none";
    if (plan.residentId) {
      const { data: ags } = await supabase.from("tenancy_agreements").select("id").eq("resident_id", plan.residentId).order("created_at", { ascending: false }).limit(1);
      const ag = ((ags ?? []) as any[])[0];
      if (ag) {
        const { resetDocumentPack } = await import("@/lib/tenancy-docs.functions");
        try {
          await resetDocumentPack(supabase, ag.id);
          ta = "reset";
        } catch {
          ta = "kept";
        }
      }
    }

    // 6. the audit line
    const { syncBookingStage } = await import("@/lib/booking-lifecycle");
    await syncBookingStage(supabase, data.enquiryId);
    const priceWord = Math.abs(plan.oldRent - data.newRent) <= 0.005 ? "price unchanged" : data.newRent > plan.oldRent ? "price increased" : "price decreased";
    const money = [
      out.invoice ? `${out.invoice}${out.version ? ` v${out.version}` : ""}` : "",
      out.ipNumber ? `IP ${out.ipNumber} for the difference` : "",
      out.credit ? `RM${out.credit.toFixed(2)} to account credit` : "",
    ].filter(Boolean).join(" · ");
    await logBookingEvent(supabase, {
      enquiryId: data.enquiryId,
      staff: data.approvedBy,
      kind: "room_reserved",
      summary:
        `Room changed ${data.fromLabel} → ${data.toLabel} · ${plan.start} – ${plan.end} · ${priceWord}` +
        (money ? ` · ${money}` : "") +
        (ta === "reset" ? " · TA reset to be made again" : ta === "kept" ? " · signed TA kept" : "") +
        ` · approved by ${data.approvedBy}: ${data.reason}${data.note ? ` - ${data.note.trim()}` : ""}`,
    });
    return { ok: true as const, kind: m.kind, ...out, ta };
  }
}

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
      /** the staff member recording it - shown as "by Syazwani" */
      recordedBy?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = await admin();
    {
      const { STAFF } = await import("@/data/form-options");
      if (!STAFF.includes(String(data.recordedBy ?? ""))) throw new Error("Choose who is recording this payment");
    }
    // read together - each read is a round trip to the database (13 Oct 2026)
    const [{ data: invoice, error }, existing] = await Promise.all([
      supabase.from("invoices").select("*").eq("id", data.invoiceId).maybeSingle(),
      supabase.from("payments").select("amount").eq("invoice_id", data.invoiceId),
    ]);
    if (error) throw new Error(error.message);
    if (!invoice) throw new Error("Invoice not found");
    if ((invoice as any).status === "void") {
      throw new Error("This invoice was cancelled");
    }
    // an Update Tenancy IP can be paid before its billing day (agreed 7 Oct 2026); rent cannot
    const inAdvance = (invoice as any).status === "scheduled";
    if (inAdvance && (invoice as any).invoice_type !== "initial") {
      throw new Error("This invoice is not billed yet");
    }
    // the same rule the form shows: what this way of paying needs (1 Oct 2026)
    {
      const { paymentMissing } = await import("@/lib/payment-methods");
      const missing = paymentMissing({ method: data.method ?? "", reference: data.reference ?? "", proofPath: data.proofPath ?? "" });
      if (missing) throw new Error(missing);
    }

    // money on a booking's invoice is recorded by the booking's staff member
    const payStaff = (invoice as any).enquiry_id
      ? await staffFor(supabase, (invoice as any).enquiry_id)
      : "";

    const paidBefore = (existing.data ?? []).reduce((n: number, p: any) => n + Number(p.amount || 0), 0);
    const amount = Number(data.amount || 0);
    const balance = Number((invoice as any).total || 0) - paidBefore - amount;

    const row: Record<string, unknown> = {
      invoice_id: data.invoiceId,
      enquiry_id: (invoice as any).enquiry_id,
      resident_id: (invoice as any).resident_id ?? "",
      amount,
      paid_on: data.paidOn,
      method: data.method,
      reference: data.reference ?? "",
      proof_path: data.proofPath ?? "",
      description: data.description ?? "",
      recorded_by: data.recordedBy ?? "",
    };
    let { data: payment, error: payErr } = await supabase.from("payments").insert(row as any).select("*").maybeSingle();
    // the recorded_by column comes with the 1 Oct 2026 SQL: until a database
    // has it, the payment is still saved, only without the name
    if (payErr && /recorded_by/.test(payErr.message)) {
      delete row["recorded_by"];
      ({ data: payment, error: payErr } = await supabase.from("payments").insert(row as any).select("*").maybeSingle());
    }
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
    // the log line and the invoice's status do not wait for each other
    const receiptNo = String((receipt as any)?.number ?? "");
    const forWhat = data.description ? ` (${data.description})` : "";
    await Promise.all([
      (invoice as any).enquiry_id
        ? logBookingEvent(supabase, {
            enquiryId: (invoice as any).enquiry_id,
            staff: payStaff,
            kind: "payment_recorded",
            ref: String((payment as any).id),
            summary: `${rm(amount)}${forWhat} received for ${(invoice as any).number} by ${words(data.method)}${receiptNo ? ` · Receipt ${receiptNo}` : ""}`,
          })
        : Promise.resolve(),
      supabase
        .from("invoices")
        .update({
          // paid in advance: it stays scheduled, and is billed on its day already paid
          status: inAdvance ? "scheduled" : balance <= 0 ? "paid" : "part_paid",
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", data.invoiceId),
    ]);

    let tenancyChange: import("@/lib/tenancy-events.server").EventOutcome[] = [];
    // a replacement access card waits for its invoice to be paid (Dani, 2 Oct 2026)
    if (balance <= 0.005) {
      try {
        const { replacementAfterPayment } = await import("@/lib/access-card.functions");
        await replacementAfterPayment(supabase, data.invoiceId);
      } catch (err) {
        console.warn(`access card after payment: ${err instanceof Error ? err.message : String(err)}`);
      }
      // and an Update Tenancy event waits for its IP to be paid - what it did is said to admin (Dani, 7 Oct 2026)
      try {
        const { tenancyChangeAfterPayment } = await import("@/lib/tenancy-change.functions");
        tenancyChange = await tenancyChangeAfterPayment(supabase, data.invoiceId);
      } catch (err) {
        console.warn(`tenancy change after payment: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

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

    return { receipt, balance, residentId, residentCode, residentCreated, tenancyChange };
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

/* ---------------- arrival check-in ---------------- */

export type CheckInContext = {
  resident: { id: string; name: string; code: string } | null;
  residenceName: string;
  place: string;
  tenancy: { start: string; end: string } | null;
  tasks: Record<string, { done: boolean; by: string; at: string }>;
  /** false until the checkin_tasks column exists on this database */
  tasksReady: boolean;
};

/**
 * Everything the check-in window shows about who is arriving and where to.
 * Read fresh each time it opens, because a bed or tenancy can change after the
 * student asked for their slot.
 */
export const getCheckInContext = createServerFn({ method: "GET" })
  .inputValidator((data: { appointmentId: string }) => data)
  .handler(async ({ data }): Promise<CheckInContext> => {
    const supabase = await admin();
    const { heldPlace, placeLabel } = await import("@/lib/held-place");

    // "*" rather than naming the column, so a database that has not had the
    // check-in migration yet still answers - tasksReady then says so
    const { data: appt, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const a = (appt ?? {}) as any;
    const tasksReady = Object.prototype.hasOwnProperty.call(a, "checkin_tasks");

    let resident: CheckInContext["resident"] = null;
    let enquiryId = String(a.enquiry_id ?? "");
    let tenancy: CheckInContext["tenancy"] = null;
    const residentId = String(a.resident_id ?? "");
    if (residentId) {
      const { data: r } = await supabase
        .from("residents")
        .select("id, full_name, resident_code, quickbooks_id, enquiry_id")
        .eq("id", residentId)
        .maybeSingle();
      if (r) {
        resident = {
          id: String(r.id),
          name: String(r.full_name ?? ""),
          code: String(r.resident_code || r.quickbooks_id || ""),
        };
        enquiryId = enquiryId || String(r.enquiry_id ?? "");
      }
      const { data: t } = await supabase
        .from("tenancies")
        .select("start_date, end_date")
        .eq("resident_id", residentId)
        .order("start_date", { ascending: false })
        .limit(1);
      const row = ((t ?? []) as any[])[0];
      if (row) tenancy = { start: String(row.start_date ?? ""), end: String(row.end_date ?? "") };
    }

    const place = enquiryId ? await heldPlace(supabase, enquiryId) : null;
    return {
      resident,
      residenceName: String(a.residence_name ?? ""),
      place: place ? placeLabel(place.unitNo, place.roomLetter) : "",
      tenancy,
      tasks: (tasksReady && a.checkin_tasks && typeof a.checkin_tasks === "object"
        ? a.checkin_tasks
        : {}) as CheckInContext["tasks"],
      tasksReady,
    };
  });

/**
 * Tick or untick one check-in task, in the name of the staff member assigned
 * to the appointment - the same rule the booking trail follows: a step with no
 * name against it is a step nobody can answer for.
 */
export const setCheckInTask = createServerFn({ method: "POST" })
  .inputValidator((data: { appointmentId: string; key: string; done: boolean }) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const { CHECKIN_TASKS } = await import("@/lib/checkin-tasks");
    if (!CHECKIN_TASKS.some((t) => t.key === data.key))
      return { ok: false as const, error: "Unknown task." };

    const { data: appt, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    const a = (appt ?? {}) as any;
    if (!Object.prototype.hasOwnProperty.call(a, "checkin_tasks"))
      return {
        ok: false as const,
        error: "The task list needs a database update before it can be saved.",
      };
    const staff = String(a.assigned_staff ?? "").trim();
    if (!staff)
      return { ok: false as const, error: "Assign a staff member and save the appointment first - they are who ticks it." };

    const tasks = {
      ...((a.checkin_tasks ?? {}) as Record<string, { done: boolean; by: string; at: string }>),
    };
    tasks[data.key] = { done: data.done, by: staff, at: new Date().toISOString() };
    const { error: saveError } = await supabase
      .from("appointments")
      .update({ checkin_tasks: tasks, updated_at: new Date().toISOString() } as any)
      .eq("id", data.appointmentId);
    if (saveError) return { ok: false as const, error: saveError.message };
    return { ok: true as const, tasks };
  });
