import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { klToday } from "@/lib/kl-date";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Update Tenancy, on the server (Dani, 3 Oct 2026) - the rules are in
 * tenancy-change.ts. On Confirm and proceed:
 *   1. the tenancy's end date and the rent terms change, and the scheduled
 *      rent invoices are made again (billed ones are never touched)
 *   2. a higher initial-payment item is invoiced as an initial-payment
 *      difference - unless admin waives it, which is recorded
 *   3. the documents are made straight away (Dani, 4 Oct 2026 - it was once
 *      they were paid for, 3 Oct)
 * The bed itself moves on the resident card, as before.
 *
 * Kept beside the resident's documents, so nothing runs on either database:
 *   tenancy-change/<resident>/pending.json    the documents waiting for payment
 *   tenancy-change/<resident>/<time>.json     each change, as it was made
 */
const BUCKET = "resident-documents";
/** how the difference invoice is told apart from the move-in invoice */
export const TOP_UP_NOTE = "Initial payment difference";

async function admin(): Promise<any> {
  const { requireAdminSession } = await import("@/lib/admin-session.server");
  await requireAdminSession();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const day = (v: unknown) => String(v ?? "").slice(0, 10);

export type PendingChange = {
  at: string;
  invoiceId?: string;
  invoiceNumber?: string;
  plan: import("@/lib/tenancy-change").DocumentPlan;
  mergeValues: Record<string, string>;
  periodStart: string;
  periodEnd: string;
  tenancyId: string;
};

const pendingPath = (residentId: string) => `tenancy-change/${residentId}/pending.json`;

async function readJson<T>(sb: any, path: string): Promise<T | null> {
  const { data } = await sb.storage.from(BUCKET).download(path, { cacheNonce: Date.now() });
  if (!data) return null;
  try {
    return JSON.parse(await data.text()) as T;
  } catch {
    return null;
  }
}
async function writeJson(sb: any, path: string, value: unknown) {
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
  if (error) throw new Error(`Could not save the change: ${error.message}`);
}

/** What the dialog compares against: the initial payment as invoiced, the rent, the tenancy. */
export const getTenancyChangeBasis = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: t } = await sb
      .from("tenancies")
      .select("id, start_date, end_date")
      .eq("resident_id", data.residentId)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // the move-in invoice and any difference invoiced since - what is held now
    const original = await getBasisMoney(sb, data.residentId);
    // each deposit line, with its invoice - the same table as the checkout statement (Dani, 5 Oct 2026)
    const held = await depositsHeld(sb, data.residentId);
    const { data: s } = t ? await sb.from("rental_schedules").select("monthly_rent").eq("tenancy_id", t.id).maybeSingle() : { data: null };
    return {
      tenancy: t ? { id: String(t.id), start: day(t.start_date), end: day(t.end_date) } : null,
      rent: Number(s?.monthly_rent ?? 0),
      // no rent terms: the scheduled invoices cannot be made again
      hasSchedule: !!s,
      original,
      held,
      pending: await readJson<PendingChange>(sb, pendingPath(data.residentId)),
    };
  });

