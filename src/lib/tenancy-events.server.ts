import { klToday } from "@/lib/kl-date";
import type { ChangeFlags, DocumentPlan } from "@/lib/tenancy-change";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Update Tenancy's events, after confirm (agreed 7 Oct 2026; scheduled vs
 * effective from the 7 Oct review). An event moves through three states:
 *
 *   SCHEDULED  made on confirm. Its IP exists (scheduled, billed 14 days
 *              before), nothing about the tenancy has changed yet
 *   SETTLED    its IP is paid in full, covered by account credit, or it has
 *              none. Its documents are made, and the rent changes from its
 *              date: the scheduled Rental Payments (RP) are made again, an RP
 *              already billed gets an RP adjustment (higher) or account
 *              credit (lower)
 *   EFFECTIVE  its date has come, and it is settled: the bed moves and the
 *              tenancy's end date changes
 *
 * Events of one request settle in order - the renewal waits for the room
 * change before it, so it starts from the room the resident is in.
 *
 * Run by: confirm, Record payment, account credit, every read of billing,
 * and the daily job (/api/cron/tenancy-events). Kept beside the resident's
 * documents, so neither database needs a change:
 *   tenancy-change/<resident>/events.json   every event, with its state
 *   tenancy-change/events-index.json        residents with an event not yet effective
 *
 * Server only - each is handed the service-role client.
 */
const BUCKET = "resident-documents";
const r2 = (n: number) => Math.round(n * 100) / 100;
const day = (v: unknown) => String(v ?? "").slice(0, 10);

export type MoveTo = {
  bedId: string;
  roomId: string;
  unitId: string;
  occupancy: string;
  /** a twin room nobody is in, let whole as one single (roomOffer "whole") - place_stay's p_whole (14 Oct 2026) */
  letWhole?: boolean | undefined;
};

export type TenancyEvent = {
  eventId: string;
  /** the request it belongs to - events of one request settle in order */
  requestId: string;
  /** who approved starting it (14 Oct 2026) - older events have none */
  approvedBy?: string;
  name: string;
  /** yyyy-mm-dd - the effective date */
  date: string;
  flags: ChangeFlags;
  tenancyId: string;
  rentBefore: number;
  rent: number;
  /** the tenancy's end once this event is effective */
  periodEnd: string;
  /** the bed it moves to */
  moveTo?: MoveTo;
  invoiceId?: string;
  invoiceNumber?: string;
  billOn?: string;
  ipTotal: number;
  plan: DocumentPlan;
  mergeValues: Record<string, string>;
  /** the agreement a revised schedule belongs to, fixed on confirm */
  agreementId?: string;
  /** the second agreement a renewal made - it stays while the event does (14 Oct 2026) */
  madeAgreementId?: string;
  at: string;
  settledAt?: string;
  effectiveAt?: string;
  /** effective date passed, but the bed is still someone else's */
  waitingFor?: string;
  /** the target bed held for this event on confirm - released if it is cancelled */
  reservedBed?: string;
  /** the effective date came while the IP was unpaid (7 Oct 2026 rule) */
  overdue?: boolean;
  /** paid after its date: nothing is backdated - admin confirms a new effective date first */
  needsDate?: boolean;
  dateConfirmedAt?: string;
  /** settling, step by step - a failure part-way is picked up where it stopped, never done twice */
  rentApplied?: boolean;
  docsMade?: boolean;
  /** the rent schedule's end before and after settling - lengthened or shortened */
  scheduleEnd?: { from: string; to: string };
  /** what settling did to rent already billed */
  adjustment?: string;
  credit?: number;
  /** cancelled before its date - kept, never deleted (cancellation rule, 7 Oct 2026) */
  cancelled?: {
    at: string;
    reason: string;
    approvedBy: string;
    /** money paid on its IP (or RP adjustment), moved to account credit */
    toCredit: number;
    /** cancelled because an earlier event of the same request was */
    withEvent?: string;
  };
};

const eventsPath = (residentId: string) => `tenancy-change/${residentId}/events.json`;
const INDEX = "tenancy-change/events-index.json";

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
  if (error) throw new Error(`Could not save the tenancy change: ${error.message}`);
}

export async function readEvents(sb: any, residentId: string): Promise<TenancyEvent[]> {
  return (await readJson<TenancyEvent[]>(sb, eventsPath(residentId))) ?? [];
}

async function writeEvents(sb: any, residentId: string, list: TenancyEvent[]) {
  await writeJson(sb, eventsPath(residentId), list);
  const index = (await readJson<string[]>(sb, INDEX)) ?? [];
  const open = list.some((e) => !e.effectiveAt && !e.cancelled);
  if (open && !index.includes(residentId)) await writeJson(sb, INDEX, [...index, residentId]);
  if (!open && index.includes(residentId)) await writeJson(sb, INDEX, index.filter((i) => i !== residentId));
}

