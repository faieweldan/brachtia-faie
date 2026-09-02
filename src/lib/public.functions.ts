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

    const [{ data: residence }, { data: rules }, { data: blocked }] = await Promise.all([
      supabaseAdmin.from("residences").select("id").eq("slug", data.residenceSlug).maybeSingle(),
      supabaseAdmin.from("availability_rules").select("*").eq("weekday", weekday).eq("active", true),
      supabaseAdmin.from("blocked_dates").select("*").eq("blocked_on", data.date),
    ]);

    const residenceId = (residence?.id as string | undefined) ?? null;

    const dayBlocked = (blocked ?? []).some(
      (b) => b.residence_id === null || b.residence_id === residenceId,
    );
    if (dayBlocked) return { slots: [] as string[] };

    const applicable = (rules ?? []).filter(
      (r) =>
        (r.residence_id === null || r.residence_id === residenceId) &&
        (r.mode === "any" || r.mode === data.mode),
    );

    const dayStart = new Date(`${data.date}T00:00:00+08:00`).toISOString();
    const dayEnd = new Date(`${data.date}T23:59:59+08:00`).toISOString();
    const { data: booked } = await supabaseAdmin
      .from("appointments")
      .select("starts_at,status")
      .gte("starts_at", dayStart)
      .lte("starts_at", dayEnd)
      .neq("status", "cancelled");

    return {
      slots: buildSlots(data.date, applicable, (booked ?? []).map((b) => b.starts_at as string)),
    };
  });

const appointmentSchema = z.object({
  mode: z.enum(["in_person", "virtual"]),
  residenceSlug: z.string().max(120),
  residenceName: z.string().max(160).default(""),
  startsAt: z.string().min(10).max(40),
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(5).max(30),
  university: z.string().trim().max(160).default(""),
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

    const { error } = await supabaseAdmin.from("appointments").insert({
      type_slug: data.mode === "virtual" ? "viewing-virtual" : "viewing-in-person",
      residence_id: (residence?.id as string | undefined) ?? null,
      residence_slug: data.residenceSlug,
      residence_name: (residence?.name as string | undefined) ?? data.residenceName,
      mode: data.mode,
      starts_at: data.startsAt,
      duration_minutes: 30,
      status: "pending",
      full_name: data.fullName,
      email: data.email,
      phone: data.phone,
      university: data.university,
      notes: data.notes,
    });

    if (error) {
      console.error("appointment insert failed", error);
      return { ok: false as const };
    }
    return { ok: true as const };
  });
