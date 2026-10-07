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

export type MoveTo = { bedId: string; roomId: string; unitId: string; occupancy: string };

export type TenancyEvent = {
  eventId: string;
  /** the request it belongs to - events of one request settle in order */
  requestId: string;
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
  at: string;
  settledAt?: string;
  effectiveAt?: string;
  /** effective date passed, but the bed is still someone else's */
  waitingFor?: string;
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
        if (ev.invoiceId && !(await settled(sb, ev.invoiceId))) continue;
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

  await rs.writeRentSteps(sb, residentId, ev.tenancyId, { steps });
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
async function makeDocuments(sb: any, residentId: string, ev: TenancyEvent) {
  const { renewAgreement, reviseSchedule } = await import("@/lib/tenancy-docs.functions");
  if (ev.plan.newAgreement) {
    await renewAgreement({
      data: { residentId, tenancyId: ev.tenancyId, mergeValues: ev.mergeValues, periodStart: ev.date, periodEnd: ev.periodEnd },
    });
  } else if (ev.plan.scheduleA || ev.plan.scheduleC) {
    // fixed on confirm - a renewal earlier in the request leaves its own agreement as the latest
    const { data: latest } = ev.agreementId
      ? { data: null }
      : await sb.from("tenancy_agreements").select("id").eq("resident_id", residentId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const agreementId = ev.agreementId || latest?.id;
    if (agreementId) {
      if (ev.plan.scheduleA) await reviseSchedule({ data: { agreementId, docType: "sched_a", mergeValues: ev.mergeValues, periodEnd: ev.periodEnd } });
      if (ev.plan.scheduleC) await reviseSchedule({ data: { agreementId, docType: "sched_c", mergeValues: ev.mergeValues } });
    }
  }
  if (ev.plan.accessCard) {
    const { makeCardForm } = await import("@/lib/access-card.functions");
    await makeCardForm(sb, residentId, "Unit Change");
  }
}

/* --------------------------------------------------------------- effective */

const VACANT = {
  status: "vacant",
  resident_id: null,
  resident_name: null,
  student_id: null,
  university: null,
  nationality: null,
  gender: null,
  hold_for: null,
  hold_until: null,
  tenancy_start: null,
  tenancy_end: null,
  rent: null,
  enquiry_id: null,
};

/** the day has come: the bed moves, and the end date changes */
async function makeEffective(sb: any, residentId: string, ev: TenancyEvent): Promise<boolean> {
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
    const { data: old } = await sb.from("beds").select("*").eq("resident_id", residentId).neq("id", ev.moveTo.bedId).maybeSingle();
    const { error } = await sb
      .from("beds")
      .update({
        status: "booked",
        resident_id: residentId,
        resident_name: old?.resident_name ?? null,
        student_id: old?.student_id ?? null,
        university: old?.university ?? null,
        nationality: old?.nationality ?? null,
        gender: old?.gender ?? null,
        tenancy_start: old?.tenancy_start ?? null,
        tenancy_end: old?.tenancy_end ?? null,
        rent: ev.rent || old?.rent || null,
        hold_for: null,
        hold_until: null,
      })
      .eq("id", ev.moveTo.bedId);
    if (error) throw new Error(error.message);
    if (old) {
      await sb.from("beds").update(VACANT).eq("id", old.id);
      // the other bed of a room sold whole as a single is freed with it
      await sb.from("beds").update(VACANT).eq("room_id", old.room_id).eq("hold_for", "Sold as single");
    }
    delete ev.waitingFor;
  } else if (ev.rent > 0) {
    // the rent the bed records is the one in force
    await sb.from("beds").update({ rent: ev.rent }).eq("resident_id", residentId);
  }
  if (ev.flags.date !== "none") {
    const { data: t } = await sb.from("tenancies").select("end_date").eq("id", ev.tenancyId).maybeSingle();
    if (t && day(t.end_date) < ev.periodEnd) await sb.from("tenancies").update({ end_date: ev.periodEnd }).eq("id", ev.tenancyId);
    await sb.from("beds").update({ tenancy_end: ev.periodEnd }).eq("resident_id", residentId);
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
  const { addCredit, reverseCredit, CREDIT_METHOD } = await import("@/lib/account-credit.server");

  /** void an invoice, keep it, and move money paid on it to credit */
  const voidInvoice = async (invoiceId: string, what: string) => {
    const { data: inv } = await sb.from("invoices").select("id, number, notes, status").eq("id", invoiceId).maybeSingle();
    if (!inv || inv.status === "void") return 0;
    const { data: pays } = await sb.from("payments").select("amount, method").eq("invoice_id", invoiceId);
    const cash = r2(((pays ?? []) as any[]).filter((p) => p.method !== CREDIT_METHOD).reduce((n, p) => n + Number(p.amount || 0), 0));
    const note = `Cancelled: ${reason} · Approved by ${approvedBy} · ${stamp}${cash ? ` · RM ${cash.toFixed(2)} moved to account credit` : ""}`;
    const { error } = await sb
      .from("invoices")
      .update({ status: "void", notes: [String(inv.notes ?? ""), note].filter(Boolean).join(" | "), updated_at: at })
      .eq("id", invoiceId);
    if (error) throw new Error(error.message);
    if (cash > 0)
      await addCredit(sb, residentId, [{ amount: cash, kind: "cancel", reason: `Paid on ${what} ${String(inv.number).startsWith("SCH-") ? "(not billed yet)" : inv.number} - ${ev.name.toLowerCase()} cancelled`, eventId: ev.eventId }]);
    return cash;
  };

  for (const t of targets) {
    let toCredit = 0;
    if (t.invoiceId) toCredit += await voidInvoice(t.invoiceId, "IP");
    if (t.adjustment) {
      const { data: adj } = await sb.from("invoices").select("id").eq("resident_id", residentId).eq("number", t.adjustment).maybeSingle();
      if (adj) toCredit += await voidInvoice(adj.id, "RP adjustment");
    }
    if (t.docsMade) await cancelDocuments(sb, residentId, t);
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
    await rs.writeRentSteps(sb, residentId, ev.tenancyId, { steps });
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
    const { data: ags } = await sb.from("tenancy_agreements").select("id").eq("resident_id", residentId).eq("kind", "renewal").gte("created_at", ev.at);
    const ids = ((ags ?? []) as any[]).map((a) => a.id);
    if (ids.length) await sb.from("agreement_documents").update({ status: "cancelled" }).in("agreement_id", ids);
  } else if (ev.agreementId) {
    const types = [...(ev.plan.scheduleA ? ["sched_a"] : []), ...(ev.plan.scheduleC ? ["sched_c"] : [])];
    if (types.length) await sb.from("agreement_documents").update({ status: "cancelled" }).eq("agreement_id", ev.agreementId).in("doc_type", types).gt("version", 1).gte("created_at", from);
  }
  if (ev.plan.accessCard) await sb.from("access_card_forms").update({ status: "cancelled" }).eq("resident_id", residentId).gte("created_at", from).neq("status", "returned");
}
