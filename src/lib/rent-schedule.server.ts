import { billDueInvoices, liveInvoices } from "@/lib/invoices";
import {
  billOnFor,
  daysBetween,
  buildPeriods,
  dueFor,
  firstRentPeriod,
  splitAtSteps,
  type RentStep,
  type ScheduleTerms,
} from "@/lib/rental-schedule";
import { SCHEDULES } from "@/lib/reference-data";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A tenancy's rent, made into invoices ahead of time.
 *
 * Once a tenancy has its rent terms, every rent invoice to its end exists as a
 * scheduled invoice - listed, not owed - and each is billed on its own day
 * (see bill_due_invoices in the migration). Rent starts after the advance rent
 * the student paid on the initial invoice.
 *
 * Server only - each is handed the service-role client by a server function.
 */

const day = (v: unknown) => String(v ?? "").slice(0, 10);

const label = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

// every schedule that repeats - full term is paid once, so it has no cycle
const RENT_FREQUENCIES = new Set(SCHEDULES.filter((s) => s.months > 0).map((s) => s.value));

type Tenancy = {
  id: string;
  resident_id: string;
  enquiry_id: string | null;
  start_date: string | null;
  end_date: string | null;
};

/**
 * The initial invoice as it stands now - an edited or reissued one is the latest
 * - and the advance rent on it: every line typed "Advance rent", pro-rated days
 * and whole months alike.
 */
export async function initialInvoiceFor(supabase: any, tenancy: Tenancy) {
  // the move-in invoice - not a difference invoiced later by Update Tenancy, which holds no advance rent
  // (an invoice with no notes at all is kept - "not like" alone would drop it)
  const query = liveInvoices(supabase)
    .eq("invoice_type", "initial")
    .or('notes.is.null,notes.not.like."Initial payment difference*"');
  const { data: invoice } = await (
    tenancy.enquiry_id
      ? query.eq("enquiry_id", tenancy.enquiry_id)
      : query.eq("resident_id", tenancy.resident_id)
  )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!invoice) return null;
  const { data: items } = await supabase
    .from("invoice_items")
    .select("kind, amount, quantity")
    .eq("invoice_id", invoice.id);
  const advance = ((items ?? []) as any[])
    .filter((i) => i.kind === "advance")
    .reduce((n, i) => n + Number(i.amount || 0) * Number(i.quantity ?? 1), 0);
  return { invoice, advance, rent: Number(invoice.monthly_rent || 0) };
}

/**
 * The tenancy's rent changes, each from its own day (Dani, 6 Oct 2026; more
 * than one since 7 Oct - a room change on 11 Nov, then a renewal on 1 Dec).
 * Kept beside the resident's documents so nothing new is needed on either
 * database. The rent terms hold the last rent; these say from which day each
 * rent applies. `moveTo` is the bed a later move goes to.
 */
export const rentStepPath = (residentId: string, tenancyId: string) => `tenancy-change/${residentId}/rent-step-${tenancyId}.json`;

export type MoveTo = { bedId: string; roomId: string; unitId: string; occupancy: string; from?: string };
export type RentSteps = { steps: RentStep[]; moveTo?: MoveTo };

export async function readRentSteps(supabase: any, residentId: string, tenancyId: string): Promise<RentSteps> {
  const { data } = await supabase.storage.from("resident-documents").download(rentStepPath(residentId, tenancyId), { cacheNonce: Date.now() });
  if (!data) return { steps: [] };
  try {
    const raw = JSON.parse(await data.text());
    // the file before 7 Oct 2026 held one step, with the move beside it
    if (Array.isArray(raw?.steps)) return raw as RentSteps;
    const { moveTo, ...step } = raw ?? {};
    return { steps: step?.from ? [step as RentStep] : [], ...(moveTo ? { moveTo: { ...moveTo, from: step.from } } : {}) };
  } catch {
    return { steps: [] };
  }
}

export async function writeRentSteps(supabase: any, residentId: string, tenancyId: string, value: RentSteps) {
  const { error } = await supabase.storage
    .from("resident-documents")
    .upload(rentStepPath(residentId, tenancyId), new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }), {
      upsert: true,
      contentType: "application/json",
    });
  if (error) throw new Error(`Could not save the rent change: ${error.message}`);
}

/** the rent on a day, by the changes - `base` before the first */
export function rentOn(steps: RentStep[], day: string, base: number) {
  const s = [...steps].sort((a, b) => a.from.localeCompare(b.from)).filter((x) => x.from <= day).at(-1);
  return s ? s.newRent : (steps.length ? [...steps].sort((a, b) => a.from.localeCompare(b.from))[0]!.oldRent : base);
}

