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

/** the service-role client - only after the admin session is checked (adminDb) */
async function admin(): Promise<any> {
  const { adminDb } = await import("@/lib/admin-session.server");
  return adminDb();
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

/** A resident's tenancy as every screen reads it - only ever from the tenancies table. */
export type ServerTenancy = {
  id: string;
  start: string;
  end: string;
  rent: number;
  /** the day they handed the room back, before the checkout settled - empty while they live there */
  movedOut: string;
};

/**
 * Every resident's latest tenancy, from the tenancies table - the ONE place the
 * screens read a tenancy from (13 Oct 2026).
 *
 * The pages used to keep their own browser copy too (Lovable's front-end
 * tenancies, before this table existed). Each time the two disagreed one field
 * was patched to prefer the table - the dates on 4 Oct (end = start), the rent
 * on 13 Oct (RM400 against an invoice of RM850) - and the next field slipped
 * through. The copy is gone; this is the only source.
 *
 * Rent is not a column of tenancies (one fact, one place - see
 * 20260915130000): it is the rent terms' (rental_schedules), and before those
 * exist the rent on the initial invoice they paid - decided here, once.
 */
export const tenancyDatesByResident = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await admin();
  const { allRows: every } = await import("@/lib/all-rows");
  const data = await every(() =>
    supabase
      .from("tenancies")
      // "*": moved_out_on is read when the database has it (20261026100000_moved_out.sql)
      .select("*")
      .order("start_date", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .order("id"),
  );
  // the latest tenancy wins - a renewal is the newest
  const latest = new Map<string, any>();
  for (const t of (data ?? []) as any[]) if (t.resident_id) latest.set(String(t.resident_id), t);

  // two whole reads - an id list of every resident would not fit in the request's address
  // every page - one query stops at 1,000 rows (all-rows.ts)
  const { allRows } = await import("@/lib/all-rows");
  const [rs, inv] = await Promise.all([
    allRows(() => supabase.from("rental_schedules").select("tenancy_id, monthly_rent").order("id")),
    allRows(() =>
      supabase
        .from("invoices")
        .select("enquiry_id, resident_id, monthly_rent, notes, created_at")
        .eq("invoice_type", "initial")
        .neq("status", "void")
        .order("created_at", { ascending: true })
        .order("id"),
    ),
  ]);
  const scheduleRent = new Map<string, number>();
  for (const r of (rs ?? []) as any[]) if (Number(r.monthly_rent) > 0) scheduleRent.set(String(r.tenancy_id), Number(r.monthly_rent));
  // the newest initial invoice wins, found as initialInvoiceFor finds it: by the booking, or - a
  // tenancy with no booking (every migrated resident) - by the resident. Keyed by booking only,
  // all 181 migrated residents fell through to the bed's list price (Dani, 22 Oct 2026:
  // RM1,050 for an agreed RM1,200). A later IP difference invoice holds no move-in rent.
  const { IP_DIFFERENCE_NOTE } = await import("@/lib/invoice-category");
  const byEnquiry = new Map<string, number>();
  const byResident = new Map<string, number>();
  for (const r of (inv ?? []) as any[]) {
    if (!(Number(r.monthly_rent) > 0) || String(r.notes ?? "").startsWith(IP_DIFFERENCE_NOTE)) continue;
    if (r.enquiry_id) byEnquiry.set(String(r.enquiry_id), Number(r.monthly_rent));
    if (r.resident_id) byResident.set(String(r.resident_id), Number(r.monthly_rent));
  }

  const out: Record<string, ServerTenancy> = {};
  for (const [residentId, t] of latest) {
    const invoiceRent = t.enquiry_id ? byEnquiry.get(String(t.enquiry_id)) : byResident.get(residentId);
    const rent = scheduleRent.get(String(t.id)) || invoiceRent || 0;
    out[residentId] = { id: String(t.id), start: day(t.start_date), end: day(t.end_date), rent, movedOut: day(t.moved_out_on) };
  }
  return out;
});

/**
 * "Create tenancy" for a resident who has none (not made from a paid booking):
 * a real row in the tenancies table, so the document pack, rent and Update
 * Tenancy all point at the same record. Its rent is set as its rent terms on
 * the Payments tab. Refused if they already have one.
 */
export const createTenancyRecord = createServerFn({ method: "POST" })
  .inputValidator((data: { residentId: string; start: string; end: string }) => data)
  .handler(async ({ data }) => {
    if (!data.residentId) throw new Error("No resident.");
    if (!data.start || !data.end) throw new Error("Enter the move-in and move-out dates on the profile first.");
    if (data.end < data.start) throw new Error("The tenancy ends before it starts.");
    const supabase = await admin();
    const { data: existing } = await supabase.from("tenancies").select("id").eq("resident_id", data.residentId).limit(1);
    if ((existing ?? []).length) return { id: String(existing[0].id), created: false as const };
    const { data: made, error } = await supabase
      .from("tenancies")
      .insert({
        resident_id: data.residentId,
        start_date: data.start,
        end_date: data.end,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: String(made.id), created: true as const };
  });
