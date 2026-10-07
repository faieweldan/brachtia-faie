import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { klToday } from "@/lib/kl-date";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Update Tenancy, on the server - the rules are in tenancy-change.ts, and the
 * agreed answers of 7 Oct 2026 are the reference. Confirm only SCHEDULES:
 * for each EVENT of the request (a room change on 11 Nov and a renewal on
 * 1 Dec are two) it
 *   1. compares the deposits with what is actually held: higher, the
 *      difference goes on the event's Initial Payment (IP) with the fixed
 *      charges; lower, the difference becomes account credit
 *   2. makes the IP at once as a scheduled invoice, billed 14 days before the
 *      event (today, when that has passed). It can be paid in advance, and
 *      account credit is applied to it in event order
 *   3. records the event as scheduled
 * The rest - documents, rent, the bed, the end date - happens when the IP is
 * settled and the date comes: tenancy-events.server.ts.
 *
 * Kept beside the resident's documents, so nothing runs on either database:
 *   tenancy-change/<resident>/allowances.json    deposit differences waived
 *   tenancy-change/<resident>/<time>.json        each request, as it was made
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

type Allowance = { key: string; amount: number; eventId: string; at: string; cancelledAt?: string };

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

/**
 * The deposits held now, by deposit: every IP paid in full (a scheduled or
 * unpaid one holds nothing yet), less what became account credit, plus any
 * difference admin waived - treated as held, so it is not asked for again.
 */
async function heldNow(sb: any, residentId: string) {
  return (await depositPosition(sb, residentId)).covered;
}

/**
 * The deposits, three ways (7 Oct 2026 rule): cash actually held (paid IPs,
 * less what became account credit) - the only refundable money; differences
 * waived, which count towards the requirement but are not money; and the two
 * together, the requirement covered, which a later change is compared with.
 */
async function depositPosition(sb: any, residentId: string) {
  const { depositsOf, moneyOf } = await import("@/lib/tenancy-change");
  const { reclassifiedDeposits } = await import("@/lib/account-credit.server");
  const { settledDepositLines } = await import("@/lib/tenancy-events.server");
  const cash = depositsOf(moneyOf(await settledDepositLines(sb, residentId)));
  for (const r of await reclassifiedDeposits(sb, residentId)) if (r.depositKey && r.depositKey in cash) (cash as any)[r.depositKey] = r2((cash as any)[r.depositKey] - r.amount);
  const waived = depositsOf({});
  for (const a of (await readJson<Allowance[]>(sb, allowancePath(residentId))) ?? []) if (a.key in waived && !a.cancelledAt) (waived as any)[a.key] = r2((waived as any)[a.key] + a.amount);
  const covered = depositsOf(Object.fromEntries(Object.keys(cash).map((k) => [k, (cash as any)[k] + (waived as any)[k]])));
  return { cash, waived, covered };
}

