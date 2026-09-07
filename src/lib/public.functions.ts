import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const enquirySchema = z.object({
  residenceSlug: z.string().max(120).default(""),
  residenceName: z.string().max(160).default(""),
  roomCode: z.string().max(120).default(""),
  roomName: z.string().max(200).default(""),
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
  university: z.string().trim().max(160).default(""),
  intake: z.string().trim().max(40).default(""),
  gender: z.string().trim().max(40).default(""),
  message: z.string().trim().max(1000).default(""),
  heardAbout: z.string().trim().max(120).default(""),
  heardAboutOther: z.string().trim().max(200).default(""),
  quoteSnapshot: z.unknown().optional(),
});

export type EnquiryInput = z.input<typeof enquirySchema>;

export const submitEnquiry = createServerFn({ method: "POST" })
  .inputValidator((data: EnquiryInput) => enquirySchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("enquiries").insert({
      residence_slug: data.residenceSlug,
      residence_name: data.residenceName,
      room_code: data.roomCode,
      room_name: data.roomName,
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
      university: data.university,
      intake: data.intake,
      gender: data.gender,
      message: data.message,
      heard_about: data.heardAbout,
      heard_about_other: data.heardAboutOther,
      quote_snapshot: (data.quoteSnapshot ?? {}) as never,
    }).select("reference").maybeSingle();
    if (error) {
      console.error("enquiry insert failed", error);
      return { ok: false as const, reference: "" };
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
      supabaseAdmin.from("availability_rules").select("*").eq("weekday", weekday).eq("active", true),
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

    const { error } = await supabaseAdmin.from("appointments").insert({
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
  .inputValidator((data: { token: string }) => z.object({ token: z.string().min(8).max(64) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("enquiries")
      .select(
        "id,reference,full_name,email,phone,university,nationality,gender,intake,residence_slug,residence_name,room_name,occupancy,move_in,move_out",
      )
      .eq("viewing_token", data.token)
      .maybeSingle();
    if (!row) return { ok: false as const };

    const { data: appt } = await supabaseAdmin
      .from("appointments")
      .select("id,starts_at,duration_minutes,mode,status,residence_name")
      .eq("enquiry_id", (row as any).id)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    return { ok: true as const, booking: row, viewing: appt ?? null };
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
