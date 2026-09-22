import { createServerFn } from "@tanstack/react-start";

import { SCHEDULES } from "@/lib/reference-data";
import type { ScheduleTerms } from "@/lib/rental-schedule";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A resident's current tenancy and its rent terms. See rental-schedule.ts for
 * how periods are worked out, and rent-schedule.server.ts for how they become
 * scheduled invoices.
 *
 * The resident's own fields stay the source of truth - payment schedule on the
 * profile, rent and dates on the stay. Saved terms are a snapshot kept for
 * financial history; they never write back to them.
 */

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type TenancyTerms = { id: string; start: string; end: string };

export type SavedSchedule = ScheduleTerms & { confirmedAt: string };

/** What the initial invoice paid ahead: its advance rent, and the monthly rent it was priced at. */
export type AdvanceRent = { amount: number; rent: number };

export type ResidentRent = {
  tenancy: TenancyTerms | null;
  schedule: SavedSchedule | null;
  advance: AdvanceRent;
};

const day = (v: unknown) => String(v ?? "").slice(0, 10);

// every schedule that repeats - full term is paid once, so it has no cycle
const RENT_FREQUENCIES = new Set(SCHEDULES.filter((s) => s.months > 0).map((s) => s.value));

/**
 * The latest tenancy - a renewal is the newest - and its terms. A tenancy
 * without terms has them set up here when everything they need is known, and its
 * rent listed; otherwise the schedule stays empty and the tab asks for setup.
 */
export const getResidentRent = createServerFn({ method: "GET" })
  .inputValidator((data: { residentId: string }) => data)
  .handler(async ({ data }): Promise<ResidentRent> => {
    const supabase = await admin();
    const none = { amount: 0, rent: 0 };
    const { data: t, error } = await supabase
      .from("tenancies")
      .select("id, resident_id, enquiry_id, start_date, end_date")
      .eq("resident_id", data.residentId)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!t) return { tenancy: null, schedule: null, advance: none };

    const { initialInvoiceFor, prepareTenancyRent, syncScheduledRent } =
      await import("@/lib/rent-schedule.server");
    const readSchedule = () =>
      supabase.from("rental_schedules").select("*").eq("tenancy_id", t.id).maybeSingle();

    const first = await readSchedule();
    if (first.error) throw new Error(first.error.message);
    let s = first.data;
    if (!s) {
      await prepareTenancyRent(supabase, String(t.id));
      ({ data: s } = await readSchedule());
    } else {
      // terms saved before rent was listed ahead: list it once
      const { count } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("tenancy_id", t.id)
        .eq("status", "scheduled");
      if (!count) await syncScheduledRent(supabase, String(t.id));
    }

    const initial = await initialInvoiceFor(supabase, t);
    return {
      tenancy: { id: String(t.id), start: day(t.start_date), end: day(t.end_date) },
      schedule: s
        ? {
            monthlyRent: Number(s.monthly_rent),
            frequency: String(s.frequency),
            firstPeriodStart: day(s.first_period_start),
            firstPeriodEnd: day(s.first_period_end),
            firstDueDate: day(s.first_due_date),
            tenancyEnd: day(s.tenancy_end),
            finalAmount: s.final_amount === null ? null : Number(s.final_amount),
            confirmedAt: String(s.confirmed_at ?? ""),
          }
        : null,
      advance: initial ? { amount: initial.advance, rent: initial.rent } : none,
    };
  });

/**
 * Admin sets or changes the rent terms. A resident with no tenancy yet gets one,
 * from these dates. Saving again replaces the terms and rebuilds the scheduled
 * invoices from them; billed rent is never touched.
 */
export const saveRentalSchedule = createServerFn({ method: "POST" })
  .inputValidator(
    (data: ScheduleTerms & { residentId: string; tenancyId?: string; tenancyStart?: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    const supabase = await admin();
    if (!(Number(data.monthlyRent) > 0)) throw new Error("Enter the monthly rent");
    if (!RENT_FREQUENCIES.has(data.frequency)) {
      throw new Error("Pick the payment schedule");
    }
    if (!data.firstPeriodStart || !data.firstPeriodEnd || !data.firstDueDate || !data.tenancyEnd) {
      throw new Error("Enter the first period, first due date and tenancy end");
    }
    if (data.firstPeriodEnd < data.firstPeriodStart) {
      throw new Error("The first period ends before it starts");
    }
    if (data.tenancyEnd < data.firstPeriodEnd) {
      throw new Error("The tenancy ends before the first period does");
    }

    let tenancyId = data.tenancyId ?? "";
    if (!tenancyId) {
      const { data: made, error } = await supabase
        .from("tenancies")
        .insert({
          resident_id: data.residentId,
          start_date: data.tenancyStart || data.firstPeriodStart,
          end_date: data.tenancyEnd,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      tenancyId = String(made.id);
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("rental_schedules").upsert(
      {
        tenancy_id: tenancyId,
        monthly_rent: data.monthlyRent,
        frequency: data.frequency,
        first_period_start: data.firstPeriodStart,
        first_period_end: data.firstPeriodEnd,
        first_due_date: data.firstDueDate,
        tenancy_end: data.tenancyEnd,
        final_amount: data.finalAmount,
        confirmed_at: now,
        updated_at: now,
      },
      { onConflict: "tenancy_id" },
    );
    if (error) throw new Error(error.message);

    const { syncScheduledRent } = await import("@/lib/rent-schedule.server");
    await syncScheduledRent(supabase, tenancyId);
    return { tenancyId };
  });