/** What the window starts from: the deposits held, the rent today, the tenancy, the Website rates, the credit. */
export const getTenancyChangeBasis = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const ev = await import("@/lib/tenancy-events.server");
    await ev.processResident(sb, data.residentId);
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
      ...(await (async () => {
        const p = await depositPosition(sb, data.residentId);
        return { held: p.covered, heldCash: p.cash, waivedHeld: p.waived };
      })()),
      // beds other open events have claimed - not offered to this resident
      claimed: (await ev.claimedBeds(sb)).filter((c) => c.residentId !== data.residentId),
      // each deposit line, with its invoice - the same table as the checkout statement (Dani, 5 Oct 2026)
      heldLines: [
        ...(await ev.settledDepositLines(sb, data.residentId)),
        ...(await reclassifiedDeposits(sb, data.residentId)).map((r) => ({ label: `${r.depositLabel ?? "Deposit"} - to account credit`, amount: -r.amount, invoiceNumber: "" })),
      ],
      // credit already there - the preview applies it, event by event, as confirm will
      accountCredit: (await creditBalance(sb, data.residentId)).balance,
      open: (await ev.readEvents(sb, data.residentId)).filter(ev.isOpen).map((e) => ({ name: e.name, date: e.date, settled: !!e.settledAt })),
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
        /** the bed they move to */
        moveTo: z.object({ bedId: z.string().max(80), roomId: z.string().max(80), unitId: z.string().max(80), occupancy: z.string().max(20) }).nullable(),
        /** each event as the window priced it - the server checks the plan and works out the money itself */
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
              /** RM100 / RM20 waived - the fees themselves are fixed (7 Oct 2026 review) */
              waivedFees: z.array(z.string().max(20)).max(4),
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
    const E = await import("@/lib/tenancy-events.server");
    const flags = T.changeFlags(data.change);
    if (data.change.newEnd < data.change.oldEnd) throw new Error("A shorter tenancy is a checkout - Early termination.");
    if (!T.anyChange(flags)) throw new Error("Nothing has changed.");
    const today = klToday();
    if (T.isMove(flags) && (!data.moveOn || data.moveOn < today)) throw new Error("Choose an effective date from today on.");
    if (T.isMove(flags) && !data.moveTo) throw new Error("Choose the new bed.");
    const finalEnd = data.change.newEnd > data.change.oldEnd ? data.change.newEnd : data.change.oldEnd;
    if (T.isMove(flags) && data.moveOn > finalEnd) throw new Error("The effective date is after the tenancy ends.");
    // a move to another residence waits until its agreement and card templates exist (7 Oct 2026)
    if (data.moveTo) {
      const residenceOf = async (unitId: string) => String((await sb.from("units").select("residence_id").eq("id", unitId).maybeSingle()).data?.residence_id ?? "");
      if ((await residenceOf(data.moveTo.unitId)) !== (await residenceOf(data.change.oldUnitId))) throw new Error("A move to another residence is not available yet.");
      const claimed = (await E.claimedBeds(sb)).find((c) => c.bedId === data.moveTo!.bedId && c.residentId !== data.residentId);
      if (claimed) throw new Error("That bed is reserved for another resident's room change.");
    }
    const plan = T.planEvents(flags, data.moveOn, data.change.oldEnd);
    if (plan.length !== data.events.length || plan.some((p, i) => p.date !== data.events[i]!.date)) throw new Error("The change was read differently - close the window and start again.");
    // a change still under way is finished first: cancelling one is not decided yet (7 Oct 2026)
    const open = (await E.readEvents(sb, data.residentId)).filter(E.isOpen);
    if (open.length) throw new Error(`An earlier change is still scheduled: ${open.map((o) => `${o.name}, ${o.date}`).join("; ")}.`);

    const { data: sched } = await sb.from("rental_schedules").select("monthly_rent").eq("tenancy_id", data.tenancyId).maybeSingle();
    const { data: ag } = await sb.from("tenancy_agreements").select("id").eq("resident_id", data.residentId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { addCredit, applyAccountCredit } = await import("@/lib/account-credit.server");
    const { readRentSteps, rentOn } = await import("@/lib/rent-schedule.server");
    const { shiftDate } = await import("@/lib/rental-schedule");
    const steps = (await readRentSteps(sb, data.residentId, data.tenancyId)).steps;

    let rent = rentOn(steps, shiftDate(plan[0]!.date, { days: -1 }), Number(sched?.monthly_rent ?? 0));
    let held = await heldNow(sb, data.residentId);
    const requestId = crypto.randomUUID().slice(0, 8);
    const allowances = (await readJson<Allowance[]>(sb, allowancePath(data.residentId))) ?? [];
    const events: import("@/lib/tenancy-events.server").TenancyEvent[] = [];
    const log: unknown[] = [];
    let renewalBefore = false;

    for (const [i, p] of plan.entries()) {
      const e = data.events[i]!;
      const eventId = crypto.randomUUID().slice(0, 8);
      const name = T.eventName(p.flags);

      // the deposits against what is held before this event; the card deposit is carried over
      const d = T.eventDeposits(held, { ...e.required, card_deposit: held.card_deposit }, e.waived);
      await addCredit(
        sb,
        data.residentId,
        d.reclassified.map((r) => ({ amount: r.amount, kind: "deposit" as const, depositKey: r.key, depositLabel: r.label, reason: `${r.label} reduced - ${name.toLowerCase()} ${p.date}`, eventId })),
      );
      allowances.push(...d.waived.map((w) => ({ ...w, eventId, at: new Date().toISOString() })));
      held = d.heldAfter;

      // the IP: deposit differences, and the fixed fees not waived
      const fees = T.fixedCharges(p.flags).filter((c) => !e.waivedFees.includes(c.key));
      const ip = T.eventInvoice(d.ipLines, fees, 0);
      let invoice: { id: string; number: string } | null = null;
      const billOn = ip.total > 0 ? T.ipBillOn(p.date, today) : "";
      if (ip.total > 0) {
        const { raiseIp } = await import("@/lib/tenancy-events.server");
        invoice = await raiseIp(sb, data.residentId, data.tenancyId, ip.lines, {
          billOn,
          note: `${TOP_UP_NOTE} - ${name} ${p.date}`,
          tenancyEnd: e.periodEnd,
          rent: e.rent || rent,
          roomName: e.roomName,
          occupancy: e.occupancy,
        });
      }
      const docs = T.documentsFor(p.flags);
      events.push({
        eventId,
        requestId,
        name,
        date: p.date,
        flags: p.flags,
        tenancyId: data.tenancyId,
        rentBefore: rent,
        rent: e.rent || rent,
        periodEnd: e.periodEnd,
        ...(T.isMove(p.flags) && data.moveTo ? { moveTo: data.moveTo } : {}),
        ...(invoice ? { invoiceId: invoice.id, invoiceNumber: invoice.number.startsWith("SCH-") ? "" : invoice.number, billOn } : {}),
        ipTotal: ip.total,
        plan: docs,
        mergeValues: e.mergeValues,
        // a room change before any renewal revises today's agreement
        ...(!docs.newAgreement && !renewalBefore && ag?.id ? { agreementId: String(ag.id) } : {}),
        at: new Date().toISOString(),
      });
      if (docs.newAgreement) renewalBefore = true;
      log.push({ eventId, name, date: p.date, flags: p.flags, rent: e.rent, deposits: d.rows, waived: d.waived, waivedFees: e.waivedFees, reclassified: d.reclassified, ip });
      rent = e.rent || rent;
    }

    await writeJson(sb, allowancePath(data.residentId), allowances);
    await writeJson(sb, `tenancy-change/${data.residentId}/${new Date().toISOString().replace(/[:.]/g, "-")}.json`, { change: data.change, moveOn: data.moveOn, events: log });
    // the target bed, held for this resident from the effective date
    const mover = events.find((e) => e.moveTo);
    if (mover?.moveTo && (await E.reserveBed(sb, data.residentId, mover.moveTo.bedId, mover.date))) mover.reservedBed = mover.moveTo.bedId;
    await E.addEvents(sb, data.residentId, events);
    // account credit on the IPs, in event order - nothing else, as the preview showed it
    for (const ev of events) if (ev.invoiceId) await applyAccountCredit(sb, data.residentId, ev.invoiceId, true);
    await E.processResident(sb, data.residentId);
    const after = await E.readEvents(sb, data.residentId);
    return {
      events: events.map((ev) => {
        const now = after.find((a) => a.eventId === ev.eventId);
        return { name: ev.name, date: ev.date, ipTotal: ev.ipTotal, billOn: ev.billOn ?? "", settled: !!now?.settledAt, effective: !!now?.effectiveAt };
      }),
    };
  });

