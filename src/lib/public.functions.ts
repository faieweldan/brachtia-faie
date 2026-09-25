import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const enquirySchema = z.object({
  residenceSlug: z.string().max(120).default(""),
  residenceName: z.string().max(160).default(""),
  roomCode: z.string().max(120).default(""),
  roomName: z.string().max(200).default(""),
  unitType: z.string().max(120).default(""),
  occupancy: z.string().max(20).default("single"),
  moveIn: z.string().max(20).default(""),
  moveOut: z.string().max(20).default(""),
  term: z.string().max(20).default("long"),
  paymentTerm: z.string().max(20).default("bimonthly"),
  monthlyRent: z.number().nonnegative().max(1_000_000).default(0),
  firstPayment: z.number().nonnegative().max(10_000_000).default(0),
  addons: z.array(z.string().max(120)).max(20).default([]),
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(5).max(30),
  nationality: z.string().trim().max(80).default(""),
  // student or employed - a working applicant is never asked for a university
  currentStatus: z.string().trim().max(40).default(""),
  // where they work. Company is empty for somebody self-employed or freelancing,
  // who has no organisation to name; the job title is asked of them either way
  company: z.string().trim().max(120).default(""),
  occupation: z.string().trim().max(120).default(""),
  university: z.string().trim().max(160).default(""),
  intake: z.string().trim().max(40).default(""),
  gender: z.string().trim().max(40).default(""),
  message: z.string().trim().max(1000).default(""),
  heardAbout: z.string().trim().max(120).default(""),
  heardAboutOther: z.string().trim().max(200).default(""),
  quoteSnapshot: z.unknown().optional(),
  /*
   * One key per submission attempt, made by the browser. A double-click, a
   * retried request or a refreshed tab sends the same key, and the unique index
   * on it means the second insert cannot make a second row - the guard is in
   * the database, not in a disabled button, because a button cannot stop a
   * retry that never reached the browser.
   */
  idempotencyKey: z.string().trim().max(64).default(""),
  /** they saw the warning and chose to send it anyway */
  acceptedDuplicate: z.boolean().default(false),
});

/**
 * The enquiries from the last fortnight that share this email or phone.
 *
 * Asked of the database by the same rules the pure helpers use, then narrowed
 * by them - so what the warning says and what gets recorded cannot drift.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recentMatches(supabase: any, email: string, phone: string) {
  const { normaliseEmail, normalisePhone, windowStart } = await import("@/lib/enquiry-duplicates");
  const since = windowStart().toISOString();
  const cleanEmail = normaliseEmail(email);
  const cleanPhone = normalisePhone(phone);
  if (!cleanEmail && !cleanPhone) return [];

  const { data, error } = await supabase
    .from("enquiries")
    .select("id, reference, email, phone, created_at, full_name")
    .gte("created_at", since)
    /*
     * Newest first, because the limit decides what is looked at. Taken oldest
     * first, a busy fortnight would fill the 200 with the start of the window
     * and never reach the enquiry sent an hour ago - the repeat most worth
     * catching. Which one a repeat points AT is decided afterwards, by
     * findRepeatOf, which sorts the matches it keeps.
     */
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    // a lookup that fails must never cost the student their enquiry
    console.warn("duplicate lookup failed", error.message);
    return [];
  }
  return (data ?? []) as {
    id: string;
    reference: string;
    email: string;
    phone: string;
    created_at: string;
    full_name: string;
  }[];
}

/**
 * Has this person enquired in the last fortnight? Asked before the form is
 * sent, so the student can be told and decide - never to refuse the submission.
 */
export const checkEnquiryDuplicate = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; phone: string }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { findRepeatOf, DUPLICATE_NOTICE } = await import("@/lib/enquiry-duplicates");
    const rows = await recentMatches(supabaseAdmin, data.email, data.phone);
    const match = findRepeatOf({ email: data.email, phone: data.phone }, rows);
    return match
      ? { duplicate: true as const, notice: DUPLICATE_NOTICE, reference: match.reference ?? "" }
      : { duplicate: false as const, notice: "", reference: "" };
  });

export type EnquiryInput = z.input<typeof enquirySchema>;

