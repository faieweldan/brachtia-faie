import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { klToday } from "@/lib/kl-date";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Update Tenancy, on the server - the rules are in tenancy-change.ts, and the
 * agreed answers of 7 Oct 2026 are the reference. On confirm, for each EVENT
 * of the request (a room change on 11 Nov and a renewal on 1 Dec are two):
 *   1. the rent changes from the event's own day, never before it: the
 *      scheduled Rental Payments (RP) are made again, split on that day. An RP
 *      already billed is never changed - a higher rent is an RP adjustment,
 *      a lower one account credit
 *   2. the deposits are compared with what is held: higher, the difference
 *      goes on the event's Initial Payment (IP) with the fixed charges; lower,
 *      the difference becomes account credit, used on the IP first
 *   3. the IP is made at once as a scheduled invoice, billed 14 days before
 *      the event (today, when that has passed). It can be paid in advance
 *   4. the event's documents are made once its IP is settled - paid, covered
 *      by credit, or no IP at all
 * The bed itself moves on the resident card, on the move day.
 *
 * Kept beside the resident's documents, so nothing runs on either database:
 *   tenancy-change/<resident>/pending.json       events waiting for their IP
 *   tenancy-change/<resident>/allowances.json    deposit differences waived
 *   tenancy-change/<resident>/<time>.json        each request, as it was made
 *   tenancy-change/<resident>/rent-step-<t>.json the rent changes (rent-schedule.server)
 */
const BUCKET = "resident-documents";
/** how an Update Tenancy IP is told apart from the move-in invoice */
export const TOP_UP_NOTE = "Initial payment difference";

async function admin(): Promise<any> {
  const { requireAdminSession } = await import("@/lib/admin-session.server");
  await requireAdminSession();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const day = (v: unknown) => String(v ?? "").slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** one event's documents, waiting for its IP to be settled */
export type PendingEvent = {
  eventId: string;
  name: string;
  date: string;
  at: string;
  invoiceId?: string;
  invoiceNumber?: string;
  plan: import("@/lib/tenancy-change").DocumentPlan;
  mergeValues: Record<string, string>;
  periodStart: string;
  periodEnd: string;
  tenancyId: string;
  /** the agreement a revised schedule belongs to, fixed on confirm */
  agreementId?: string;
  /** a renewal earlier in the same request: its new agreement comes first */
  after?: string;
};

const pendingPath = (residentId: string) => `tenancy-change/${residentId}/pending.json`;
const allowancePath = (residentId: string) => `tenancy-change/${residentId}/allowances.json`;

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

/** the events waiting - the file once held a single change (before 7 Oct 2026) */
async function readPending(sb: any, residentId: string): Promise<PendingEvent[]> {
  const raw = await readJson<any>(sb, pendingPath(residentId));
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as PendingEvent[];
  return [{ eventId: "earlier", name: "Earlier change", date: raw.periodStart ?? "", ...raw }];
}
async function writePending(sb: any, residentId: string, list: PendingEvent[]) {
  if (list.length) await writeJson(sb, pendingPath(residentId), list);
  else await sb.storage.from(BUCKET).remove([pendingPath(residentId)]);
}

type Allowance = { key: string; amount: number; eventId: string; at: string };

/**
 * The deposits held now, by deposit: every IP (the move-in one and each since,
 * billed or not), less what became account credit, plus any difference admin
 * waived - the resident is treated as holding it, so it is not asked for again.
 */
async function heldNow(sb: any, residentId: string) {
  const { depositsOf } = await import("@/lib/tenancy-change");
  const { reclassifiedDeposits } = await import("@/lib/account-credit.server");
  const invoiced = await getBasisMoney(sb, residentId);
  const out = depositsOf(invoiced);
  for (const r of await reclassifiedDeposits(sb, residentId)) if (r.depositKey && r.depositKey in out) (out as any)[r.depositKey] = r2((out as any)[r.depositKey] - r.amount);
  for (const a of (await readJson<Allowance[]>(sb, allowancePath(residentId))) ?? []) if (a.key in out) (out as any)[a.key] = r2((out as any)[a.key] + a.amount);
  return out;
}

/** What the dialog starts from: the deposits held, the rent today, the tenancy, the Website rates. */
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
    const { data: s } = t ? await sb.from("rental_schedules").select("monthly_rent").eq("tenancy_id", t.id).maybeSingle() : { data: null };
    const { readRentSteps, rentOn } = await import("@/lib/rent-schedule.server");
    const steps = t ? await readRentSteps(sb, data.residentId, String(t.id)) : { steps: [] };
    const { creditBalance, reclassifiedDeposits } = await import("@/lib/account-credit.server");
    // the Website rates: a renewal is priced at them, and a new room too
    const { data: types } = await sb.from("room_types").select("code, residence_id, unit_type, occupancies, rent");
    return {
      tenancy: t ? { id: String(t.id), start: day(t.start_date), end: day(t.end_date) } : null,
      // the rent in force today, not a later one already agreed
      rent: rentOn(steps.steps, klToday(), Number(s?.monthly_rent ?? 0)),
      // no rent terms: the scheduled invoices cannot be made again
      hasSchedule: !!s,
      held: await heldNow(sb, data.residentId),
      // each deposit line, with its invoice - the same table as the checkout statement (Dani, 5 Oct 2026)
      heldLines: [
        ...(await depositsHeld(sb, data.residentId)),
        ...(await reclassifiedDeposits(sb, data.residentId)).map((r) => ({ label: `${r.depositLabel ?? "Deposit"} - to account credit`, amount: -r.amount, invoiceNumber: "" })),
      ],
      accountCredit: (await creditBalance(sb, data.residentId)).balance,
      pending: await readPending(sb, data.residentId),
      pendingMove: steps.moveTo ?? null,
      roomTypes: ((types ?? []) as any[]).map((r) => ({ code: String(r.code ?? ""), residence_id: r.residence_id ?? undefined, unit_type: r.unit_type ?? undefined, occupancies: r.occupancies ?? undefined, rent: r.rent ?? undefined })),
    };
  });