export const applyTenancyChange = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        residentId: z.string().uuid(),
        tenancyId: z.string().uuid(),
        change: z.object({
          oldUnitId: z.string().max(80),
          newUnitId: z.string().max(80),
          oldRoomId: z.string().max(80),
          newRoomId: z.string().max(80),
          oldOccupancy: z.string().max(20),
          newOccupancy: z.string().max(20),
          oldEnd: z.string().max(10),
          newEnd: z.string().max(10),
        }),
        newRent: z.number().min(0).max(100_000),
        /** the initial-payment items as they are to be */
        next: z.record(z.string(), z.number().min(0).max(1_000_000)),
        /** the items admin waived - each on its own (Dani, 5 Oct 2026) */
        waived: z.array(z.string().max(20)).max(10),
        effectiveDate: z.string().max(10),
        mergeValues: z.record(z.string().max(80), z.string().max(2000)),
        /**
         * Schedule B's charges for the change (Dani, 7 Oct 2026): the RM100 room/unit change fee
         * and the RM20 card after a unit change - filled in, then edited or removed by admin
         */
        charges: z.array(z.object({ label: z.string().min(1).max(160), amount: z.number().min(0).max(100_000) })).max(6).optional(),
        /** the bed they move to, when they move on a later day - held until then (Dani, 6 Oct 2026) */
        moveTo: z
          .object({ bedId: z.string().max(80), roomId: z.string().max(80), unitId: z.string().max(80), occupancy: z.string().max(20) })
          .nullable()
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const { anyChange, changeFlags, compareMoney, documentsFor, topUpLines, topUpTotal } = await import("@/lib/tenancy-change");
    const flags = changeFlags(data.change);
    if (data.change.newEnd < data.change.oldEnd) throw new Error("A shorter tenancy is a checkout - Early termination.");
    // read before anything changes: the rent and the initial payment as they were
    const rentBefore = await currentRent(sb, data.tenancyId);
    const basis = await getBasisMoney(sb, data.residentId);
    const rentChanged = data.newRent > 0 && Math.abs(data.newRent - rentBefore) > 0.005;
    if (!anyChange(flags) && !rentChanged) throw new Error("Nothing has changed.");
    if (await readJson(sb, pendingPath(data.residentId))) throw new Error("An earlier change is still waiting for its payment.");

    /*
     * 0. a room change on a set day (Dani, 6 Oct 2026): the rent changes on the
     *    move date, not for the whole period - the scheduled invoice holding it
     *    is split there. Moved inside a period already billed at the old rent:
     *    dearer, the rest of it is invoiced now; cheaper, it comes off the next
     *    rent invoice.
     */
    let adjustment: { number: string; amount: number } | null = null;
    const moved = flags.room || flags.occupancy;
    // also a later move at the same rent: the bed still waits for its day
    if (moved && data.effectiveDate && (rentChanged || data.moveTo)) {
      const { billedDifference } = await import("@/lib/rental-schedule");
      const { rentStepPath } = await import("@/lib/rent-schedule.server");
      const step: import("@/lib/rental-schedule").RentStep = {
        id: crypto.randomUUID().slice(0, 8),
        from: data.effectiveDate,
        oldRent: rentBefore,
        newRent: data.newRent || rentBefore,
      };
      const { data: billedRows } = await sb
        .from("invoices")
        .select("period_start, period_end")
        .eq("tenancy_id", data.tenancyId)
        .eq("invoice_type", "rental")
        .not("status", "in", "(scheduled,void)")
        .gte("period_end", data.effectiveDate);
      const paidSpans = ((billedRows ?? []) as any[]).map((r) => ({ start: day(r.period_start), end: day(r.period_end) }));
      // the months the advance rent on the initial payment covers are paid at the old rent too
      const { data: terms } = await sb.from("rental_schedules").select("first_period_start").eq("tenancy_id", data.tenancyId).maybeSingle();
      const { data: ten } = await sb.from("tenancies").select("start_date").eq("id", data.tenancyId).maybeSingle();
      const firstRent = day(terms?.first_period_start);
      if (firstRent && day(ten?.start_date) && data.effectiveDate < firstRent) {
        const { shiftDate } = await import("@/lib/rental-schedule");
        paidSpans.push({ start: day(ten?.start_date), end: shiftDate(firstRent, { days: -1 }) });
      }
      const diff = Math.round(paidSpans.reduce((n, p) => n + billedDifference(p, step), 0) * 100) / 100;
      if (diff < 0) step.credit = -diff;
      if (diff > 0) {
        const lastEnd = paidSpans.map((p) => p.end).sort().at(-1) ?? "";
        const inv = await raiseAdjustment(sb, data.residentId, data.tenancyId, {
          label: `Room change adjustment ${fmtDay(data.effectiveDate)} – ${fmtDay(lastEnd)} (RM ${data.newRent.toLocaleString("en-MY")} a month instead of RM ${rentBefore.toLocaleString("en-MY")}, pro-rated by day)`,
          amount: diff,
        });
        adjustment = { number: inv.number, amount: diff };
      }
      await writeJson(sb, rentStepPath(data.residentId, data.tenancyId), { ...step, ...(data.moveTo ? { moveTo: data.moveTo } : {}) });
    }

    // 1. the tenancy and its rent: the scheduled invoices follow
    const end = data.change.newEnd > data.change.oldEnd ? data.change.newEnd : data.change.oldEnd;
    if (end !== data.change.oldEnd) {
      const { error } = await sb.from("tenancies").update({ end_date: end }).eq("id", data.tenancyId);
      if (error) throw new Error(error.message);
    }
    const { data: s } = await sb.from("rental_schedules").select("tenancy_id").eq("tenancy_id", data.tenancyId).maybeSingle();
    if (s) {
      const { error } = await sb
        .from("rental_schedules")
        .update({ tenancy_end: end, ...(data.newRent > 0 ? { monthly_rent: data.newRent } : {}), updated_at: new Date().toISOString() })
        .eq("tenancy_id", data.tenancyId);
      if (error) throw new Error(error.message);
      const { syncScheduledRent } = await import("@/lib/rent-schedule.server");
      await syncScheduledRent(sb, data.tenancyId);
    }

    // 2. the difference on the initial payment
    const rows = compareMoney(basis, { ...basis, ...(data.next as any) }, { original: rentBefore, next: data.newRent || rentBefore });
    // the deposits that went up, then Schedule B's charges admin kept - on one invoice
    const charges = (data.charges ?? []).filter((c) => c.amount > 0).map((c) => ({ label: c.label, amount: Math.round(c.amount * 100) / 100, kind: "onetime" }));
    const lines = [...topUpLines(rows, data.waived), ...charges];
    const due = Math.round((topUpTotal(rows, data.waived) + charges.reduce((n, c) => n + c.amount, 0)) * 100) / 100;
    let invoice: { id: string; number: string } | null = null;
    if (due > 0) invoice = await raiseTopUp(sb, data.residentId, data.tenancyId, lines);

    // 3. the documents - now, or once the difference is paid
    const docs = documentsFor(flags);
    const pending: PendingChange = {
      at: new Date().toISOString(),
      ...(invoice ? { invoiceId: invoice.id, invoiceNumber: invoice.number } : {}),
      plan: docs,
      mergeValues: data.mergeValues,
      periodStart: data.effectiveDate,
      periodEnd: end,
      tenancyId: data.tenancyId,
    };
    await writeJson(sb, `tenancy-change/${data.residentId}/${pending.at.replace(/[:.]/g, "-")}.json`, {
      ...pending,
      flags,
      rows,
      waived: rows.filter((r) => data.waived.includes(r.key) && r.difference > 0).map((r) => ({ item: r.label, amount: r.difference })),
      charges,
      newRent: data.newRent,
    });
    // made now, on Confirm and proceed (Dani, 4 Oct 2026) - the difference invoice is paid alongside
    await makeDocuments(sb, data.residentId, pending);
    return { invoiceNumber: invoice?.number ?? "", adjustment, documents: "made" as const };
  });