/** The resident's Update Tenancy events, for the Tenancy tab - moved on first, so what shows is current. */
export const getTenancyEvents = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const E = await import("@/lib/tenancy-events.server");
    await E.processResident(sb, data.residentId);
    const list = await E.readEvents(sb, data.residentId);
    const ids = list.map((e) => e.invoiceId).filter(Boolean) as string[];
    const { data: inv } = ids.length ? await sb.from("invoices").select("id, number, status, total").in("id", ids) : { data: [] };
    const { data: pays } = ids.length ? await sb.from("payments").select("invoice_id, amount").in("invoice_id", ids) : { data: [] };
    const paid = new Map<string, number>();
    for (const p of (pays ?? []) as any[]) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + Number(p.amount || 0));
    const { documentNames } = await import("@/lib/tenancy-change");
    // the rent in force today, from the rent terms and their changes - the page's own copy goes stale
    const { data: t } = await sb.from("tenancies").select("id").eq("resident_id", data.residentId).order("start_date", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    const { data: sched } = t ? await sb.from("rental_schedules").select("monthly_rent").eq("tenancy_id", t.id).maybeSingle() : { data: null };
    const { readRentSteps, rentOn } = await import("@/lib/rent-schedule.server");
    const rentToday = sched ? rentOn(t ? (await readRentSteps(sb, data.residentId, String(t.id))).steps : [], klToday(), Number(sched.monthly_rent ?? 0)) : 0;
    const events = list
      .slice()
      .reverse()
      .map((e) => {
        const i = ((inv ?? []) as any[]).find((x) => x.id === e.invoiceId);
        return {
          eventId: e.eventId,
          name: e.name,
          date: e.date,
          rentBefore: e.rentBefore,
          rent: e.rent,
          periodEnd: e.periodEnd,
          /** extension / renewal / none - the header shows the end date it brings */
          dateChange: e.flags.date,
          /** the bed it moves to - the header shows it before the day */
          moveToBed: e.moveTo?.bedId ?? "",
          ip: e.invoiceId
            ? { number: String(i?.number ?? "").startsWith("SCH-") ? "" : String(i?.number ?? ""), total: Number(i?.total ?? e.ipTotal), paid: r2(paid.get(e.invoiceId) ?? 0), billOn: e.billOn ?? "" }
            : null,
          documents: documentNames(e.plan),
          state: e.cancelled
            ? ("cancelled" as const)
            : e.effectiveAt
              ? ("effective" as const)
              : e.settledAt
                ? ("settled" as const)
                : e.needsDate
                  ? ("needs_date" as const)
                  : e.overdue
                    ? ("overdue" as const)
                    : ("scheduled" as const),
          moves: !!e.moveTo,
          cancelled: e.cancelled ?? null,
          waitingFor: e.waitingFor ?? "",
          adjustment: e.adjustment ?? "",
          credit: e.credit ?? 0,
        };
      });
    return { events, rentToday };
  });