export async function addEvents(sb: any, residentId: string, events: TenancyEvent[]) {
  await writeEvents(sb, residentId, [...(await readEvents(sb, residentId)), ...events]);
}

export const isOpen = (e: TenancyEvent) => !e.effectiveAt && !e.cancelled;

export async function settled(sb: any, invoiceId: string) {
  const { data: inv } = await sb.from("invoices").select("total, status").eq("id", invoiceId).maybeSingle();
  if (!inv || inv.status === "void") return false;
  const { data: pays } = await sb.from("payments").select("amount").eq("invoice_id", invoiceId);
  const paid = ((pays ?? []) as any[]).reduce((n, p) => n + Number(p.amount || 0), 0);
  return paid + 0.005 >= Number(inv.total || 0);
}

// one resident at a time: settling rebuilds rent, which reads billing, which runs this again
const running = new Set<string>();

/** what moving the events on did - said to admin after a payment (Dani, 7 Oct 2026) */
export type EventOutcome = {
  name: string;
  date: string;
  /** settled now: documents made, rent changed from its date */
  settled: boolean;
  /** effective now: bed moved, end date changed */
  effective: boolean;
  documents: string[];
  scheduleEnd?: { from: string; to: string };
  rentBefore: number;
  rent: number;
};

/** Move every event of the resident on as far as it can go; says what moved. */
export async function processResident(sb: any, residentId: string): Promise<EventOutcome[]> {
  if (running.has(residentId)) return [];
  running.add(residentId);
  const outcomes: EventOutcome[] = [];
  const say = async (ev: TenancyEvent, settled: boolean, effective: boolean) => {
    const { documentNames } = await import("@/lib/tenancy-change");
    outcomes.push({ name: ev.name, date: ev.date, settled, effective, documents: documentNames(ev.plan), ...(ev.scheduleEnd ? { scheduleEnd: ev.scheduleEnd } : {}), rentBefore: ev.rentBefore, rent: ev.rent });
  };
  try {
    const list = await readEvents(sb, residentId);
    if (!list.some(isOpen)) return [];
    const today = klToday();
    let changed = false;
    for (const [i, ev] of list.entries()) {
      if (ev.cancelled) continue;
      // the event before it in the same request settles first
      const before = list.slice(0, i).filter((e) => e.requestId === ev.requestId && !e.cancelled);
      if (!ev.settledAt) {
        if (before.some((e) => !e.settledAt)) continue;
        const paid = !ev.invoiceId || (await settled(sb, ev.invoiceId));
        // the date came and the IP is not fully paid: nothing moves, nothing is backdated
        if (!paid) {
          if (ev.date <= today && !ev.overdue) {
            ev.overdue = true;
            changed = true;
          }
          continue;
        }
        // paid after its date: admin confirms a new effective date before anything happens
        if (ev.overdue && !ev.dateConfirmedAt) {
          if (!ev.needsDate) {
            ev.needsDate = true;
            changed = true;
          }
          continue;
        }
        try {
          await settle(sb, residentId, ev);
        } finally {
          // whatever part of it was done is kept
          await writeEvents(sb, residentId, list);
        }
        changed = true;
        await say(ev, true, false);
      }
      if (ev.settledAt && !ev.effectiveAt && ev.date <= today && !before.some((e) => !e.effectiveAt)) {
        if (await makeEffective(sb, residentId, ev)) {
          changed = true;
          if (ev.effectiveAt) {
            const o = outcomes.find((x) => x.date === ev.date && x.name === ev.name);
            if (o) o.effective = true;
            else await say(ev, false, true);
          }
        }
      }
    }
    if (changed) await writeEvents(sb, residentId, list);
    return outcomes;
  } finally {
    running.delete(residentId);
  }
}