/**
 * A move on a later day (Dani, 6 Oct 2026): the bed to move to, once the day
 * comes. The resident page moves it then, the first time it is opened.
 */
// the resident's latest tenancy on the database - the page's own copy has its own ids
async function latestTenancyId(sb: any, residentId: string): Promise<string> {
  const { data } = await sb
    .from("tenancies")
    .select("id")
    .eq("resident_id", residentId)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return String(data?.id ?? "");
}

export const getPendingMove = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const tenancyId = await latestTenancyId(sb, data.residentId);
    if (!tenancyId) return null;
    const { readRentStep } = await import("@/lib/rent-schedule.server");
    const step = (await readRentStep(sb, data.residentId, tenancyId)) as (import("@/lib/rental-schedule").RentStep & { moveTo?: { bedId: string; roomId: string; unitId: string; occupancy: string } }) | null;
    return step?.moveTo ? { from: step.from, moveTo: step.moveTo } : null;
  });

export const clearPendingMove = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const tenancyId = await latestTenancyId(sb, data.residentId);
    const { readRentStep, rentStepPath } = await import("@/lib/rent-schedule.server");
    const step = tenancyId ? ((await readRentStep(sb, data.residentId, tenancyId)) as Record<string, unknown> | null) : null;
    if (step?.["moveTo"]) {
      delete step["moveTo"];
      await writeJson(sb, rentStepPath(data.residentId, tenancyId), step);
    }
    return { ok: true as const };
  });