export const submitEnquiry = createServerFn({ method: "POST" })
  .inputValidator((data: EnquiryInput) => enquirySchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { findRepeatOf } = await import("@/lib/enquiry-duplicates");

    /*
     * The generated Supabase types predate current_status, duplicate_of and
     * idempotency_key. The table has all three - see the 2026-09-21 migrations -
     * so the client is loosened here rather than the columns being left out.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enquiries = supabaseAdmin.from("enquiries") as any;

    /*
     * Already sent. The browser retried, or somebody pressed the button twice -
     * either way this exact attempt is on record, so hand back the enquiry it
     * made rather than making a second one.
     */
    if (data.idempotencyKey) {
      const { data: already } = await enquiries
        .select("reference")
        .eq("idempotency_key", data.idempotencyKey)
        .maybeSingle();
      if (already) {
        return { ok: true as const, reference: String(already.reference ?? "") };
      }
    }

    // the one it repeats, if any. It is recorded, never enforced: the row is
    // inserted whatever this finds
    const repeat = findRepeatOf(
      { email: data.email, phone: data.phone },
      await recentMatches(supabaseAdmin, data.email, data.phone),
    );

    const { data: row, error } = await enquiries
      .insert({
        duplicate_of: repeat?.id ?? null,
        idempotency_key: data.idempotencyKey || null,
        residence_slug: data.residenceSlug,
        residence_name: data.residenceName,
        room_code: data.roomCode,
        room_name: data.roomName,
        unit_type: data.unitType,
        occupancy: data.occupancy,
        move_in: data.moveIn || null,
        move_out: data.moveOut || null,
        term: data.term,
        payment_term: data.paymentTerm,
        monthly_rent: data.monthlyRent,
        first_payment: data.firstPayment,
        addons: data.addons,
        full_name: data.fullName,
        email: data.email,
        phone: data.phone,
        nationality: data.nationality,
        current_status: data.currentStatus,
        company: data.company,
        occupation: data.occupation,
        university: data.university,
        intake: data.intake,
        gender: data.gender,
        message: data.message,
        heard_about: data.heardAbout,
        heard_about_other: data.heardAboutOther,
        quote_snapshot: (data.quoteSnapshot ?? {}) as never,
      })
      .select("id, reference")
      .maybeSingle();
    if (error) {
      // the reason travels back to the browser: a failure the student cannot see
      // is a failure nobody fixes
      console.error("enquiry insert failed", error);
      return { ok: false as const, reference: "", error: error.message };
    }
    // the quote they asked for, kept as the original every later one is a
    // revision of - without it, the first admin change would look like the
    // first quote that ever existed
    if (row?.id) {
      const { recordQuoteVersion } = await import("@/lib/document-versions.functions");
      await recordQuoteVersion(
        supabaseAdmin,
        String(row.id),
        String(row.reference ?? ""),
        data.quoteSnapshot ?? {},
      );
    }
    return { ok: true as const, reference: (row?.reference ?? "") as string };
  });

/* ---------------- Viewing / appointment booking ---------------- */