/** every resident with an event not yet effective - the daily job, and every read of billing */
export async function processAllEvents(sb: any) {
  const index = (await readJson<string[]>(sb, INDEX)) ?? [];
  for (const id of index) {
    try {
      await processResident(sb, id);
    } catch (err) {
      console.warn(`tenancy events ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/* ------------------------------------------------------------------ settle */

const fmtDay = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

/** the IP is settled: the documents, and the rent from the event's day */
async function settle(sb: any, residentId: string, ev: TenancyEvent) {
  if (!ev.rentApplied) {
    await applyRent(sb, residentId, ev);
    ev.rentApplied = true;
  }
  if (!ev.docsMade) {
    await makeDocuments(sb, residentId, ev);
    ev.docsMade = true;
  }
  ev.settledAt = new Date().toISOString();
}

/** the rent from the event's day: the steps, the rent terms, the scheduled RPs, and rent already billed */
async function applyRent(sb: any, residentId: string, ev: TenancyEvent) {
  const rs = await import("@/lib/rent-schedule.server");
  const { billedDifference, shiftDate } = await import("@/lib/rental-schedule");
  const saved = await rs.readRentSteps(sb, residentId, ev.tenancyId);
  const steps = saved.steps.filter((s) => s.id !== ev.eventId);

  if (Math.abs(ev.rent - ev.rentBefore) > 0.005 && ev.rent > 0) {
    const step = {
      id: ev.eventId,
      from: ev.date,
      oldRent: ev.rentBefore,
      newRent: ev.rent,
      kind: (ev.flags.date === "renewal" ? "renewal" : ev.flags.room || ev.flags.occupancy ? "room" : "extension") as "room" | "renewal" | "extension",
    };
    steps.push(step);
    // the days already billed at the old rent: billed RPs, and the advance months of the move-in invoice
    const { data: billedRows } = await sb
      .from("invoices")
      .select("period_start, period_end")
      .eq("tenancy_id", ev.tenancyId)
      .eq("invoice_type", "rental")
      .not("status", "in", "(scheduled,void)")
      .gte("period_end", ev.date);
    const spans = ((billedRows ?? []) as any[]).map((r) => ({ start: day(r.period_start), end: day(r.period_end) }));
    const { data: sched } = await sb.from("rental_schedules").select("first_period_start").eq("tenancy_id", ev.tenancyId).maybeSingle();
    const { data: ten } = await sb.from("tenancies").select("start_date").eq("id", ev.tenancyId).maybeSingle();
    const firstRent = day(sched?.first_period_start);
    if (firstRent && day(ten?.start_date) && ev.date < firstRent) spans.push({ start: day(ten?.start_date), end: shiftDate(firstRent, { days: -1 }) });
    const diff = r2(spans.reduce((n, s) => n + billedDifference(s, step), 0));
    const lastEnd = spans.map((s) => s.end).sort().at(-1) ?? "";
    if (diff > 0 && !ev.adjustment) {
      // never the billed RP itself: an RP adjustment for the difference (agreed 7 Oct 2026)
      const inv = await raiseAdjustment(sb, residentId, ev.tenancyId, {
        label: `Rent adjustment ${fmtDay(ev.date)} – ${fmtDay(lastEnd)} (RM ${ev.rent.toLocaleString("en-MY")} a month instead of RM ${ev.rentBefore.toLocaleString("en-MY")}, pro-rated by day)`,
        amount: diff,
      });
      ev.adjustment = inv.number;
    } else if (diff < 0 && !ev.credit) {
      const { addCredit } = await import("@/lib/account-credit.server");
      await addCredit(sb, residentId, [{ amount: -diff, kind: "rent", reason: `Rent difference ${fmtDay(ev.date)} – ${fmtDay(lastEnd)}, already billed - ${ev.name.toLowerCase()}`, eventId: ev.eventId }]);
      ev.credit = -diff;
    }
  }

  // the room this event moves to, from its day - the rent rows name it (RentMove)
  const moves = (saved.moves ?? []).filter((m) => m.id !== ev.eventId);
  if (ev.moveTo) moves.push({ id: ev.eventId, from: ev.date, bedId: ev.moveTo.bedId, letWhole: !!ev.moveTo.letWhole });
  await rs.writeRentSteps(sb, residentId, ev.tenancyId, { steps, moves });
  // the rent terms run to the new end, at the latest rent; the scheduled RPs follow
  const { data: s } = await sb.from("rental_schedules").select("tenancy_end").eq("tenancy_id", ev.tenancyId).maybeSingle();
  if (s) {
    const last = [...steps].sort((a, b) => a.from.localeCompare(b.from)).at(-1);
    const end = day(s.tenancy_end) > ev.periodEnd ? day(s.tenancy_end) : ev.periodEnd;
    if (end !== day(s.tenancy_end)) ev.scheduleEnd = { from: day(s.tenancy_end), to: end };
    const { error } = await sb
      .from("rental_schedules")
      .update({ tenancy_end: end, ...(last ? { monthly_rent: last.newRent } : {}), updated_at: new Date().toISOString() })
      .eq("tenancy_id", ev.tenancyId);
    if (error) throw new Error(error.message);
    await rs.syncScheduledRent(sb, ev.tenancyId);
  }
}

/** each document once: a new agreement, or a revised Schedule A / C; and the access card form */
async function makeDocuments(sb: any, residentId: string, ev0: TenancyEvent) {
  const { renewAgreementWith, reviseScheduleWith } = await import("@/lib/tenancy-docs.functions");
  const ev = { ...ev0, mergeValues: await eventMergeValues(sb, residentId, ev0) };
  if (ev.plan.newAgreement) {
    const made = await renewAgreementWith(sb, { residentId, tenancyId: ev.tenancyId, mergeValues: ev.mergeValues, periodStart: ev.date, periodEnd: ev.periodEnd });
    ev0.madeAgreementId = made.agreementId;
  } else if (ev.plan.scheduleA || ev.plan.scheduleC) {
    // fixed on confirm - a renewal earlier in the request leaves its own agreement as the latest
    const { data: latest } = ev.agreementId
      ? { data: null }
      : await sb.from("tenancy_agreements").select("id").eq("resident_id", residentId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const agreementId = ev.agreementId || latest?.id;
    if (agreementId) {
      if (ev.plan.scheduleA) await reviseScheduleWith(sb, { agreementId, docType: "sched_a", mergeValues: ev.mergeValues, periodEnd: ev.periodEnd });
      if (ev.plan.scheduleC) await reviseScheduleWith(sb, { agreementId, docType: "sched_c", mergeValues: ev.mergeValues });
    }
  }
  if (ev.plan.accessCard) {
    const { makeCardForm } = await import("@/lib/access-card.functions");
    await makeCardForm(sb, residentId, "Unit Change");
  }
}

/** an event's document values - made on settling, and made again (regenerateEventAgreement) */
async function eventMergeValues(sb: any, residentId: string, ev0: TenancyEvent) {
  /*
   * The documents' values, built like the first pack's: every placeholder through
   * its mapping, with this event's bed, dates and rent (10 Oct 2026). What the
   * last version said for itself (ticks, typed fields) is kept.
   */
  const { data: lastAg } = await sb.from("tenancy_agreements").select("id").eq("resident_id", residentId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: lastDocs } = lastAg
    ? await sb.from("agreement_documents").select("merge_values, version").eq("agreement_id", lastAg.id).order("version", { ascending: true })
    : { data: [] };
  const previous: Record<string, string> = Object.assign({}, ...((lastDocs ?? []) as any[]).map((d) => d.merge_values ?? {}));
  const { eventDocumentValues } = await import("@/lib/templates.functions");
  const mapped = await eventDocumentValues(
    sb,
    residentId,
    {
      bedId: ev0.moveTo?.bedId,
      // a twin room let whole is a single in Schedule A, as sold (14 Oct 2026)
      ...(ev0.moveTo ? { letWhole: !!ev0.moveTo.letWhole } : {}),
      // a renewal starts a new term on its date; an extension keeps the start it had
      ...(ev0.plan.newAgreement ? { start: ev0.date } : {}),
      end: ev0.periodEnd,
      rent: ev0.rent,
    },
    previous,
  );
  // a revised schedule takes effect on the event's date, not the date the first one did
  const { fmtTemplateDate } = await import("@/lib/template-fields");
  for (const k of Object.keys(mapped)) if (/^(schedule_a_effective_date|effective_date)$/i.test(k)) mapped[k] = fmtTemplateDate(ev0.date);
  return { ...ev0.mergeValues, ...mapped };
}

/**
 * The second agreement a renewal made, made again from its event (Dani, 14 Oct
 * 2026): the same agreement and Agreement No., its unsigned documents replaced
 * - after a template changed, say. It belongs to the event: never deleted while
 * the event stands (resetDocumentPack refuses it); cancelling the event is what
 * takes it away.
 */
export async function regenerateEventAgreement(sb: any, agreementId: string) {
  const { data: ag } = await sb.from("tenancy_agreements").select("id, resident_id, kind, created_at").eq("id", agreementId).maybeSingle();
  if (!ag) throw new Error("This agreement no longer exists.");
  if (ag.kind !== "renewal") throw new Error("Only an agreement made by Update Tenancy is made again here.");
  const residentId = String(ag.resident_id);
  const list = await readEvents(sb, residentId);
  // the event that made it - recorded since 14 Oct 2026; before, the last renewal confirmed before it was made
  const ev =
    list.find((e) => e.madeAgreementId === agreementId) ??
    list
      .filter((e) => e.plan.newAgreement && e.docsMade && !e.madeAgreementId && e.at <= String(ag.created_at))
      .sort((a, b) => a.at.localeCompare(b.at))
      .at(-1);
  if (!ev) throw new Error("The Update Tenancy change that made this agreement was not found.");
  if (ev.cancelled) throw new Error("The change that made this agreement was cancelled.");
  const { renewAgreementWith } = await import("@/lib/tenancy-docs.functions");
  const made = await renewAgreementWith(sb, {
    residentId,
    agreementId,
    tenancyId: ev.tenancyId,
    mergeValues: await eventMergeValues(sb, residentId, ev),
    periodStart: ev.date,
    periodEnd: ev.periodEnd,
  });
  if (!ev.madeAgreementId) {
    ev.madeAgreementId = agreementId;
    await writeEvents(sb, residentId, list);
  }
  return made;
}

/* --------------------------------------------------------------- effective */

/** the day has come: the bed moves, and the end date changes */
export async function makeEffective(
  sb: any,
  residentId: string,
  ev: TenancyEvent,
): Promise<boolean> {
  if (ev.moveTo) {
    const { data: target } = await sb.from("beds").select("id, resident_id, resident_name").eq("id", ev.moveTo.bedId).maybeSingle();
    if (!target) return false;
    // someone is still in it: the move waits for their checkout
    if (target.resident_id && target.resident_id !== residentId) {
      const waiting = String(target.resident_name || "the occupant");
      if (ev.waitingFor === waiting) return false;
      ev.waitingFor = waiting;
      return true;
    }
    // a hold made before 14 Oct 2026 sits on the bed row and would stand in their own way
    if (ev.reservedBed) await releaseLegacyHold(sb, ev.reservedBed);
    /*
     * The move is place_stay, like every other placement (14 Oct 2026): checked
     * under the unit's lock; their tenancy names the new bed and the room they
     * leave is kept in placement_moves; Occupied goes with them; the next paid
     * stay on the bed they leave takes it; the room held for them is let go.
     */
    const { data: placed, error } = await sb.rpc("place_stay", {
      p_enquiry: null,
      p_resident: residentId,
      p_bed: ev.moveTo.bedId,
      p_start: ev.date,
      p_end: ev.periodEnd,
      // a twin room let whole: the tenancy records it (let_whole), and its other bed is Sold as single
      p_whole: !!ev.moveTo.letWhole,
      p_by: "Update Tenancy",
    });
    if (error) throw new Error(error.message);
    if (!placed?.ok) {
      const waiting = String(placed?.detail || placed?.error || "the room");
      if (ev.waitingFor === waiting) return false;
      ev.waitingFor = waiting;
      return true;
    }
    // the rent the bed records is the one in force
    if (ev.rent > 0) await sb.from("beds").update({ rent: ev.rent }).eq("resident_id", residentId);
    delete ev.waitingFor;
  } else if (ev.rent > 0) {
    // the rent the bed records is the one in force
    await sb.from("beds").update({ rent: ev.rent }).eq("resident_id", residentId);
  }
  if (ev.flags.date !== "none") {
    // the tenancy runs to its new end, checked under the unit's lock, and the room held on
    // for those days is let go - one step (extend_stay, 14 Oct 2026)
    const { data: out, error } = await sb.rpc("extend_stay", {
      p_resident: residentId,
      p_tenancy: ev.tenancyId,
      p_end: ev.periodEnd,
    });
    if (error) throw new Error(error.message);
    if (!(out as any)?.ok)
      throw new Error(
        String((out as any)?.detail || (out as any)?.error || "The tenancy could not be extended."),
      );
  }
  ev.effectiveAt = new Date().toISOString();
  return true;
}

/* ---------------------------------------------------------------- invoices */

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

/** what an IP is for: its billing day and note, the stay after it, and the bed it moves to (none: theirs now) */
export type IpOptions = {
  billOn: string;
  note: string;
  tenancyEnd: string;
  rent: number;
  bedId?: string | undefined;
  letWhole?: boolean | undefined;
};

/**
 * The Initial Payment invoice raiseIp writes, before it is written - so the
 * room-change review's draft is the row Confirm inserts (14 Oct 2026).
 */
export async function ipInvoiceRow(
  sb: any,
  residentId: string,
  lines: { label: string; amount: number; kind: string }[],
  o: IpOptions,
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
  // where it is for, as sold: the bed it moves to, else theirs now (invoicePlace, 14 Oct 2026)
  const { invoicePlace, residentInvoicePlace } = await import("@/lib/placement.server");
  const place = o.bedId ? await invoicePlace(sb, o.bedId, o.letWhole) : await residentInvoicePlace(sb, residentId);
  return {
    ...(first ?? {}),
    ...(place ?? {}),
    ...(o.tenancyEnd ? { tenancy_end: o.tenancyEnd } : {}),
    ...(o.rent ? { monthly_rent: o.rent } : {}),
    invoice_type: "initial",
    bill_on: o.billOn,
    invoice_date: o.billOn,
    payment_terms: "NET7",
    issued_at: new Date(`${o.billOn}T00:00:00Z`).toISOString(),
    total,
    deposits_total: lines.filter((l) => l.kind === "refundable").reduce((n, l) => n + l.amount, 0),
    notes: o.note,
  };
}

/**
 * An event's IP, beside the move-in one (agreed 7 Oct 2026): made now as a
 * scheduled invoice - listed on Payments with its amount fixed - and billed on
 * its day, 14 days before the event. A day already passed bills it now.
 */
export async function raiseIp(
  sb: any,
  residentId: string,
  tenancyId: string,
  lines: { label: string; amount: number; kind: string }[],
  o: IpOptions,
) {
  const id = crypto.randomUUID();
  const { error } = await sb.from("invoices").insert({
    ...(await ipInvoiceRow(sb, residentId, lines, o)),
    id,
    // a placeholder: the number is given when it is billed
    number: `SCH-${id}`,
    status: "scheduled",
    auto_scheduled: false,
    resident_id: residentId,
    tenancy_id: tenancyId,
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

/* ---------------------------------------------------------------- deposits */

/**
 * The deposits actually held: the deposit lines of every IP paid in full (the
 * move-in one and each Update Tenancy IP since) - a scheduled or unpaid IP holds
 * nothing yet (7 Oct 2026 review).
 */
export async function settledDepositLines(sb: any, residentId: string) {
  const { data: inv } = await sb
    .from("invoices")
    .select("id, number, total")
    .eq("resident_id", residentId)
    .eq("invoice_type", "initial")
    .neq("status", "void")
    .order("created_at", { ascending: true });
  const all = (inv ?? []) as any[];
  if (!all.length) return [] as { label: string; amount: number; invoiceNumber: string }[];
  const { data: pays } = await sb.from("payments").select("invoice_id, amount").in("invoice_id", all.map((i) => i.id));
  const paid = new Map<string, number>();
  for (const p of (pays ?? []) as any[]) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + Number(p.amount || 0));
  const invoices = all.filter((i) => (paid.get(i.id) ?? 0) + 0.005 >= Number(i.total || 0));
  if (!invoices.length) return [];
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
      amount: r2(Number(i.amount || 0) * Number(i.quantity ?? 1)),
      invoiceNumber: (number.get(i.invoice_id) ?? "").startsWith("SCH-") ? "IP paid in advance" : (number.get(i.invoice_id) ?? ""),
    }));
}

/* ------------------------------------------------------------------ cancel */

/**
 * Cancel an event before its date (Dani's cancellation rule, 7 Oct 2026).
 * Nothing is deleted - statuses change, and the record says why and who:
 *   - its IP is voided; what was paid on it in money becomes account credit
 *     (never a cash refund here - that is done by hand, separately); account
 *     credit used on it is free again
 *   - credit the event gave (a lower deposit, cheaper rent already billed) is
 *     taken back, and a waived difference no longer counts
 *   - settled already: its rent change is undone, its RP adjustment voided
 *     (anything paid on it to credit) and its documents marked cancelled
 *   - the later events of the same request are cancelled with it: they were
 *     priced from it
 * An event already effective cannot be cancelled - that is a new Update Tenancy.
 */
export async function cancelEvent(sb: any, residentId: string, eventId: string, reason: string, approvedBy: string) {
  const list = await readEvents(sb, residentId);
  const ev = list.find((e) => e.eventId === eventId);
  if (!ev) throw new Error("Event not found.");
  if (ev.cancelled) throw new Error("This event is already cancelled.");
  if (ev.effectiveAt) throw new Error("This change has taken effect. Make a new Update Tenancy instead.");
  const at = new Date().toISOString();
  const stamp = new Date(at).toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const later = list.filter((e) => e.requestId === ev.requestId && e.date >= ev.date && e.eventId !== ev.eventId && !e.cancelled);
  if (later.some((e) => e.effectiveAt)) throw new Error("A later part of this request has taken effect. Make a new Update Tenancy instead.");
  const targets = [ev, ...later];
  const { reverseCredit, voidInvoiceToCredit } = await import("@/lib/account-credit.server");

  /**
   * void an invoice, keep it, and move money paid on it to credit - one locked
   * step in the database (16 Oct 2026): a payment saved at the same moment is
   * either counted or refused, and the credit is given once however often this runs
   */
  const voidInvoice = (invoiceId: string, what: string) =>
    voidInvoiceToCredit(sb, residentId, {
      invoiceId,
      note: `Cancelled: ${reason} · Approved by ${approvedBy} · ${stamp}`,
      what,
      tail: `${ev.name.toLowerCase()} cancelled`,
      eventId: ev.eventId,
    });

  for (const t of targets) {
    let toCredit = 0;
    if (t.invoiceId) toCredit += await voidInvoice(t.invoiceId, "IP");
    if (t.adjustment) {
      const { data: adj } = await sb.from("invoices").select("id").eq("resident_id", residentId).eq("number", t.adjustment).maybeSingle();
      if (adj) toCredit += await voidInvoice(adj.id, "RP adjustment");
    }
    if (t.docsMade) await cancelDocuments(sb, residentId, t);
    if (t.reservedBed) await releaseLegacyHold(sb, t.reservedBed);
    // the room held for this part of the change - the new room, or their own held on for a longer stay
    if (t.moveTo) await releaseChangeHold(sb, residentId, t.moveTo.bedId);
    else if (t.flags.date !== "none") {
      const { data: own } = await sb
        .from("beds")
        .select("id")
        .eq("resident_id", residentId)
        .neq("status", "vacant")
        .limit(1)
        .maybeSingle();
      if (own?.id) await releaseChangeHold(sb, residentId, own.id);
    }
    t.cancelled = { at, reason, approvedBy, toCredit, ...(t !== ev ? { withEvent: ev.eventId } : {}) };
  }
  const ids = targets.map((t) => t.eventId);
  await reverseCredit(sb, residentId, ids, `${ev.name} cancelled: ${reason}`);

  // a waived deposit difference of a cancelled event no longer counts as held
  const allowPath = `tenancy-change/${residentId}/allowances.json`;
  const allowances = (await readJson<{ eventId: string; cancelledAt?: string }[]>(sb, allowPath)) ?? [];
  if (allowances.some((a) => ids.includes(a.eventId))) await writeJson(sb, allowPath, allowances.map((a) => (ids.includes(a.eventId) ? { ...a, cancelledAt: at } : a)));

  // settled already: the rent goes back to what it was
  let scheduleEnd: { from: string; to: string } | null = null;
  if (targets.some((t) => t.rentApplied)) {
    const { data: before } = await sb.from("rental_schedules").select("tenancy_end").eq("tenancy_id", ev.tenancyId).maybeSingle();
    const rs = await import("@/lib/rent-schedule.server");
    const saved = await rs.readRentSteps(sb, residentId, ev.tenancyId);
    const steps = saved.steps.filter((x) => !ids.includes(x.id));
    const moves = (saved.moves ?? []).filter((m) => !ids.includes(m.id));
    await rs.writeRentSteps(sb, residentId, ev.tenancyId, { steps, moves });
    const { data: t } = await sb.from("tenancies").select("end_date").eq("id", ev.tenancyId).maybeSingle();
    const last = [...steps].sort((a, b) => a.from.localeCompare(b.from)).at(-1);
    await sb
      .from("rental_schedules")
      .update({ tenancy_end: day(t?.end_date), monthly_rent: last ? last.newRent : ev.rentBefore, updated_at: at })
      .eq("tenancy_id", ev.tenancyId);
    // scheduled RPs past the old end were made for the cancelled renewal
    await sb.from("invoices").delete().eq("tenancy_id", ev.tenancyId).eq("invoice_type", "rental").eq("status", "scheduled").eq("auto_scheduled", true).gt("period_start", day(t?.end_date));
    await rs.syncScheduledRent(sb, ev.tenancyId);
    if (before && day(before.tenancy_end) !== day(t?.end_date)) scheduleEnd = { from: day(before.tenancy_end), to: day(t?.end_date) };
  }

  await writeEvents(sb, residentId, list);
  await writeJson(sb, `tenancy-change/${residentId}/cancel-${at.replace(/[:.]/g, "-")}.json`, {
    event: ev.eventId,
    with: later.map((e) => e.eventId),
    reason,
    approvedBy,
    at,
    ips: targets.map((t) => t.invoiceId).filter(Boolean),
    toCredit: targets.reduce((n, t) => n + (t.cancelled?.toCredit ?? 0), 0),
    bedReleased: targets.find((t) => t.moveTo)?.moveTo?.bedId ?? null,
  });
  return {
    cancelled: targets.map((t) => t.name),
    toCredit: r2(targets.reduce((n, t) => n + (t.cancelled?.toCredit ?? 0), 0)),
    scheduleEnd,
    documentsCancelled: targets.some((t) => t.docsMade),
  };
}

/** the documents an event made, marked cancelled - kept, and the version before is current again */
async function cancelDocuments(sb: any, residentId: string, ev: TenancyEvent) {
  const from = ev.settledAt ? new Date(new Date(ev.settledAt).getTime() - 10 * 60_000).toISOString() : ev.at;
  if (ev.plan.newAgreement) {
    // the one it made (madeAgreementId, 14 Oct 2026); an older event, any renewal made since it was confirmed
    const { data: ags } = ev.madeAgreementId
      ? { data: [{ id: ev.madeAgreementId }] }
      : await sb.from("tenancy_agreements").select("id").eq("resident_id", residentId).eq("kind", "renewal").gte("created_at", ev.at);
    const ids = ((ags ?? []) as any[]).map((a) => a.id);
    if (ids.length) await sb.from("agreement_documents").update({ status: "cancelled" }).in("agreement_id", ids);
  } else if (ev.agreementId) {
    const types = [...(ev.plan.scheduleA ? ["sched_a"] : []), ...(ev.plan.scheduleC ? ["sched_c"] : [])];
    if (types.length) await sb.from("agreement_documents").update({ status: "cancelled" }).eq("agreement_id", ev.agreementId).in("doc_type", types).gt("version", 1).gte("created_at", from);
  }
  if (ev.plan.accessCard) await sb.from("access_card_forms").update({ status: "cancelled" }).eq("resident_id", residentId).gte("created_at", from).neq("status", "returned");
}

/* ------------------------------------------------------------- reservation */

/** what a reserved bed said on Homes before 14 Oct 2026 - still read, to let such a hold go */
export const reservedLabel = (name: string, date: string) => `${name} - room change from ${date}`;

/**
 * Hold a bed for the resident's change from `start` to `end` (14 Oct 2026):
 * place_stay with p_later, so it is a dated row in placement_holds - checked
 * under the unit's lock against everybody else's dates, and seen by the
 * booking's room picker, Homes and the database rule. It blocks only those
 * dates. Before, the bed row was marked held (no dates, unseen by bookings).
 */
export async function holdForChange(
  sb: any,
  residentId: string,
  bedId: string,
  start: string,
  end: string,
  /** a twin room let whole - its other bed is kept Sold as single (14 Oct 2026) */
  whole = false,
) {
  const { data, error } = await sb.rpc("place_stay", {
    p_enquiry: null,
    p_resident: residentId,
    p_bed: bedId,
    p_start: start || null,
    p_end: end || null,
    p_later: true,
    p_whole: whole,
    p_by: "Update Tenancy",
  });
  if (error) throw new Error(error.message);
  const out = data as { ok: boolean; error?: string; detail?: string };
  return out?.ok
    ? { ok: true as const }
    : {
        ok: false as const,
        detail: String(out?.detail || out?.error || "The room is not free for these dates."),
      };
}

/** Let go of the rooms held for the resident's change - every one, or the one on `bedId`. Nobody else's. */
export async function releaseChangeHold(sb: any, residentId: string, bedId?: string) {
  const { error } = await sb.rpc("release_hold", {
    p_enquiry: null,
    p_resident: residentId,
    p_bed: bedId ?? null,
  });
  if (error) throw new Error(error.message);
}

/** a hold made before 14 Oct 2026 (the bed row marked held) - let go only while it is still that hold */
async function releaseLegacyHold(sb: any, bedId: string) {
  const { data: bed } = await sb.from("beds").select("status, hold_for, resident_id").eq("id", bedId).maybeSingle();
  if (bed?.status === "held" && !bed.resident_id && String(bed.hold_for ?? "").includes(" - room change from ")) {
    await sb.rpc("release_hand_hold", { p_bed: bedId });
  }
}

/**
 * Paid after its date (7 Oct 2026 rule): admin confirms the new effective date,
 * and only then do the documents, the rent (pro-rated from the new date) and
 * the move follow. A move is from today on; a date change keeps its start.
 */
export async function confirmEffectiveDate(sb: any, residentId: string, eventId: string, date: string) {
  const list = await readEvents(sb, residentId);
  const ev = list.find((e) => e.eventId === eventId);
  if (!ev) throw new Error("Event not found.");
  if (!ev.needsDate) throw new Error("This event does not need a new date.");
  const moves = ev.flags.room || ev.flags.occupancy;
  if (moves && date < klToday()) throw new Error("Choose a date from today on.");
  if (!moves && date !== ev.date) throw new Error("An extension or renewal starts the day after the tenancy ends.");
  if (date > ev.periodEnd) throw new Error("The date is after the tenancy ends.");
  ev.date = date;
  ev.needsDate = false;
  ev.dateConfirmedAt = new Date().toISOString();
  await writeEvents(sb, residentId, list);
  return processResident(sb, residentId);
}