/** The change waiting for its payment, dropped - the invoice stays for admin to cancel. */
export const cancelPendingChange = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    await sb.storage.from(BUCKET).remove([pendingPath(data.residentId)]);
    return { ok: true as const };
  });

/** From Record payment: the difference is paid in full, so the documents are made. */
export async function tenancyChangeAfterPayment(sb: any, invoiceId: string) {
  const { data: inv } = await sb.from("invoices").select("resident_id").eq("id", invoiceId).maybeSingle();
  const residentId = String(inv?.resident_id ?? "");
  if (!residentId) return;
  const pending = await readJson<PendingChange>(sb, pendingPath(residentId));
  if (!pending || pending.invoiceId !== invoiceId) return;
  await makeDocuments(sb, residentId, pending);
  await sb.storage.from(BUCKET).remove([pendingPath(residentId)]);
}

/* ------------------------------------------------------------------ helpers */

async function currentRent(sb: any, tenancyId: string): Promise<number> {
  const { data } = await sb.from("rental_schedules").select("monthly_rent").eq("tenancy_id", tenancyId).maybeSingle();
  return Number(data?.monthly_rent ?? 0);
}

/** every deposit on the initial-payment invoices: its line, its invoice, what it comes to */
async function depositsHeld(sb: any, residentId: string) {
  const { data: inv } = await sb
    .from("invoices")
    .select("id, number")
    .eq("resident_id", residentId)
    .eq("invoice_type", "initial")
    .neq("status", "void")
    .order("created_at", { ascending: true });
  const invoices = (inv ?? []) as any[];
  if (!invoices.length) return [] as { label: string; amount: number; invoiceNumber: string }[];
  const { data: items } = await sb
    .from("invoice_items")
    .select("invoice_id, label, kind, amount, quantity, sort_order")
    .in("invoice_id", invoices.map((i) => i.id))
    .order("sort_order");
  const number = new Map(invoices.map((i) => [i.id, String(i.number ?? "")]));
  const order = new Map(invoices.map((i, n) => [i.id, n]));
  return ((items ?? []) as any[])
    .filter((i) => i.kind === "refundable" || /deposit/i.test(String(i.label)))
    .sort((a, b) => (order.get(a.invoice_id) ?? 0) - (order.get(b.invoice_id) ?? 0))
    .map((i) => ({
      label: String(i.label),
      amount: Math.round(Number(i.amount || 0) * Number(i.quantity ?? 1) * 100) / 100,
      invoiceNumber: number.get(i.invoice_id) ?? "",
    }));
}

async function getBasisMoney(sb: any, residentId: string) {
  const { data: initial } = await sb.from("invoices").select("id").eq("resident_id", residentId).eq("invoice_type", "initial").neq("status", "void");
  const ids = ((initial ?? []) as any[]).map((i) => i.id);
  const { data: items } = ids.length ? await sb.from("invoice_items").select("label, amount, quantity").in("invoice_id", ids) : { data: [] };
  const { moneyOf } = await import("@/lib/tenancy-change");
  return moneyOf(((items ?? []) as any[]).map((i) => ({ label: String(i.label), amount: Number(i.amount || 0) * Number(i.quantity ?? 1) })));
}

const fmtDay = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