/**
 * Cancel an event before its date (Dani's cancellation rule, 7 Oct 2026). A
 * reason and the staff member approving it are required; the rest is in
 * tenancy-events.server.ts cancelEvent.
 */
export const cancelTenancyEvent = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ residentId: z.string().uuid(), eventId: z.string().min(1).max(20), reason: z.string().trim().min(5).max(300), approvedBy: z.string().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const { STAFF } = await import("@/data/form-options");
    if (!STAFF.includes(data.approvedBy)) throw new Error("Choose who approved the cancellation.");
    const { cancelEvent } = await import("@/lib/tenancy-events.server");
    return cancelEvent(sb, data.residentId, data.eventId, data.reason.trim(), data.approvedBy);
  });

/** Paid after its date: admin confirms the new effective date (7 Oct 2026 rule). */
export const confirmEventDate = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ residentId: z.string().uuid(), eventId: z.string().min(1).max(20), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { confirmEffectiveDate } = await import("@/lib/tenancy-events.server");
    return confirmEffectiveDate(sb, data.residentId, data.eventId, data.date);
  });

/** From Record payment or account credit: an IP settled, so its event moves on. */
export async function tenancyChangeAfterPayment(sb: any, invoiceId: string) {
  const { data: inv } = await sb.from("invoices").select("resident_id").eq("id", invoiceId).maybeSingle();
  const residentId = String(inv?.resident_id ?? "");
  if (!residentId) return [];
  const { processResident } = await import("@/lib/tenancy-events.server");
  return processResident(sb, residentId);
}
