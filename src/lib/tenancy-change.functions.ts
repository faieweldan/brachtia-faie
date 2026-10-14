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
});
export type TenancyChangeRequest = z.infer<typeof changeRequest>;

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
export async function applyTenancyChangeWith(sb: any, data: TenancyChangeRequest) {
  const T = await import("@/lib/tenancy-change");
  const E = await import("@/lib/tenancy-events.server");
  const flags = T.changeFlags(data.change);
  // who decided it - a staff member, the same list a cancellation is approved from
  const { STAFF } = await import("@/data/form-options");
  if (!STAFF.includes(data.approvedBy)) throw new Error("Choose who approved the change.");
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
  const { addCredit, applyAccountCredit } = await import("@/lib/account-credit.server");
  const { shiftDate } = await import("@/lib/rental-schedule");
  // the rent in force the day before the first event: the rent terms with their changes
  let rent = (
    await rentInForce(sb, data.residentId, data.tenancyId, shiftDate(plan[0]!.date, { days: -1 }))
  ).rent;
  let heldDeposits = await heldNow(sb, data.residentId);
  const requestId = crypto.randomUUID().slice(0, 8);
  const allowances = (await readJson<Allowance[]>(sb, allowancePath(data.residentId))) ?? [];
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
    const holds: { bedId: string; start: string; end: string }[] = [];
    if (live?.id && finalEnd > data.change.oldEnd) {
      const from = T.nextDay(data.change.oldEnd);
      const until = T.isMove(flags) && data.moveOn ? dayBefore(data.moveOn) : finalEnd;
      if (until >= from) holds.push({ bedId: String(live.id), start: from, end: until });
    }
    if (T.isMove(flags) && data.moveTo)
      holds.push({ bedId: data.moveTo.bedId, start: data.moveOn, end: finalEnd });
    for (const h of holds) {
      const r = await E.holdForChange(sb, data.residentId, h.bedId, h.start, h.end);
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
          roomName: e.roomName,
          occupancy: e.occupancy,
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