async function tenancyById(supabase: any, tenancyId: string): Promise<Tenancy | null> {
  const { data, error } = await supabase
    .from("tenancies")
    .select("id, resident_id, enquiry_id, start_date, end_date")
    .eq("id", tenancyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/**
 * Set up a tenancy's rent terms by itself, from what is already known: the rent
 * and payment schedule the initial invoice was raised with (the resident's own
 * payment schedule when the invoice has none) and the tenancy's dates. When any
 * of them is missing nothing is saved, and the Payments tab says setup is needed.
 * Returns whether the tenancy has terms.
 */
export async function ensureRentSchedule(supabase: any, tenancyId: string) {
  const { data: saved } = await supabase
    .from("rental_schedules")
    .select("id")
    .eq("tenancy_id", tenancyId)
    .maybeSingle();
  if (saved) return true;

  const tenancy = await tenancyById(supabase, tenancyId);
  if (!tenancy) return false;
  const [initial, { data: resident }] = await Promise.all([
    initialInvoiceFor(supabase, tenancy),
    supabase.from("residents").select("pay_schedule").eq("id", tenancy.resident_id).maybeSingle(),
  ]);

  const rent = initial?.rent ?? 0;
  const invoiceFrequency = String(initial?.invoice.payment_frequency ?? "");
  const frequency = RENT_FREQUENCIES.has(invoiceFrequency)
    ? invoiceFrequency
    : String((resident as any)?.pay_schedule ?? "");
  const start = day(tenancy.start_date);
  const end = day(tenancy.end_date);
  if (!(rent > 0) || !RENT_FREQUENCIES.has(frequency) || !start || !end) return false;

  const first = firstRentPeriod(start, end, frequency, initial?.advance ?? 0, rent);
  if (!first.start) return false;

  const { error } = await supabase.from("rental_schedules").insert({
    tenancy_id: tenancyId,
    monthly_rent: rent,
    frequency,
    first_period_start: first.start,
    first_period_end: first.end,
    // New bookings are due on the 5th of the first uncovered month.
    first_due_date: dueFor(first.start),
    tenancy_end: end,
    final_amount: null,
  });
  // saved at the same moment by another request - theirs stands
  if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
  return true;
}

/**
 * Make the tenancy's rent invoices match its terms.
 *
 * Invoices already billed never change, and the schedule picks up the day after
 * the last one. Scheduled invoices the schedule made are rebuilt; one admin has
 * edited is kept as admin left it, and its period is not made again.
 */
export async function syncScheduledRent(supabase: any, tenancyId: string) {
  // anything whose day has come is billed first, so it is kept rather than rebuilt
  await billDueInvoices(supabase);

  const [tenancy, { data: s, error: sErr }] = await Promise.all([
    tenancyById(supabase, tenancyId),
    supabase.from("rental_schedules").select("*").eq("tenancy_id", tenancyId).maybeSingle(),
  ]);
  if (sErr) throw new Error(sErr.message);
  if (!tenancy || !s) return;

  const { data: rows, error } = await supabase
    .from("invoices")
    .select("id, status, auto_scheduled, period_start, period_end, notes")
    .eq("tenancy_id", tenancyId)
    .eq("invoice_type", "rental")
    .neq("status", "void");
  if (error) throw new Error(error.message);
  const all = (rows ?? []) as any[];
  const billed = all.filter((r) => r.status !== "scheduled");
  const kept = all.filter((r) => r.status === "scheduled" && !r.auto_scheduled);
  const stale = all.filter((r) => r.status === "scheduled" && r.auto_scheduled);

  if (stale.length) {
    const { error: dropErr } = await supabase
      .from("invoices")
      .delete()
      .in(
        "id",
        stale.map((r) => r.id),
      )
      .eq("status", "scheduled");
    if (dropErr) throw new Error(dropErr.message);
  }

  const initial = await initialInvoiceFor(supabase, tenancy);
  const coverage = firstRentPeriod(
    day(tenancy.start_date),
    day(s.tenancy_end),
    String(s.frequency),
    initial?.advance ?? 0,
    Number(s.monthly_rent),
  );
  const terms: ScheduleTerms = {
    firstPeriodCredit: coverage.start === day(s.first_period_start) ? coverage.credit : 0,
    monthlyRent: Number(s.monthly_rent),
    frequency: String(s.frequency),
    firstPeriodStart: day(s.first_period_start),
    firstPeriodEnd: day(s.first_period_end),
    firstDueDate: day(s.first_due_date),
    tenancyEnd: day(s.tenancy_end),
    finalAmount: s.final_amount === null ? null : Number(s.final_amount),
  };
  const lastBilledEnd =
    billed
      .map((r) => day(r.period_end))
      .filter(Boolean)
      .sort()
      .at(-1) ?? "";
  const keptStarts = new Set(kept.map((r) => day(r.period_start)));
  const periods = buildPeriods(terms, lastBilledEnd).filter((p) => !keptStarts.has(p.start));
  if (!periods.length) return;

  // who and where, as the initial invoice and the resident's record have them
  const { data: resident } = await supabase
    .from("residents")
    .select("full_name, email, mobile, university, nationality")
    .eq("id", tenancy.resident_id)
    .maybeSingle();
  const inv = (initial?.invoice ?? {}) as any;
  const person = (resident ?? {}) as any;
  // the discount carries on while the rent is the one the initial invoice gave it
  const discounted =
    Number(inv.discount_value) > 0 && Number(inv.monthly_rent) === terms.monthlyRent;

  /*
   * The rent changes on their own days: a period holding one is split there,
   * each part at its own rent (Dani, 6 Oct 2026; several since 7 Oct). A
   * cheaper room in a period already billed is account credit now; a step
   * saved before 7 Oct still carries its credit, taken off the next invoice once.
   */
  const { steps } = await readRentSteps(supabase, tenancy.resident_id, tenancyId);
  const room = (r: number) => `RM ${r.toLocaleString("en-MY", { maximumFractionDigits: 2 })} a month`;
  const legacy = steps.find((x) => x.credit && !billed.some((r) => String(r.notes ?? "").includes(x.id)));
  let credit = legacy?.credit ?? 0;
  const made = periods.map((p) => {
    const lines: { label: string; amount: number }[] = [];
    let amount = p.amount;
    let notes = "";
    const split = splitAtSteps(p, steps, terms.monthlyRent);
    if (split) {
      amount = split.amount;
      for (const x of split.segments) lines.push({ label: `Rent ${label(x.start)} – ${label(x.end)} · ${x.label} (${room(x.rent)})`, amount: x.amount });
    } else {
      lines.push({ label: `Rent ${label(p.start)} – ${label(p.end)}${p.prorated !== null ? " (pro-rated)" : ""}`, amount: p.amount });
    }
    if (credit > 0 && legacy) {
      const off = Math.min(credit, amount);
      lines.push({ label: `Room change credit - cheaper room from ${label(legacy.from)}`, amount: -off });
      amount = Math.round((amount - off) * 100) / 100;
      credit = 0;
      notes = `Room change credit ${legacy.id}`;
    }
    return { id: crypto.randomUUID(), period: { ...p, amount }, lines, notes };
  });
  const { error: insErr } = await supabase.from("invoices").insert(
    made.map(({ id, period: p, notes }) => ({
      id,
      // a placeholder: the invoice number is given when it is billed
      number: `SCH-${id}`,
      status: "scheduled",
      auto_scheduled: true,
      invoice_type: "rental",
      resident_id: tenancy.resident_id,
      tenancy_id: tenancyId,
      full_name: person.full_name || inv.full_name || "",
      email: person.email || inv.email || "",
      phone: person.mobile || inv.phone || "",
      university: person.university || inv.university || "",
      nationality: person.nationality || inv.nationality || "",
      residence_name: inv.residence_name ?? "",
      room_name: inv.room_name ?? "",
      occupancy: inv.occupancy ?? "",
      tenancy_start: tenancy.start_date,
      tenancy_end: terms.tenancyEnd,
      monthly_rent: terms.monthlyRent,
      payment_frequency: terms.frequency,
      ...(discounted
        ? {
            list_rent: inv.list_rent,
            discount_type: inv.discount_type,
            discount_value: inv.discount_value,
          }
        : {}),
      bill_on: billOnFor(p.start),
      invoice_date: billOnFor(p.start),
      issued_at: new Date(`${billOnFor(p.start)}T00:00:00Z`).toISOString(),
      // The invoice arrives before the period starts and is due the 5th of the
      // month after it ends, so its terms run from the billing day to that day.
      // There is no due_date column: the due date IS the invoice date plus these
      // days, which is how dueDateOf and the PDF both read it back.
      payment_terms: `NET${daysBetween(billOnFor(p.start), p.due)}`,
      period_start: p.start,
      period_end: p.end,
      total: p.amount,
      deposits_total: 0,
      notes,
    })),
  );
  if (insErr) throw new Error(insErr.message);

  const { error: itemErr } = await supabase.from("invoice_items").insert(
    made.flatMap(({ id, lines }) =>
      lines.map((l, i) => ({
        invoice_id: id,
        label: l.label,
        kind: "rent",
        amount: l.amount,
        sort_order: i,
      })),
    ),
  );
  if (itemErr) throw new Error(itemErr.message);

  // a period whose billing day has already passed is billed straight away
  await billDueInvoices(supabase);
}

/** Set a tenancy's terms up when they can be, then list its rent. For a tenancy's first read. */
export async function prepareTenancyRent(supabase: any, tenancyId: string) {
  if (await ensureRentSchedule(supabase, tenancyId)) {
    await syncScheduledRent(supabase, tenancyId);
  }
}