const depositsSchema = z.object({ security: z.number().min(0).max(1_000_000), utility: z.number().min(0).max(1_000_000), card_deposit: z.number().min(0).max(1_000_000) });

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
        /** the move day - "" when they stay where they are */
        moveOn: z.string().max(10),
        /** the bed they move to, when they move on a later day - held until then (Dani, 6 Oct 2026) */
        moveTo: z
          .object({ bedId: z.string().max(80), roomId: z.string().max(80), unitId: z.string().max(80), occupancy: z.string().max(20) })
          .nullable()
          .optional(),
        /** each event as the dialog priced it - the server checks the plan and works out the money itself */
        events: z
          .array(
            z.object({
              date: z.string().max(10),
              /** the rent from this day */
              rent: z.number().min(0).max(100_000),
              /** the deposits this rent requires */
              required: depositsSchema,
              /** deposit differences admin waived, each on its own (Dani, 5 Oct 2026) */
              waived: z.array(z.string().max(20)).max(5),
              /** Schedule B's fixed charges, as admin kept them (Dani, 7 Oct 2026) */
              charges: z.array(z.object({ label: z.string().min(1).max(160), amount: z.number().min(0).max(100_000) })).max(4),
              mergeValues: z.record(z.string().max(80), z.string().max(2000)),
              periodEnd: z.string().max(10),
              roomName: z.string().max(120),
              occupancy: z.string().max(20),
            }),
          )
          .min(1)
          .max(2),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const T = await import("@/lib/tenancy-change");
    const flags = T.changeFlags(data.change);
    if (data.change.newEnd < data.change.oldEnd) throw new Error("A shorter tenancy is a checkout - Early termination.");
    if (!T.anyChange(flags)) throw new Error("Nothing has changed.");
    const today = klToday();
    if (T.isMove(flags) && (!data.moveOn || data.moveOn < today)) throw new Error("Choose a move date from today on.");
    const finalEnd = data.change.newEnd > data.change.oldEnd ? data.change.newEnd : data.change.oldEnd;
    if (T.isMove(flags) && data.moveOn > finalEnd) throw new Error("The move date is after the tenancy ends.");
    const plan = T.planEvents(flags, data.moveOn, data.change.oldEnd);
    if (plan.length !== data.events.length || plan.some((p, i) => p.date !== data.events[i]!.date)) throw new Error("The change was read differently - close the window and start again.");
    // a change still under way is finished first: cancelling one is not decided yet (7 Oct 2026)
    const waiting = await readPending(sb, data.residentId);
    if (waiting.length) throw new Error(`An earlier change is waiting for ${waiting.map((w) => w.invoiceNumber || w.name).join(", ")} to be settled.`);
    const rs = await import("@/lib/rent-schedule.server");
    const saved = await rs.readRentSteps(sb, data.residentId, data.tenancyId);
    if (saved.moveTo) throw new Error("An earlier move has not happened yet.");

    const { data: sched } = await sb.from("rental_schedules").select("monthly_rent, first_period_start").eq("tenancy_id", data.tenancyId).maybeSingle();
    const { data: ten } = await sb.from("tenancies").select("start_date").eq("id", data.tenancyId).maybeSingle();
    const { data: ag } = await sb.from("tenancy_agreements").select("id").eq("resident_id", data.residentId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { addCredit, applyAccountCredit } = await import("@/lib/account-credit.server");
    const { billedDifference, shiftDate } = await import("@/lib/rental-schedule");

    // the rent periods already billed at the old rent: billed RPs, and the advance months on the move-in invoice
    const { data: billedRows } = await sb
      .from("invoices")
      .select("period_start, period_end")
      .eq("tenancy_id", data.tenancyId)
      .eq("invoice_type", "rental")
      .not("status", "in", "(scheduled,void)")
      .gte("period_end", plan[0]!.date);
    const paidSpans = ((billedRows ?? []) as any[]).map((r) => ({ start: day(r.period_start), end: day(r.period_end) }));
    const firstRent = day(sched?.first_period_start);
    if (firstRent && day(ten?.start_date) && plan[0]!.date < firstRent) paidSpans.push({ start: day(ten?.start_date), end: shiftDate(firstRent, { days: -1 }) });

    const steps = [...saved.steps];
    let rent = rs.rentOn(steps, shiftDate(plan[0]!.date, { days: -1 }), Number(sched?.monthly_rent ?? 0));
    let held = await heldNow(sb, data.residentId);
    const pending: PendingEvent[] = [];
    const results: { name: string; date: string; invoiceNumber: string; billOn: string; total: number; creditApplied: number; adjustment?: string; credit?: number }[] = [];
    const log: unknown[] = [];
    const allowances = (await readJson<Allowance[]>(sb, allowancePath(data.residentId))) ?? [];
    let renewalId = "";

    for (const [i, p] of plan.entries()) {
      const e = data.events[i]!;
      const eventId = crypto.randomUUID().slice(0, 8);
      const name = T.eventName(p.flags);
      const out: (typeof results)[number] = { name, date: p.date, invoiceNumber: "", billOn: "", total: 0, creditApplied: 0 };

      // 1. the rent, from this day - only a real change is a step
      if (e.rent > 0 && Math.abs(e.rent - rent) > 0.005) {
        const step = { id: eventId, from: p.date, oldRent: rent, newRent: e.rent, kind: (p.flags.date === "renewal" ? "renewal" : T.isMove(p.flags) ? "room" : "extension") as "room" | "renewal" | "extension" };
        steps.push(step);
        const diff = r2(paidSpans.reduce((n, s) => n + billedDifference(s, step), 0));
        const lastEnd = paidSpans.map((s) => s.end).sort().at(-1) ?? "";
        if (diff > 0) {
          // never the billed RP itself: an RP adjustment for the difference (agreed 7 Oct 2026)
          const inv = await raiseAdjustment(sb, data.residentId, data.tenancyId, {
            label: `Rent adjustment ${fmtDay(p.date)} – ${fmtDay(lastEnd)} (RM ${e.rent.toLocaleString("en-MY")} a month instead of RM ${rent.toLocaleString("en-MY")}, pro-rated by day)`,
            amount: diff,
          });
          out.adjustment = inv.number;
        } else if (diff < 0) {
          await addCredit(sb, data.residentId, [{ amount: -diff, kind: "rent", reason: `Rent difference ${fmtDay(p.date)} – ${fmtDay(lastEnd)}, already billed - ${name.toLowerCase()}`, eventId }]);
          out.credit = -diff;
        }
        rent = e.rent;
      }

      // 2. the deposits against what is held before this event
      const required = { ...e.required, card_deposit: held.card_deposit };
      const d = T.eventDeposits(held, required, e.waived);
      await addCredit(
        sb,
        data.residentId,
        d.reclassified.map((r) => ({ amount: r.amount, kind: "deposit" as const, depositKey: r.key, depositLabel: r.label, reason: `${r.label} reduced - ${name.toLowerCase()} ${fmtDay(p.date)}`, eventId })),
      );
      allowances.push(...d.waived.map((w) => ({ ...w, eventId, at: new Date().toISOString() })));
      held = d.heldAfter;

      // 3. the event's IP
      const charges = T.fixedCharges(p.flags).length ? e.charges : [];
      const ip = T.eventInvoice(d.ipLines, charges, 0);
      let invoice: { id: string; number: string } | null = null;
      if (ip.total > 0) {
        const billOn = T.ipBillOn(p.date, today);
        invoice = await raiseIp(sb, data.residentId, data.tenancyId, ip.lines, {
          billOn,
          note: `${TOP_UP_NOTE} - ${name} ${fmtDay(p.date)}`,
          tenancyEnd: e.periodEnd,
          rent: e.rent || rent,
          roomName: e.roomName,
          occupancy: e.occupancy,
        });
        out.billOn = billOn;
        out.total = ip.total;
      }
      // the credit, on this IP first, then whatever is owing
      const used = await applyAccountCredit(sb, data.residentId, invoice?.id);
      out.creditApplied = r2(used.filter((u) => u.invoiceId === invoice?.id).reduce((n, u) => n + u.amount, 0));
      if (invoice) {
        const { data: now } = await sb.from("invoices").select("number").eq("id", invoice.id).maybeSingle();
        invoice.number = String(now?.number ?? invoice.number);
        out.invoiceNumber = invoice.number.startsWith("SCH-") ? "" : invoice.number;
      }

      // 4. the documents, waiting for the IP
      const docs = T.documentsFor(p.flags);
      pending.push({
        eventId,
        name,
        date: p.date,
        at: new Date().toISOString(),
        ...(invoice ? { invoiceId: invoice.id, invoiceNumber: out.invoiceNumber } : {}),
        plan: docs,
        mergeValues: e.mergeValues,
        periodStart: p.date,
        periodEnd: e.periodEnd,
        tenancyId: data.tenancyId,
        ...(docs.newAgreement ? {} : renewalId ? { after: renewalId } : ag?.id ? { agreementId: String(ag.id) } : {}),
      });
      if (docs.newAgreement) renewalId = eventId;
      log.push({ eventId, name, date: p.date, flags: p.flags, rent: e.rent, deposits: d.rows, waived: d.waived, reclassified: d.reclassified, charges, ip, out });
      results.push(out);
    }

    // the tenancy and its rent terms: the scheduled RPs follow
    if (finalEnd !== data.change.oldEnd) {
      const { error } = await sb.from("tenancies").update({ end_date: finalEnd }).eq("id", data.tenancyId);
      if (error) throw new Error(error.message);
    }
    await rs.writeRentSteps(sb, data.residentId, data.tenancyId, {
      steps,
      ...(data.moveTo && data.moveOn > today ? { moveTo: { ...data.moveTo, from: data.moveOn } } : {}),
    });
    if (sched) {
      const { error } = await sb
        .from("rental_schedules")
        .update({ tenancy_end: finalEnd, monthly_rent: rent, updated_at: new Date().toISOString() })
        .eq("tenancy_id", data.tenancyId);
      if (error) throw new Error(error.message);
      await rs.syncScheduledRent(sb, data.tenancyId);
    }
    await writeJson(sb, allowancePath(data.residentId), allowances);
    await writeJson(sb, `tenancy-change/${data.residentId}/${new Date().toISOString().replace(/[:.]/g, "-")}.json`, { change: data.change, moveOn: data.moveOn, events: log });

    // documents for every event already settled - no IP, or covered by credit
    await writePending(sb, data.residentId, pending);
    await processPendingEvents(sb, data.residentId);
    const left = await readPending(sb, data.residentId);
    return { events: results.map((r, i) => ({ ...r, documents: left.some((l) => l.eventId === pending[i]!.eventId) ? ("waiting" as const) : ("made" as const) })) };
  });

