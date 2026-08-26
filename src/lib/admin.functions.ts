import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Every query below runs as the signed-in user, so row-level rules decide access. */

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) return { isAdmin: false as const };

    const nowISO = new Date().toISOString();
    const [enq, appt, upcoming] = await Promise.all([
      supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
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
      isAdmin: true as const,
      newEnquiries: enq.count ?? 0,
      pendingAppointments: appt.count ?? 0,
      upcoming: upcoming.data ?? [],
    };
  });

export const listEnquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("enquiries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateEnquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; status?: string; adminNotes?: string }) => data)
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.status) patch["status"] = data.status;
    if (data.adminNotes !== undefined) patch["admin_notes"] = data.adminNotes;
    const { error } = await context.supabase.from("enquiries").update(patch as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [appts, types, rules, blocked] = await Promise.all([
      context.supabase.from("appointments").select("*").order("starts_at", { ascending: true }),
      context.supabase.from("appointment_types").select("*").order("sort_order"),
      context.supabase.from("availability_rules").select("*").order("weekday"),
      context.supabase.from("blocked_dates").select("*").order("blocked_on"),
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
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id?: string; values: Record<string, unknown> }) => data)
  .handler(async ({ data, context }) => {
    const values = { ...data.values, updated_at: new Date().toISOString() };
    const q = data.id
      ? context.supabase.from("appointments").update(values as any).eq("id", data.id)
      : context.supabase.from("appointments").insert(values as any);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("appointments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveAvailabilityRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id?: string; values: Record<string, unknown> }) => data)
  .handler(async ({ data, context }) => {
    const q = data.id
      ? context.supabase.from("availability_rules").update(data.values as any).eq("id", data.id)
      : context.supabase.from("availability_rules").insert(data.values as any);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAvailabilityRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("availability_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveBlockedDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { blockedOn: string; reason?: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("blocked_dates")
      .insert({ blocked_on: data.blockedOn, reason: data.reason ?? "" } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBlockedDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("blocked_dates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveAppointmentType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id?: string; values: Record<string, unknown> }) => data)
  .handler(async ({ data, context }) => {
    const q = data.id
      ? context.supabase.from("appointment_types").update(data.values as any).eq("id", data.id)
      : context.supabase.from("appointment_types").insert(data.values as any);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Residences ---------------- */

export const listResidences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [res, rooms] = await Promise.all([
      context.supabase.from("residences").select("*").order("sort_order"),
      context.supabase.from("room_types").select("*").order("sort_order"),
    ]);
    if (res.error) throw new Error(res.error.message);
    return { residences: res.data ?? [], rooms: rooms.data ?? [] };
  });

export const saveResidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id?: string; values: Record<string, unknown> }) => data)
  .handler(async ({ data, context }) => {
    const q = data.id
      ? context.supabase.from("residences").update(data.values as any).eq("id", data.id).select("id")
      : context.supabase.from("residences").insert(data.values as any).select("id");
    const { data: row, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as any)?.id as string | undefined };
  });

export const deleteResidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("residences").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveRoomType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id?: string; values: Record<string, unknown> }) => data)
  .handler(async ({ data, context }) => {
    const q = data.id
      ? context.supabase.from("room_types").update(data.values as any).eq("id", data.id)
      : context.supabase.from("room_types").insert(data.values as any);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRoomType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("room_types").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