/** the rest of a billed period at the new room's rent - a charge of its own, due in 7 days */
async function raiseAdjustment(sb: any, residentId: string, tenancyId: string, line: { label: string; amount: number }) {
  const { data: first } = await sb
    .from("invoices")
    .select("full_name, email, phone, university, nationality, residence_name, room_name, occupancy, tenancy_start, tenancy_end, monthly_rent, payment_frequency, company, occupation")
    .eq("resident_id", residentId)
    .eq("invoice_type", "initial")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const { data: inv, error } = await sb
    .from("invoices")
    .insert({
      ...(first ?? {}),
      resident_id: residentId,
      tenancy_id: tenancyId,
      invoice_type: "charge",
      invoice_date: klToday(),
      payment_terms: "NET7",
      issued_at: new Date().toISOString(),
      total: line.amount,
      deposits_total: 0,
      notes: "Room change adjustment - tenancy updated",
    })
    .select("id, number")
    .single();
  if (error) throw new Error(error.message);
  const { error: iErr } = await sb.from("invoice_items").insert({ invoice_id: inv.id, label: line.label, kind: "rent", amount: line.amount, quantity: 1, sort_order: 0 });
  if (iErr) throw new Error(iErr.message);
  const { recordInvoiceVersion } = await import("@/lib/document-versions.functions");
  await recordInvoiceVersion(sb, String(inv.id));
  return { id: String(inv.id), number: String(inv.number ?? "") };
}

/** the difference, as an initial-payment invoice of its own - beside the move-in one */
async function raiseTopUp(sb: any, residentId: string, tenancyId: string, lines: { label: string; amount: number; kind: string }[]) {
  const { data: first } = await sb
    .from("invoices")
    .select("full_name, email, phone, university, nationality, residence_name, room_name, occupancy, tenancy_start, tenancy_end, monthly_rent, payment_frequency, company, occupation")
    .eq("resident_id", residentId)
    .eq("invoice_type", "initial")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const total = Math.round(lines.reduce((n, l) => n + l.amount, 0) * 100) / 100;
  const { data: inv, error } = await sb
    .from("invoices")
    .insert({
      ...(first ?? {}),
      resident_id: residentId,
      tenancy_id: tenancyId,
      invoice_type: "initial",
      invoice_date: klToday(),
      payment_terms: "NET7",
      issued_at: new Date().toISOString(),
      total,
      deposits_total: lines.filter((l) => l.kind === "refundable").reduce((n, l) => n + l.amount, 0),
      notes: `${TOP_UP_NOTE} - tenancy updated`,
    })
    .select("id, number")
    .single();
  if (error) throw new Error(error.message);
  const { error: iErr } = await sb
    .from("invoice_items")
    .insert(lines.map((l, i) => ({ invoice_id: inv.id, label: l.label, kind: l.kind, amount: l.amount, quantity: 1, sort_order: i })));
  if (iErr) throw new Error(iErr.message);
  const { recordInvoiceVersion } = await import("@/lib/document-versions.functions");
  await recordInvoiceVersion(sb, String(inv.id));
  return { id: String(inv.id), number: String(inv.number ?? "") };
}

/** each document once: a new agreement, or a revised Schedule A / C; and the access card form */
async function makeDocuments(sb: any, residentId: string, p: PendingChange) {
  const { renewAgreement, reviseSchedule } = await import("@/lib/tenancy-docs.functions");
  if (p.plan.newAgreement) {
    await renewAgreement({
      data: { residentId, tenancyId: p.tenancyId, mergeValues: p.mergeValues, periodStart: p.periodStart, periodEnd: p.periodEnd },
    });
  } else if (p.plan.scheduleA || p.plan.scheduleC) {
    const { data: ag } = await sb
      .from("tenancy_agreements")
      .select("id")
      .eq("resident_id", residentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ag) {
      if (p.plan.scheduleA)
        await reviseSchedule({ data: { agreementId: ag.id, docType: "sched_a", mergeValues: p.mergeValues, periodEnd: p.periodEnd } });
      if (p.plan.scheduleC) await reviseSchedule({ data: { agreementId: ag.id, docType: "sched_c", mergeValues: p.mergeValues } });
    }
  }
  if (p.plan.accessCard) {
    const { makeCardForm } = await import("@/lib/access-card.functions");
    await makeCardForm(sb, residentId, "Unit Change");
  }
}