/** Each event whose IP is settled: its documents are made, in order. */
export async function processPendingEvents(sb: any, residentId: string) {
  const list = await readPending(sb, residentId);
  if (!list.length) return;
  const done = new Set<string>();
  const remaining: PendingEvent[] = [];
  for (const p of list) {
    const blocked = p.after && list.some((q) => q.eventId === p.after && !done.has(q.eventId));
    if (blocked || (p.invoiceId && !(await settled(sb, p.invoiceId)))) {
      remaining.push(p);
      continue;
    }
    await makeDocuments(sb, residentId, p);
    done.add(p.eventId);
  }
  if (remaining.length !== list.length) await writePending(sb, residentId, remaining);
}

async function settled(sb: any, invoiceId: string) {
  const { data: inv } = await sb.from("invoices").select("total, status").eq("id", invoiceId).maybeSingle();
  if (!inv || inv.status === "void") return false;
  const { data: pays } = await sb.from("payments").select("amount").eq("invoice_id", invoiceId);
  const paid = ((pays ?? []) as any[]).reduce((n, p) => n + Number(p.amount || 0), 0);
  return paid + 0.005 >= Number(inv.total || 0);
}

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

/**
 * A move on a later day (Dani, 6 Oct 2026): the bed to move to, once the day
 * comes. The resident page moves it then, the first time it is opened.
 */
