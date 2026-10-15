import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ipDifferenceNote } from "@/lib/invoice-category";
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

async function admin(): Promise<any> {
  const { requireAdminSession } = await import("@/lib/admin-session.server");
  await requireAdminSession();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

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
    // the tenancy's own dates, and the rent in force today - not a later one already agreed (tenancy-facts)
    const { officialStay, rentInForce } = await import("@/lib/tenancy-facts.server");
    const stay = await officialStay(sb, { residentId: data.residentId });
    const t = stay.source === "tenancy" ? stay : null;
    const now = await rentInForce(sb, data.residentId, t?.tenancyId, klToday());
    const { creditBalance, reclassifiedDeposits } = await import("@/lib/account-credit.server");
    // the Website rates: a renewal is priced at them, and a new room too
    const { data: types } = await sb.from("room_types").select("code, residence_id, unit_type, occupancies, rent");
    return {
      tenancy: t ? { id: String(t.tenancyId), start: t.start, end: t.end } : null,
      rent: now.rent,
      // no rent terms: the scheduled invoices cannot be made again
      hasSchedule: now.hasSchedule,
      ...(await (async () => {
        const p = await depositPosition(sb, data.residentId);
        return { held: p.covered, heldCash: p.cash, waivedHeld: p.waived };
      })()),
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

const changeRequest = z.object({
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
  moveTo: z
    .object({
      bedId: z.string().max(80),
      roomId: z.string().max(80),
      unitId: z.string().max(80),
      occupancy: z.string().max(20),
      /** a twin room nobody is in, let whole as one single (roomOffer "whole") */
      letWhole: z.boolean().optional(),
    })
    .nullable(),
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
  /** who approved the change - required, as for a cancellation (Dani, 14 Oct 2026) */
  approvedBy: z.string().min(1).max(80),
  /** the money preview's key - Confirm is refused when the figures moved since (15 Oct 2026) */
  previewKey: z.string().max(40).optional(),
});
export type TenancyChangeRequest = z.infer<typeof changeRequest>;
const planRequest = changeRequest.omit({ approvedBy: true, previewKey: true });
type PlanRequest = z.infer<typeof planRequest>;

export const applyTenancyChange = createServerFn({ method: "POST" })
  .inputValidator((d) => changeRequest.parse(d))
  .handler(async ({ data }) => applyTenancyChangeWith(await admin(), data));

/**
 * applyTenancyChange's body - handed the client, so the tests can run it. In
 * two parts (14 Oct 2026):
 *   1. every check and every read - the plan, the tenancy's official end
 *      (tenancy-facts), the documents each event will need (the preflight in
 *      tenancy-docs.functions), the rent in force, the deposits held, and each
 *      event priced. A request that fails here has saved nothing
 *   2. the writes, in the order they always were: the rooms held, then for each
 *      event its credit and its IP, then the request, the events and the
 *      account credit on the IPs
 * Before, the documents were found out only once the IP was paid, and the
 * request had made its invoice, credit and room hold by then.
 */
/**
 * Part 1 of a change - every check and every read, nothing written: the plan,
 * the tenancy's official end, the documents each event needs, the rent in
 * force, the deposits held, and each event priced. Confirm runs it, and so does
 * the review's money preview, so both show and save one set of figures.
 */
async function planChangeWith(sb: any, data: PlanRequest) {
  const T = await import("@/lib/tenancy-change");
  const E = await import("@/lib/tenancy-events.server");
  const flags = T.changeFlags(data.change);
  if (data.change.newEnd < data.change.oldEnd)
    throw new Error("A shorter tenancy is a checkout - Early termination.");
  if (!T.anyChange(flags)) throw new Error("Nothing has changed.");
  // the end it changes from is the tenancy's own - never a copy the window was shown (14 Oct 2026)
  const { officialStay, rentInForce } = await import("@/lib/tenancy-facts.server");
  const stay = await officialStay(sb, { residentId: data.residentId, tenancyId: data.tenancyId });
  if (stay.source !== "tenancy") throw new Error("This resident has no tenancy to update.");
  if (stay.end !== data.change.oldEnd)
    throw new Error("The change was read differently - close the window and start again.");
  const today = klToday();
  if (T.isMove(flags) && (!data.moveOn || data.moveOn < today))
    throw new Error("Choose an effective date from today on.");
  if (T.isMove(flags) && !data.moveTo) throw new Error("Choose the new bed.");
  const finalEnd =
    data.change.newEnd > data.change.oldEnd ? data.change.newEnd : data.change.oldEnd;
  if (T.isMove(flags) && data.moveOn > finalEnd)
    throw new Error("The effective date is after the tenancy ends.");
  // a move to another residence waits until its agreement and card templates exist (7 Oct 2026)
  if (data.moveTo) {
    const residenceOf = async (unitId: string) =>
      String(
        (await sb.from("units").select("residence_id").eq("id", unitId).maybeSingle()).data
          ?.residence_id ?? "",
      );
    if ((await residenceOf(data.moveTo.unitId)) !== (await residenceOf(data.change.oldUnitId)))
      throw new Error("A move to another residence is not available yet.");
  }
  const plan = T.planEvents(flags, data.moveOn, data.change.oldEnd);
  if (plan.length !== data.events.length || plan.some((p, i) => p.date !== data.events[i]!.date))
    throw new Error("The change was read differently - close the window and start again.");
  // a change still under way is finished first: cancelling one is not decided yet (7 Oct 2026)
  const open = (await E.readEvents(sb, data.residentId)).filter(E.isOpen);
  if (open.length)
    throw new Error(
      `An earlier change is still scheduled: ${open.map((o) => `${o.name}, ${o.date}`).join("; ")}.`,
    );

  // every document each event needs can be made from the agreement on file - or nothing is saved
  const { updateTenancyDocumentPreflight } = await import("@/lib/tenancy-docs.functions");
  const documents = await updateTenancyDocumentPreflight(
    sb,
    data.residentId,
    plan.map((p) => ({ date: p.date, name: T.eventName(p.flags), plan: T.documentsFor(p.flags) })),
  );
  if (!documents.ok) throw new Error(documents.error);

  /*
   * Each event worked out before anything is written: the deposits against what
   * is held before it (the card deposit is carried over), the IP - deposit
   * differences and the fixed fees not waived - and the rent before and after.
   */
  const { shiftDate } = await import("@/lib/rental-schedule");
  // the rent in force the day before the first event: the rent terms with their changes
  let rent = (
    await rentInForce(sb, data.residentId, data.tenancyId, shiftDate(plan[0]!.date, { days: -1 }))
  ).rent;
  let heldDeposits = await heldNow(sb, data.residentId);
  const priced = plan.map((p, i) => {
    const e = data.events[i]!;
    const d = T.eventDeposits(
      heldDeposits,
      { ...e.required, card_deposit: heldDeposits.card_deposit },
      e.waived,
    );
    heldDeposits = d.heldAfter;
    const fees = T.fixedCharges(p.flags).filter((c) => !e.waivedFees.includes(c.key));
    const ip = T.eventInvoice(d.ipLines, fees, 0);
    const rentBefore = rent;
    rent = e.rent || rent;
    return {
      p,
      e,
      eventId: crypto.randomUUID().slice(0, 8),
      name: T.eventName(p.flags),
      d,
      ip,
      billOn: ip.total > 0 ? T.ipBillOn(p.date, today) : "",
      docs: T.documentsFor(p.flags),
      rentBefore,
      rent,
    };
  });

  return { T, E, flags, today, finalEnd, plan, documents, priced };
}

export async function applyTenancyChangeWith(sb: any, data: TenancyChangeRequest) {
  // who decided it - a staff member, the same list a cancellation is approved from
  const { STAFF } = await import("@/data/form-options");
  if (!STAFF.includes(data.approvedBy)) throw new Error("Choose who approved the change.");
  const planned = await planChangeWith(sb, data);
  const { T, E, flags, today, finalEnd, plan, documents, priced } = planned;
  void today;
  void plan;
  // the review showed figures: they must still be the figures (15 Oct 2026)
  if (data.previewKey && (await previewOf(sb, data, planned)).key !== data.previewKey)
    throw new Error("The figures changed while the review was open - go back to Review and check them again.");
  const { addCredit, applyAccountCredit } = await import("@/lib/account-credit.server");
  const requestId = crypto.randomUUID().slice(0, 8);
  const allowances = (await readJson<Allowance[]>(sb, allowancePath(data.residentId))) ?? [];

  /*
   * The rooms this change needs, held for the resident from their dates
   * (14 Oct 2026) - through place_stay, like a booking, so it is checked under
   * the unit's lock against everybody's dates and the booking's room picker
   * sees it. Never into the dates of somebody who has a room booked after:
   * they are moved first (9 Oct 2026).
   *   the new room          from the move day to the end
   *   their own, for longer from the day after the old end, until the move or the new end
   * Made before any money, and let go again if anything after fails.
   */
  const held: string[] = [];
  {
    const { dayBefore } = await import("@/lib/placement");
    const { data: live } = await sb
      .from("beds")
      .select("id")
      .eq("resident_id", data.residentId)
      .neq("status", "vacant")
      .limit(1)
      .maybeSingle();
    const holds: { bedId: string; start: string; end: string; whole: boolean }[] = [];
    if (live?.id && finalEnd > data.change.oldEnd) {
      const from = T.nextDay(data.change.oldEnd);
      const until = T.isMove(flags) && data.moveOn ? dayBefore(data.moveOn) : finalEnd;
      // their own room, held on as it was sold - a twin let whole stays whole
      const { placementForResident } = await import("@/lib/placement.server");
      const mine = await placementForResident(sb, data.residentId);
      if (until >= from) holds.push({ bedId: String(live.id), start: from, end: until, whole: !!mine?.letWhole });
    }
    if (T.isMove(flags) && data.moveTo)
      holds.push({ bedId: data.moveTo.bedId, start: data.moveOn, end: finalEnd, whole: !!data.moveTo.letWhole });
    for (const h of holds) {
      const r = await E.holdForChange(sb, data.residentId, h.bedId, h.start, h.end, h.whole);
      if (!r.ok) {
        for (const b of held) await E.releaseChangeHold(sb, data.residentId, b);
        const { data: me } = await sb
          .from("residents")
          .select("full_name")
          .eq("id", data.residentId)
          .maybeSingle();
        throw new Error(
          `${me?.full_name || "This resident"}'s change to ${fmtDay(finalEnd)} overlaps: ${r.detail} Move them first.`,
        );
      }
      held.push(h.bedId);
    }
  }
  let saved = false;
  try {
    const events: import("@/lib/tenancy-events.server").TenancyEvent[] = [];
    const log: unknown[] = [];
    let renewalBefore = false;

    for (const {
      p,
      e,
      eventId,
      name,
      d,
      ip,
      billOn,
      docs,
      rentBefore,
      rent: rentAfter,
    } of priced) {
      await addCredit(
        sb,
        data.residentId,
        d.reclassified.map((r) => ({
          amount: r.amount,
          kind: "deposit" as const,
          depositKey: r.key,
          depositLabel: r.label,
          reason: `${r.label} reduced - ${name.toLowerCase()} ${p.date}`,
          eventId,
        })),
      );
      allowances.push(...d.waived.map((w) => ({ ...w, eventId, at: new Date().toISOString() })));

      let invoice: { id: string; number: string } | null = null;
      if (ip.total > 0) {
        invoice = await E.raiseIp(sb, data.residentId, data.tenancyId, ip.lines, {
          billOn,
          note: ipDifferenceNote(name, p.date),
          tenancyEnd: e.periodEnd,
          rent: rentAfter,
          // the room it is for, read from the bed as sold (invoicePlace) - moved by now, or theirs
          ...(data.moveTo && data.moveOn && data.moveOn <= p.date ? { bedId: data.moveTo.bedId, letWhole: !!data.moveTo.letWhole } : {}),
        });
      }
      events.push({
        eventId,
        requestId,
        approvedBy: data.approvedBy,
        name,
        date: p.date,
        flags: p.flags,
        tenancyId: data.tenancyId,
        rentBefore,
        rent: rentAfter,
        periodEnd: e.periodEnd,
        ...(T.isMove(p.flags) && data.moveTo ? { moveTo: data.moveTo } : {}),
        ...(invoice
          ? {
              invoiceId: invoice.id,
              invoiceNumber: invoice.number.startsWith("SCH-") ? "" : invoice.number,
              billOn,
            }
          : {}),
        ipTotal: ip.total,
        plan: docs,
        mergeValues: e.mergeValues,
        // a room change before any renewal revises today's agreement - the one the preflight checked
        ...(!docs.newAgreement && !renewalBefore && documents.agreementId
          ? { agreementId: documents.agreementId }
          : {}),
        at: new Date().toISOString(),
      });
      if (docs.newAgreement) renewalBefore = true;
      log.push({
        eventId,
        name,
        date: p.date,
        flags: p.flags,
        rent: e.rent,
        deposits: d.rows,
        waived: d.waived,
        waivedFees: e.waivedFees,
        reclassified: d.reclassified,
        ip,
      });
    }

    await writeJson(sb, allowancePath(data.residentId), allowances);
    await writeJson(
      sb,
      `tenancy-change/${data.residentId}/${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
      { change: data.change, moveOn: data.moveOn, events: log, documents: documents.steps },
    );
    await E.addEvents(sb, data.residentId, events);
    saved = true;
    // account credit on the IPs, in event order - nothing else, as the preview showed it
    for (const ev of events)
      if (ev.invoiceId) await applyAccountCredit(sb, data.residentId, ev.invoiceId, true);
    await E.processResident(sb, data.residentId);
    const after = await E.readEvents(sb, data.residentId);
    return {
      events: events.map((ev) => {
        const now = after.find((a) => a.eventId === ev.eventId);
        return {
          name: ev.name,
          date: ev.date,
          ipTotal: ev.ipTotal,
          billOn: ev.billOn ?? "",
          settled: !!now?.settledAt,
          effective: !!now?.effectiveAt,
        };
      }),
    };
  } catch (err) {
    // the change was not saved: the rooms held for it are let go
    if (!saved)
      for (const b of held)
        await E.releaseChangeHold(sb, data.residentId, b).catch(() => undefined);
    throw err;
  }
}

/**
 * The money preview on Review (Dani, 15 Oct 2026) - read-only: opening it, or
 * its eye, writes nothing. Built from the same plan Confirm saves
 * (planChangeWith), so each figure on the screen is the figure that is saved:
 *   - each event's Initial Payment invoice: its lines, the account credit
 *     applied on confirm and the balance due, as a draft invoice
 *   - the account credit: what is given, what each IP takes, then the
 *     invoices still owing and the rent still to bill, oldest first - those
 *     rent invoices worked out at the new rent (plannedRent), as they will bill
 *   - what no invoice can take: a draft credit note (Credit refund), issued
 *     only later through Payables
 * Its `key` is sent back with Confirm, which is refused if the figures moved.
 */
export const previewTenancyChange = createServerFn({ method: "POST" })
  .inputValidator((d) => planRequest.parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    return previewOf(sb, data, await planChangeWith(sb, data));
  });

export async function previewTenancyChangeWith(sb: any, data: PlanRequest) {
  return previewOf(sb, data, await planChangeWith(sb, data));
}

async function previewOf(sb: any, data: PlanRequest, planned: Awaited<ReturnType<typeof planChangeWith>>) {
  const { T, E, today, priced } = planned;
  const { readRentSteps, plannedRent } = await import("@/lib/rent-schedule.server");
  const { billOnFor } = await import("@/lib/rental-schedule");
  const { creditBalance } = await import("@/lib/account-credit.server");
  const { invoiceTitle } = await import("@/lib/invoice-category");
  const L = T.MONEY_LABEL;

  // the rent changes this request brings, after the ones already saved
  const saved = await readRentSteps(sb, data.residentId, data.tenancyId);
  const steps = [...saved.steps];
  const events: import("@/lib/tenancy-change").OutlookEvent[] = [];
  for (const x of priced) {
    let rentCredit: { label: string; amount: number } | null = null;
    let adjustment: { label: string; amount: number } | null = null;
    if (Math.abs(x.rent - x.rentBefore) > 0.005 && x.rent > 0) {
      const step = {
        id: x.eventId,
        from: x.p.date,
        oldRent: x.rentBefore,
        newRent: x.rent,
        kind: (x.p.flags.date === "renewal" ? "renewal" : T.isMove(x.p.flags) ? "room" : "extension") as "room" | "renewal" | "extension",
      };
      steps.push(step);
      const b = await E.billedRentDifference(sb, data.tenancyId, step);
      const range = b.lastEnd ? T.periodName(x.p.date, b.lastEnd) : "";
      if (b.diff < -0.005) rentCredit = { label: L.billedRentCredit(range), amount: -b.diff };
      if (b.diff > 0.005) adjustment = { label: `RP adjustment, ${range}`, amount: b.diff };
    }
    events.push({
      name: x.name,
      date: x.p.date,
      ipTotal: x.ip.total,
      depositCredit: x.d.reclassified.map((r) => ({ label: r.label, amount: r.amount })),
      rentCredit,
      adjustment,
    });
  }

  // what the credit can go to: invoices billed and still owing, then the rent still to bill
  const targets: import("@/lib/tenancy-change").OutlookTarget[] = [];
  const { data: open } = await sb
    .from("invoices")
    .select("id, number, invoice_type, notes, total, invoice_date")
    .eq("resident_id", data.residentId)
    .not("status", "in", "(void,paid,scheduled)");
  const openRows = (open ?? []) as any[];
  const { data: pays } = openRows.length ? await sb.from("payments").select("invoice_id, amount").in("invoice_id", openRows.map((r) => r.id)) : { data: [] };
  const paid = new Map<string, number>();
  for (const p of (pays ?? []) as any[]) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + Number(p.amount || 0));
  for (const r of openRows)
    targets.push({
      id: String(r.id),
      label: invoiceTitle({ number: String(r.number ?? ""), type: String(r.invoice_type ?? "") }),
      date: String(r.invoice_date ?? "").slice(0, 10),
      owing: r2(Number(r.total || 0) - (paid.get(r.id) ?? 0)),
      kind: "invoice",
    });
  events.forEach((e, i) => {
    if (e.adjustment) targets.push({ id: `adjustment-${i}`, label: e.adjustment.label, date: e.date < today ? today : e.date, owing: e.adjustment.amount, kind: "invoice" });
  });
  const finalRent = priced.at(-1)?.rent ?? 0;
  const lastEnd = priced.map((x) => x.e.periodEnd).sort().at(-1) ?? "";
  const rent = await plannedRent(sb, data.tenancyId, {
    steps,
    ...(finalRent > 0 ? { monthlyRent: finalRent } : {}),
    ...(lastEnd ? { tenancyEnd: lastEnd > data.change.oldEnd ? lastEnd : data.change.oldEnd } : {}),
  });
  const months: { id: string; start: string; end: string; amount: number }[] = (rent?.made ?? []).map((m) => ({ id: String(m.id), start: m.period.start, end: m.period.end, amount: m.period.amount }));
  for (const k of (rent?.kept ?? []) as any[])
    months.push({ id: String(k.id), start: String(k.period_start ?? "").slice(0, 10), end: String(k.period_end ?? "").slice(0, 10), amount: Number(k.total || 0) });
  months.sort((a, b) => a.start.localeCompare(b.start));
  for (const m of months) targets.push({ id: m.id, label: `${L.rent}, ${T.periodName(m.start, m.end)}`, date: billOnFor(m.start), owing: m.amount, kind: "rent" });

  const balance = (await creditBalance(sb, data.residentId)).balance;
  const outlook = T.changeCreditOutlook(balance, events, targets);

  // the rent after the last month the credit reaches: "November 2027 onward"
  const lastCredited = outlook.credited.filter((c) => c.kind === "rent").at(-1);
  const firstAfter = (() => {
    const from = lastCredited ? months.findIndex((m) => m.id === lastCredited.id) + 1 : months.findIndex((m) => m.end >= (priced[0]?.p.date ?? ""));
    return from >= 0 ? months[from] : undefined;
  })();
  const onward = firstAfter && finalRent > 0 ? { from: new Date(`${firstAfter.start}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }), rent: finalRent } : null;

  // the drafts, built as Confirm and Payables build the real ones
  const { invoiceDocFromRow } = await import("@/lib/invoice-doc");
  const { ipDifferenceNote, CREDIT_NOTE_CATEGORIES } = await import("@/lib/invoice-category");
  const DRAFT = "DRAFT";
  const shown = await Promise.all(
    priced.map(async (x, i) => {
      const o = outlook.events[i]!;
      const toBed = data.moveTo && data.moveOn && data.moveOn <= x.p.date ? data.moveTo : null;
      const invoice =
        x.ip.total > 0
          ? {
              ...invoiceDocFromRow(
                {
                  ...(await E.ipInvoiceRow(sb, data.residentId, x.ip.lines, {
                    billOn: x.billOn,
                    note: ipDifferenceNote(x.name, x.p.date),
                    tenancyEnd: x.e.periodEnd,
                    rent: x.rent,
                    ...(toBed ? { bedId: toBed.bedId, letWhole: !!toBed.letWhole } : {}),
                  })),
                  number: DRAFT,
                },
                x.ip.lines,
              ),
              kind: "initial" as const,
              ...(o.creditApplied > 0 ? { credit_planned: o.creditApplied } : {}),
            }
          : null;
      return {
        name: x.name,
        date: x.p.date,
        billOn: x.billOn,
        rentBefore: x.rentBefore,
        rent: x.rent,
        ip: {
          lines: x.ip.lines.map((l) => ({ label: l.label, amount: l.amount })),
          total: o.ipTotal,
          creditApplied: o.creditApplied,
          balanceDue: o.balanceDue,
          fromEvents: o.fromEvents.map((n) => ({ n: n + 1, name: priced[n]!.name, date: priced[n]!.p.date })),
        },
        invoice,
        adjustment: events[i]!.adjustment,
      };
    }),
  );

  let creditNote: import("@/lib/credit-note-pdf").CreditNoteDoc | null = null;
  if (outlook.leftover > 0.005) {
    const { residentParticulars } = await import("@/lib/checkout.server");
    const who = await residentParticulars(sb, data.residentId);
    const asAt = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    creditNote = {
      number: DRAFT,
      subtitle: CREDIT_NOTE_CATEGORIES.refund.label,
      date: today,
      resident: {
        name: who.name,
        code: who.code,
        residence: [who.residence, who.unit].filter(Boolean).join(" · "),
        room: who.room,
        tenancyStart: who.tenancyStart,
        tenancyEnd: who.tenancyEnd,
      },
      heading: L.accountCredit.toUpperCase(),
      lines: [
        ...outlook.given.map((g) => ({ label: g.label, amount: g.amount })),
        ...shown.filter((e) => e.ip.creditApplied > 0).map((e) => ({ label: L.appliedTo(`${L.initialPayment} - ${e.name}`), amount: -e.ip.creditApplied })),
        ...outlook.credited.map((c) => ({ label: L.appliedTo(c.label), amount: -c.credit })),
      ],
      totalLabel: `Credit not applicable to any invoice as at ${asAt}`,
      resultLabel: "REFUND TO THE RESIDENT",
      notes: `Draft. To be issued through Payables. The amount is confirmed on the date of issue.`,
    };
  }

  // what Confirm agrees to: these figures, from this credit and these invoices
  const key = hashKey(
    JSON.stringify({
      e: priced.map((x) => [x.p.date, x.rentBefore, x.rent, x.ip.lines, x.d.reclassified.map((r) => [r.key, r.amount])]),
      balance,
      t: targets.map((t) => [t.kind === "rent" ? t.date : t.id, t.owing]),
      left: outlook.leftover,
    }),
  );
  return {
    key,
    asAt: today,
    events: shown,
    credit: {
      given: outlook.given.map((g) => ({ label: g.label, amount: g.amount, event: g.event })),
      totalGiven: outlook.totalGiven,
      credited: outlook.credited.map((c) => ({ label: c.label, kind: c.kind, owing: c.owing, credit: c.credit, after: c.after })),
      leftover: outlook.leftover,
      onward,
    },
    creditNote,
  };
}

/** a short fingerprint of the figures - FNV-1a */
function hashKey(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

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
    const { officialStay, rentInForce } = await import("@/lib/tenancy-facts.server");
    const stay = await officialStay(sb, { residentId: data.residentId });
    const now = await rentInForce(sb, data.residentId, stay.tenancyId, klToday());
    const rentToday = now.hasSchedule ? now.rent : 0;
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
          approvedBy: e.approvedBy ?? "",
          at: e.at,
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

function fmtDay(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