const slotsSchema = z.object({
  residenceSlug: z.string().max(120).default(""),
  mode: z.enum(["in_person", "virtual"]).default("in_person"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type SlotsInput = z.infer<typeof slotsSchema>;

export const fetchDaySlots = createServerFn({ method: "GET" })
  .inputValidator((data: SlotsInput) => slotsSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildSlots } = await import("@/lib/slots");

    const weekday = new Date(`${data.date}T00:00:00`).getDay();

    const [{ data: rules }, { data: blocked }] = await Promise.all([
      supabaseAdmin
        .from("availability_rules")
        .select("*")
        .eq("weekday", weekday)
        .eq("active", true),
      supabaseAdmin.from("blocked_dates").select("*").eq("blocked_on", data.date),
    ]);

    const blockedWindows = (blocked ?? []).map((b) => ({
      start_time: (b as { start_time?: string | null }).start_time ?? null,
      end_time: (b as { end_time?: string | null }).end_time ?? null,
    }));
    // A full-day block clears the date entirely.
    if (blockedWindows.some((b) => !b.start_time || !b.end_time)) return { slots: [] as string[] };

    const typeSlug = data.mode === "virtual" ? "viewing-virtual" : "viewing-in-person";

    const { data: type } = await supabaseAdmin
      .from("appointment_types")
      .select("duration_minutes")
      .eq("slug", typeSlug)
      .maybeSingle();

    const dayStart = new Date(`${data.date}T00:00:00+08:00`).toISOString();
    const dayEnd = new Date(`${data.date}T23:59:59+08:00`).toISOString();
    const { data: booked } = await supabaseAdmin
      .from("appointments")
      .select("starts_at,status")
      .gte("starts_at", dayStart)
      .lte("starts_at", dayEnd)
      .neq("status", "cancelled");

    return {
      slots: buildSlots(
        data.date,
        rules ?? [],
        (booked ?? []).map((b) => b.starts_at as string),
        (type?.duration_minutes as number | undefined) ?? undefined,
        blockedWindows,
      ),
    };
  });

const appointmentSchema = z.object({
  mode: z.enum(["in_person", "virtual"]),
  residenceSlug: z.string().max(120),
  residenceName: z.string().max(160).default(""),
  residenceSlugs: z.array(z.string().max(120)).max(20).default([]),
  residenceNames: z.array(z.string().max(160)).max(20).default([]),
  moveIn: z.string().max(20).default(""),
  moveOut: z.string().max(20).default(""),
  sharingPreference: z.string().trim().max(40).default(""),
  startsAt: z.string().min(10).max(40),
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(5).max(30),
  university: z.string().trim().max(160).default(""),
  nationality: z.string().trim().max(80).default(""),
  intake: z.string().trim().max(40).default(""),
  // studying or working, and where - empty for whichever side was not asked
  currentStatus: z.string().trim().max(40).default(""),
  company: z.string().trim().max(120).default(""),
  occupation: z.string().trim().max(120).default(""),
  gender: z.string().trim().max(40).default(""),
  heardAbout: z.string().trim().max(120).default(""),
  heardAboutOther: z.string().trim().max(200).default(""),
  enquiryStatus: z.string().trim().max(40).default(""),
  notes: z.string().trim().max(1000).default(""),
});

export type AppointmentInput = z.input<typeof appointmentSchema>;

export const bookAppointment = createServerFn({ method: "POST" })
  .inputValidator((data: AppointmentInput) => appointmentSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: residence } = await supabaseAdmin
      .from("residences")
      .select("id,name")
      .eq("slug", data.residenceSlug)
      .maybeSingle();

    const typeSlug = data.mode === "virtual" ? "viewing-virtual" : "viewing-in-person";
    const { data: type } = await supabaseAdmin
      .from("appointment_types")
      .select("duration_minutes")
      .eq("slug", typeSlug)
      .maybeSingle();

    /*
     * The generated types predate current_status, company and occupation - the
     * columns are there, from the 2026-09-22 migration - so the insert is
     * loosened rather than the three answers being dropped on the way in. The
     * same way this file already reaches enquiries.
     */
    const appointments = supabaseAdmin.from("appointments") as any;
    const { error } = await appointments.insert({
      type_slug: typeSlug,
      residence_id: (residence?.id as string | undefined) ?? null,
      residence_slug: data.residenceSlug,
      residence_name: (residence?.name as string | undefined) ?? data.residenceName,
      residence_slugs: data.residenceSlugs,
      residence_names: data.residenceNames,
      move_in: data.moveIn || null,
      move_out: data.moveOut || null,
      sharing_preference: data.sharingPreference,
      mode: data.mode,
      starts_at: data.startsAt,
      duration_minutes: (type?.duration_minutes as number | undefined) ?? 30,
      status: "pending",
      full_name: data.fullName,
      email: data.email,
      phone: data.phone,
      university: data.university,
      nationality: data.nationality,
      intake: data.intake,
      current_status: data.currentStatus,
      company: data.company,
      occupation: data.occupation,
      gender: data.gender,
      heard_about: data.heardAbout,
      heard_about_other: data.heardAboutOther,
      enquiry_status: data.enquiryStatus,
      notes: data.notes,
    });

    if (error) {
      console.error("appointment insert failed", error);
      return { ok: false as const };
    }
    return { ok: true as const };
  });

/* ---------------- Student self-service viewing link ---------------- */