export const getPendingMove = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const tenancyId = await latestTenancyId(sb, data.residentId);
    if (!tenancyId) return null;
    const { readRentSteps } = await import("@/lib/rent-schedule.server");
    const { moveTo } = await readRentSteps(sb, data.residentId, tenancyId);
    return moveTo?.from ? { from: moveTo.from, moveTo } : null;
  });

export const clearPendingMove = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const tenancyId = await latestTenancyId(sb, data.residentId);
    if (!tenancyId) return { ok: true as const };
    const { readRentSteps, writeRentSteps } = await import("@/lib/rent-schedule.server");
    const saved = await readRentSteps(sb, data.residentId, tenancyId);
    if (saved.moveTo) await writeRentSteps(sb, data.residentId, tenancyId, { steps: saved.steps });
    return { ok: true as const };
  });

/** From Record payment or account credit: an IP settled, so its event's documents are made. */
export async function tenancyChangeAfterPayment(sb: any, invoiceId: string) {
  const { data: inv } = await sb.from("invoices").select("resident_id").eq("id", invoiceId).maybeSingle();
  const residentId = String(inv?.resident_id ?? "");
  if (residentId) await processPendingEvents(sb, residentId);
}

/* ------------------------------------------------------------------ helpers */

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
      // an IP not billed yet has a placeholder, not a number
      invoiceNumber: (number.get(i.invoice_id) ?? "").startsWith("SCH-") ? "scheduled IP" : (number.get(i.invoice_id) ?? ""),
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

/**
 * A higher rent for days already billed: an RP adjustment, due in 7 days. The
 * billed RP is never changed, and this is rent - not an Additional Charge
 * (agreed 7 Oct 2026). No period of its own, so the schedule is not moved by it.
 */
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
      invoice_type: "rental",
      invoice_date: klToday(),
      payment_terms: "NET7",
      issued_at: new Date().toISOString(),
      total: line.amount,
      deposits_total: 0,
      notes: "Rent adjustment - tenancy updated",
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

/**
 * An event's IP, beside the move-in one (agreed 7 Oct 2026): made now as a
 * scheduled invoice - listed on Payments with its amount fixed - and billed on
 * its day, 14 days before the event. A day already passed bills it now.
 */
async function raiseIp(
  sb: any,
  residentId: string,
  tenancyId: string,
  lines: { label: string; amount: number; kind: string }[],
  o: { billOn: string; note: string; tenancyEnd: string; rent: number; roomName: string; occupancy: string },
) {
  const { data: first } = await sb
    .from("invoices")
    .select("full_name, email, phone, university, nationality, residence_name, room_name, occupancy, tenancy_start, tenancy_end, monthly_rent, payment_frequency, company, occupation")
    .eq("resident_id", residentId)
    .eq("invoice_type", "initial")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const total = r2(lines.reduce((n, l) => n + l.amount, 0));
  const id = crypto.randomUUID();
  const { error } = await sb.from("invoices").insert({
    ...(first ?? {}),
    ...(o.roomName ? { room_name: o.roomName } : {}),
    ...(o.occupancy ? { occupancy: o.occupancy } : {}),
    ...(o.tenancyEnd ? { tenancy_end: o.tenancyEnd } : {}),
    ...(o.rent ? { monthly_rent: o.rent } : {}),
    id,
    // a placeholder: the number is given when it is billed
    number: `SCH-${id}`,
    status: "scheduled",
    auto_scheduled: false,
    resident_id: residentId,
    tenancy_id: tenancyId,
    invoice_type: "initial",
    bill_on: o.billOn,
    invoice_date: o.billOn,
    payment_terms: "NET7",
    issued_at: new Date(`${o.billOn}T00:00:00Z`).toISOString(),
    total,
    deposits_total: lines.filter((l) => l.kind === "refundable").reduce((n, l) => n + l.amount, 0),
    notes: o.note,
  });
  if (error) throw new Error(error.message);
  const { error: iErr } = await sb
    .from("invoice_items")
    .insert(lines.map((l, i) => ({ invoice_id: id, label: l.label, kind: l.kind, amount: l.amount, quantity: 1, sort_order: i })));
  if (iErr) throw new Error(iErr.message);
  // its billing day has come: billed now, with its number
  if (o.billOn <= klToday()) {
    const { billDueInvoices } = await import("@/lib/invoices");
    await billDueInvoices(sb);
  }
  const { data: now } = await sb.from("invoices").select("number, status").eq("id", id).maybeSingle();
  if (now && now.status !== "scheduled") {
    const { recordInvoiceVersion } = await import("@/lib/document-versions.functions");
    await recordInvoiceVersion(sb, id);
  }
  return { id, number: String(now?.number ?? "") };
}

/** each document once: a new agreement, or a revised Schedule A / C; and the access card form */
async function makeDocuments(sb: any, residentId: string, p: PendingEvent) {
  const { renewAgreement, reviseSchedule } = await import("@/lib/tenancy-docs.functions");
  if (p.plan.newAgreement) {
    await renewAgreement({
      data: { residentId, tenancyId: p.tenancyId, mergeValues: p.mergeValues, periodStart: p.periodStart, periodEnd: p.periodEnd },
    });
  } else if (p.plan.scheduleA || p.plan.scheduleC) {
    // the agreement fixed on confirm - a renewal paid first must not take the old one's schedules
    const { data: latest } = p.agreementId
      ? { data: null }
      : await sb.from("tenancy_agreements").select("id").eq("resident_id", residentId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const ag = p.agreementId ? { id: p.agreementId } : latest;
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