export const getViewingLink = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) =>
    z.object({ token: z.string().min(8).max(64) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("enquiries")
      .select(
        "id,reference,full_name,email,phone,university,nationality,gender,intake,residence_slug,residence_name,room_name,unit_type,occupancy,move_in,move_out,monthly_rent,term",
      )
      .eq("viewing_token", data.token)
      .maybeSingle();
    if (!row) return { ok: false as const };

    /*
     * The unit their bed sits in, once one is held for them. Named rather than
     * implied: "Unit A-07-03 · Room C" is a place, where "Room C" on its own is
     * a description. Empty until a bed is reserved, because inventing one would
     * be worse than saying nothing.
     */
    /*
     * Three plain lookups rather than one nested select. Embedding beds ->
     * rooms -> units asks PostgREST to infer two relationships, and when that
     * inference fails it fails as an empty result - which is exactly what a
     * booking with no bed held looks like, so the page cannot tell the two
     * apart and neither could anybody reading it.
     *
     * A bed still holding a released booking is skipped: changing rooms leaves
     * the old one behind, and the student must be told where they are now.
     */
    let unitNo = "";
    let roomLetter = "";
    const { data: beds, error: bedError } = await supabaseAdmin
      .from("beds")
      .select("room_id, status")
      .eq("enquiry_id", row.id);
    if (bedError) console.warn("unit lookup failed at beds", bedError.message);
    const held =
      ((beds ?? []) as { room_id: string; status: string }[]).find((b) => b.status !== "vacant") ??
      null;
    if (held?.room_id) {
      const { data: theRoom, error: roomError } = await supabaseAdmin
        .from("rooms")
        .select("letter, unit_id")
        .eq("id", held.room_id)
        .maybeSingle();
      if (roomError) console.warn("unit lookup failed at rooms", roomError.message);
      roomLetter = String((theRoom as { letter?: string } | null)?.letter ?? "");
      const unitId = (theRoom as { unit_id?: string } | null)?.unit_id;
      if (unitId) {
        const { data: theUnit, error: unitError } = await supabaseAdmin
          .from("units")
          .select("unit_no")
          .eq("id", unitId)
          .maybeSingle();
        if (unitError) console.warn("unit lookup failed at units", unitError.message);
        unitNo = String((theUnit as { unit_no?: string } | null)?.unit_no ?? "");
      }
    }

    const { data: appt } = await supabaseAdmin
      .from("appointments")
      .select("id,starts_at,duration_minutes,mode,status,residence_name")
      .eq("enquiry_id", row.id)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    return {
      ok: true as const,
      booking: { ...row, unit_no: unitNo, unit_room: roomLetter },
      viewing: appt ?? null,
    };
  });

/**
 * They would rather not view it - take them straight to the booking.
 *
 * A viewing is offered, never required, and a student who has already decided
 * should not have to pick a slot they will not attend just to get past this
 * page. The booking moves to awaiting the fee, which is where confirming a
 * viewing would have left it anyway.
 *
 * Nothing is cancelled here: an appointment already booked is left alone, since
 * skipping is a choice about the next step and not an instruction to undo the
 * last one. Staff see the stage move in Recent Activity.
 */
export const skipViewingFromLink = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) =>
    z.object({ token: z.string().min(8).max(64) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: enquiry } = await supabaseAdmin
      .from("enquiries")
      .select("id, status, assigned_staff")
      .eq("viewing_token", data.token)
      .maybeSingle();
    if (!enquiry) return { ok: false as const };

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("enquiries")
      .update({
        // they asked for an invoice; raising it is what makes this Awaiting payment
        status: "invoice_requested",
        // what they said, kept: without it this student and one who never
        // answered look identical on the booking page
        viewing_skipped_at: now,
        stage_changed_at: now,
        updated_at: now,
      } as never)
      .eq("id", (enquiry as any).id);
    if (error) {
      console.error("skip viewing failed", error);
      return { ok: false as const };
    }

    /*
     * And in the trail, where staff look first.
     *
     * Only when the booking already has an owner: booking_events requires a
     * staff name and a student has none, and inventing one would put a person's
     * name against something they did not do. The summary says who really did
     * it. A booking with nobody assigned still records the skip on the enquiry
     * itself, which is what the Viewing card reads.
     */
    const staff = String((enquiry as any).assigned_staff ?? "").trim();
    if (staff) {
      const { logBookingEvent } = await import("@/lib/booking-events");
      await logBookingEvent(supabaseAdmin, {
        enquiryId: String((enquiry as any).id),
        staff,
        kind: "stage_changed",
        summary: "Student chose to proceed without a viewing",
      });
    }
    return { ok: true as const };
  });

export const confirmViewingFromLink = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; startsAt: string; mode: "in_person" | "virtual" }) =>
    z
      .object({
        token: z.string().min(8).max(64),
        startsAt: z.string().min(10).max(40),
        mode: z.enum(["in_person", "virtual"]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: enquiry } = await supabaseAdmin
      .from("enquiries")
      .select("*")
      .eq("viewing_token", data.token)
      .maybeSingle();
    if (!enquiry) return { ok: false as const };

    const { data: existing } = await supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("enquiry_id", (enquiry as any).id)
      .neq("status", "cancelled")
      .limit(1)
      .maybeSingle();

    const { upsertViewing } = await import("@/lib/viewings.server");
    await upsertViewing({
      enquiry,
      startsAt: data.startsAt,
      mode: data.mode,
      ...(existing ? { appointmentId: (existing as any).id as string } : {}),
    });
    return { ok: true as const };
  });
