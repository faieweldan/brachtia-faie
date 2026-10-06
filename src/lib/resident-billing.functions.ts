import { createServerFn } from "@tanstack/react-start";

import { billDueInvoices, discountLabel, lineQty, liveInvoices } from "@/lib/invoices";
import type { InvoiceDoc } from "@/lib/invoice-pdf";
import { DOC_BUCKET, DOC_MIME_TYPES, MAX_DOC_BYTES, safeExt } from "@/lib/resident-documents";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A resident's money, grouped the way an admin thinks about it rather than the
 * way it is stored.
 *
 * Invoices, payments and receipts already exist from the booking flow and carry
 * a resident_id, so nothing new is recorded here - this reads what is there and
 * arranges it into four things: what they paid to move in, their rent, one-off
 * charges, and checkout.
 */

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type BillingInvoice = {
  id: string;
  number: string;
  type: "initial" | "rental" | "charge" | "checkout";
  status: string;
  /** rent made ahead: listed, not owed, no number until it is billed */
  scheduled: boolean;
  /** the day a scheduled invoice is billed */
  billOn: string;
  /** a scheduled invoice admin has changed - the schedule leaves it as it is */
  edited: boolean;
  issuedAt: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  /** the tenancy a rent invoice was issued for; empty for older invoices */
  tenancyId: string;
  total: number;
  paid: number;
  outstanding: number;
  /** paid beyond the total. Money we are holding that nobody has decided about. */
  credit: number;
  depositsHeld: number;
  items: { label: string; kind: string; amount: number; quantity: number }[];
  payments: {
    id: string;
    amount: number;
    paidOn: string;
    method: string;
    reference: string;
    proofPath: string;
    /** what the money was for - "Booking fee" */
    description: string;
    /** who recorded it; "" before 1 Oct 2026 */
    recordedBy: string;
  }[];
  receipts: {
    number: string;
    amount: number;
    issuedAt: string;
    paymentId: string;
    balanceAfter: number;
    /** older receipts have none */
    paidToDate: number | null;
  }[];
  /** the invoice as its PDF shows it */
  doc: InvoiceDoc;
};

export type ResidentBilling = {
  billed: number;
  collected: number;
  outstanding: number;
  credit: number;
  monthlyRent: number;
  paymentFrequency: string;
  nextDue: string;
  depositsHeld: number;
  groups: {
    initial: BillingInvoice[];
    rental: BillingInvoice[];
    charge: BillingInvoice[];
    checkout: BillingInvoice[];
  };
  /** rent invoices not billed yet, soonest first - in no total */
  scheduled: BillingInvoice[];
};

const num = (v: unknown) => Number(v ?? 0) || 0;

/**
 * How many of a line item there are. Never none and never a fraction of one, so
 * a missing or broken value is one of the thing rather than nothing at all -
 * which is also what every row written before the column existed means.
 */

/** The heading an invoice's PDF carries, by what it is for. */
const HEADINGS = { rental: "Rental", charge: "Charges", checkout: "Checkout settlement" };

const dayLabel = (iso: string) =>
  new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** A deposit is money held, not earned - it comes back at checkout. */
const isDeposit = (kind: string, label: string) => /deposit/i.test(kind) || /deposit/i.test(label);

/**
 * When an invoice falls due: its date plus the days its terms give ("NET15"),
 * or the invoice date itself when the terms name no days.
 */
function dueDateOf(raw: any) {
  const date = String(raw.invoice_date ?? "");
  const days = Number(/NET\s*(\d+)/i.exec(String(raw.payment_terms ?? ""))?.[1] ?? 0);
  if (!date || !days) return date;
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const getResidentBilling = createServerFn({ method: "GET" })
  .inputValidator((data: { residentId: string; quickbooksId?: string }) => data)
  .handler(async ({ data }): Promise<ResidentBilling> => {
    const supabase = await admin();
    const empty: ResidentBilling = {
      billed: 0,
      collected: 0,
      outstanding: 0,
      credit: 0,
      monthlyRent: 0,
      paymentFrequency: "",
      nextDue: "",
      depositsHeld: 0,
      groups: { initial: [], rental: [], charge: [], checkout: [] },
      scheduled: [],
    };

    // billing may be filed under either id, depending on when it was raised
    const ids = [data.residentId, data.quickbooksId].filter(Boolean) as string[];
    if (!ids.length) return empty;

    // rent whose billing day has come is owed from today
    await billDueInvoices(supabase);
    const residentCode = await residentCodeFor(supabase, data.residentId);
    const { data: invoices, error } = await supabase
      .from("invoices")
      .select("*")
      .neq("status", "void")
      .in("resident_id", ids)
      .order("issued_at");
    if (error) throw new Error(error.message);
    if (!invoices?.length) return empty;

    const invoiceIds = invoices.map((i: any) => i.id);
    const [itemsRes, paymentsRes, receiptsRes] = await Promise.all([
      supabase.from("invoice_items").select("*").in("invoice_id", invoiceIds).order("sort_order"),
      supabase.from("payments").select("*").in("invoice_id", invoiceIds).order("paid_on"),
      supabase.from("receipts").select("*").in("invoice_id", invoiceIds).order("issued_at"),
    ]);

    const byInvoice = <T extends { invoice_id: string }>(rows: T[] | null) => {
      const map = new Map<string, T[]>();
      for (const r of rows ?? []) map.set(r.invoice_id, [...(map.get(r.invoice_id) ?? []), r]);
      return map;
    };
    const items = byInvoice(itemsRes.data as any[]);
    const payments = byInvoice(paymentsRes.data as any[]);
    const receipts = byInvoice(receiptsRes.data as any[]);

    const out = {
      ...empty,
      groups: { initial: [], rental: [], charge: [], checkout: [] },
      scheduled: [],
    } as ResidentBilling;

    for (const raw of invoices as any[]) {
      const invoice = toBillingInvoice(
        raw,
        items.get(raw.id) ?? [],
        payments.get(raw.id) ?? [],
        receipts.get(raw.id) ?? [],
        residentCode,
      );

      if (invoice.scheduled) {
        out.scheduled.push(invoice);
        continue;
      }
      out.groups[invoice.type].push(invoice);
      out.billed += invoice.total;
      out.collected += invoice.paid;
      out.credit += invoice.credit;
      out.depositsHeld += invoice.depositsHeld;
      if (!out.monthlyRent) out.monthlyRent = num(raw.monthly_rent);
      if (!out.paymentFrequency) out.paymentFrequency = String(raw.payment_frequency ?? "");
    }

    out.outstanding = Math.max(0, out.billed - out.collected);

    // the soonest unpaid invoice is what the admin needs to chase
    const unpaid = [...out.groups.rental, ...out.groups.charge, ...out.groups.initial]
      .filter((i) => i.outstanding > 0 && i.dueDate)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    out.nextDue = unpaid[0]?.dueDate ?? "";
    out.scheduled.sort((a, b) => a.periodStart.localeCompare(b.periodStart));

    return out;
  });

/* ---------------- every resident at once ---------------- */

export type LedgerInvoice = {
  invoiceId: string;
  number: string;
  type: BillingInvoice["type"];
  /** the invoice's resident_id as stored - a uuid or a QuickBooks id */
  residentRef: string;
  /** the name it was raised in, for a booking that is not a resident yet */
  invoiceName: string;
  enquiryId: string;
  /** rent made ahead, not billed yet - Collections lists it apart and counts it in no total */
  scheduled: boolean;
  /**
   * Voided, and kept as a record. It stays in Collections so that an invoice
   * somebody remembers raising can still be found, but it owes nothing and is
   * counted in no total.
   */
  cancelled: boolean;
  billOn: string;
  /** the invoice's own date - the billing day, for one not billed yet */
  date: string;
  issuedAt: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  total: number;
  paid: number;
  outstanding: number;
  lastPaidOn: string;
};

/**
 * Every invoice - for every resident, and for every booking that is not a
 * resident yet - with what has been paid against it.
 *
 * The Collections page and the residents list both read this (through
 * useBillingLedger, which matches each to its resident), and the resident's own
 * Payments tab reads the same two tables, so "outstanding" means one thing on
 * every page.
 */
export const listBillingLedger = createServerFn({ method: "GET" }).handler(
  async (): Promise<LedgerInvoice[]> => {
    const supabase = await admin();
    await billDueInvoices(supabase);
    const [invoicesRes, paymentsRes] = await Promise.all([
      // scheduled invoices too - marked, so the page can keep them out of what is owed
      /*
       * Cancelled invoices come through here too, which they did not before.
       * Collections is where somebody asks "what happened to that invoice?",
       * and one that has vanished cannot be answered. They arrive owing
       * nothing, and the page counts them in no total.
       *
       * The resident's own Payments tab still leaves them out: that view is
       * what this student owes, and a voided invoice is not part of it.
       */
      supabase.from("invoices").select("*").order("issued_at", { ascending: false }),
      supabase.from("payments").select("invoice_id, amount, paid_on"),
    ]);
    if (invoicesRes.error) throw new Error(invoicesRes.error.message);
    if (paymentsRes.error) throw new Error(paymentsRes.error.message);

    const paid = new Map<string, { sum: number; last: string }>();
    for (const p of (paymentsRes.data ?? []) as any[]) {
      const entry = paid.get(p.invoice_id) ?? { sum: 0, last: "" };
      entry.sum += num(p.amount);
      if (String(p.paid_on ?? "") > entry.last) entry.last = String(p.paid_on);
      paid.set(p.invoice_id, entry);
    }

    return ((invoicesRes.data ?? []) as any[]).map((raw): LedgerInvoice => {
      const total = num(raw.total);
      const got = paid.get(raw.id);
      const type = (["initial", "rental", "charge", "checkout"] as const).includes(raw.invoice_type)
        ? (raw.invoice_type as BillingInvoice["type"])
        : "initial";
      const scheduled = raw.status === "scheduled";
      // voided: listed so it can be found, but it owes nothing from here on
      const cancelled = raw.status === "void";
      return {
        invoiceId: String(raw.id),
        number: scheduled ? "" : String(raw.number ?? ""),
        type,
        residentRef: String(raw.resident_id ?? ""),
        invoiceName: String(raw.full_name ?? ""),
        enquiryId: String(raw.enquiry_id ?? ""),
        scheduled,
        billOn: String(raw.bill_on ?? ""),
        date: scheduled
          ? String(raw.bill_on ?? "")
          : String(raw.invoice_date ?? "") || String(raw.issued_at ?? "").slice(0, 10),
        issuedAt: String(raw.issued_at ?? ""),
        dueDate: dueDateOf(raw),
        periodStart: String(raw.period_start ?? ""),
        periodEnd: String(raw.period_end ?? ""),
        total,
        paid: got?.sum ?? 0,
        // nothing is owed on a cancelled invoice, so no total can pick it up
        outstanding: cancelled ? 0 : Math.max(0, total - (got?.sum ?? 0)),
        cancelled,
        lastPaidOn: got?.last ?? "",
      };
    });
  },
);

/* ---------------- payment proof ---------------- */

/**
 * A payment proof is a bank slip - a name, an account number, an amount - so it
 * goes in the private documents bucket, never the photo bucket the residence
 * pictures are served from, and takes the same files a student's documents do.
 * It is filed under the resident, or under the booking when the student is not
 * a resident yet.
 */
export const uploadPaymentProof = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const { requireAdminSession } = await import("@/lib/admin-session.server");
    await requireAdminSession();

    const file = data.get("file");
    const owner =
      String(data.get("owner") ?? "")
        .replace(/[^a-zA-Z0-9-]/g, "")
        .slice(0, 60) || "unfiled";
    if (!(file instanceof File)) throw new Error("No file provided");
    if (file.size > MAX_DOC_BYTES) throw new Error("That file is larger than 8MB");
    if (file.type && !DOC_MIME_TYPES.includes(file.type)) {
      throw new Error("Please upload a photo or a PDF");
    }

    const path = `${owner}/payment-proof-${Date.now().toString(36)}.${safeExt(file.name, file.type)}`;
    const supabase = await admin();
    const { error } = await supabase.storage
      .from(DOC_BUCKET)
      .upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (error) throw new Error(error.message);
    return { path };
  });

/**
 * A ten-minute link to look at a proof. Proofs saved before this were stored as
 * a photo address, and open as they are.
 */
export const paymentProofUrl = createServerFn({ method: "GET" })
  .inputValidator((data: { path: string }) => data)
  .handler(async ({ data }) => {
    const { requireAdminSession } = await import("@/lib/admin-session.server");
    await requireAdminSession();

    if (!data.path) return { url: "" };
    if (data.path.startsWith("/") || /^https?:/i.test(data.path)) return { url: data.path };
    const supabase = await admin();
    const { data: signed, error } = await supabase.storage
      .from(DOC_BUCKET)
      .createSignedUrl(data.path, 600);
    if (error) throw new Error(error.message);
    return { url: String(signed.signedUrl) };
  });

/* ---------------- a new invoice for a resident ---------------- */

export type NewResidentInvoice = {
  residentId: string;
  /** the tenancy a rent period is issued for */
  tenancyId?: string;
  type: "rental" | "charge";
  invoiceDate: string;
  dueDate: string;
  periodStart?: string;
  periodEnd?: string;
  paymentFrequency: string;
  notes: string;
  /** the resident and their stay, as the invoice shows them */
  values: Record<string, unknown>;
  /** amount is the price of one; the line is worth quantity x amount */
  items: { label: string; kind: string; amount: number; quantity?: number }[];
  /** raised for a lost or damaged access card - the new form waits for it to be paid */
  forAccessCard?: boolean;
};

/**
 * A resident's next invoice - rent, utilities, a charge - raised from their
 * Payments tab. Always a new invoice with its own number, linked to the
 * resident; money is then recorded against it like any other.
 */
export const createResidentInvoice = createServerFn({ method: "POST" })
  .inputValidator((data: NewResidentInvoice) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const items = data.items.filter((l) => l.label.trim() || num(l.amount));
    if (!items.length) throw new Error("Add at least one line");
    if (!data.invoiceDate || !data.dueDate) throw new Error("Enter the issue and due dates");
    const days = Math.round((Date.parse(data.dueDate) - Date.parse(data.invoiceDate)) / 86_400_000);
    if (days < 0) throw new Error("The due date is before the issue date");
    // a line is worth its price times how many of it there are
    const total = items.reduce((n, l) => n + num(l.amount) * lineQty(l.quantity), 0);

    const { data: inv, error } = await supabase
      .from("invoices")
      .insert({
        ...data.values,
        resident_id: data.residentId,
        ...(data.tenancyId ? { tenancy_id: data.tenancyId } : {}),
        invoice_type: data.type,
        invoice_date: data.invoiceDate,
        // the due date is kept as days after the issue date, the way every invoice reads it
        payment_terms: `NET${days}`,
        issued_at: new Date(`${data.invoiceDate}T00:00:00Z`).toISOString(),
        period_start: data.periodStart || null,
        period_end: data.periodEnd || null,
        payment_frequency: data.paymentFrequency,
        notes: data.notes,
        total,
        deposits_total: items
          .filter((l) => l.kind === "refundable")
          .reduce((n, l) => n + num(l.amount) * lineQty(l.quantity), 0),
      })
      .select("id, number")
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { error: itemErr } = await supabase.from("invoice_items").insert(
      items.map((l, i) => ({
        invoice_id: inv.id,
        label: l.label,
        kind: l.kind,
        amount: num(l.amount),
        quantity: lineQty(l.quantity),
        sort_order: i,
      })),
    );
    if (itemErr) throw new Error(itemErr.message);
    // the same record a booking's invoice keeps, so Collections and the
    // resident's Payments tab do not behave differently from the booking
    {
      const { recordInvoiceVersion } = await import("@/lib/document-versions.functions");
      await recordInvoiceVersion(supabase, String(inv.id));
    }
    if (data.forAccessCard) {
      const { linkReplacementInvoice } = await import("@/lib/access-card.functions");
      await linkReplacementInvoice(supabase, data.residentId, String(inv.id), String(inv.number ?? ""));
    }
    return { id: String(inv.id), number: String(inv.number ?? "") };
  });

export type ResidentInvoiceChange = {
  invoiceId: string;
  /** the invoice date - for one not billed yet, the day it is billed */
  invoiceDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  notes: string;
  /** amount is the price of one; the line is worth quantity x amount */
  items: { label: string; kind: string; amount: number; quantity?: number }[];
};

/**
 * Change a resident's rent or charge invoice while nothing is paid on it - the
 * same rule as a booking's invoice. Its number stays. A scheduled rent invoice
 * changed this way is left as admin set it when the rent terms change later.
 * Once money is recorded, a receipt was issued against what it said, so this
 * refuses.
 */
export const updateResidentInvoice = createServerFn({ method: "POST" })
  .inputValidator((data: ResidentInvoiceChange) => data)
  .handler(async ({ data }) => {
    const supabase = await admin();
    const items = data.items.filter((l) => l.label.trim() || num(l.amount));
    if (!items.length) throw new Error("Add at least one line");
    if (!data.invoiceDate || !data.dueDate) throw new Error("Enter the invoice and due dates");
    const days = Math.round((Date.parse(data.dueDate) - Date.parse(data.invoiceDate)) / 86_400_000);
    if (days < 0) throw new Error("The due date is before the invoice date");

    const { data: inv, error: readErr } = await supabase
      .from("invoices")
      .select("id, status")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!inv || inv.status === "void") throw new Error("Invoice not found");
    const scheduled = inv.status === "scheduled";
    if (!scheduled) {
      const { count } = await supabase
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("invoice_id", data.invoiceId);
      if (count)
        throw new Error("Money has been paid on this invoice, so it can no longer be changed");
    }

    const { error } = await supabase
      .from("invoices")
      .update({
        ...(scheduled ? { auto_scheduled: false, bill_on: data.invoiceDate } : {}),
        invoice_date: data.invoiceDate,
        issued_at: new Date(`${data.invoiceDate}T00:00:00Z`).toISOString(),
        payment_terms: `NET${days}`,
        period_start: data.periodStart || null,
        period_end: data.periodEnd || null,
        notes: data.notes,
        total: items.reduce((n, l) => n + num(l.amount) * lineQty(l.quantity), 0),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.invoiceId)
      // billed in the meantime: this is not the invoice admin was looking at
      .eq("status", inv.status);
    if (error) throw new Error(error.message);

    const { error: dropErr } = await supabase
      .from("invoice_items")
      .delete()
      .eq("invoice_id", data.invoiceId);
    if (dropErr) throw new Error(dropErr.message);
    const { error: itemErr } = await supabase.from("invoice_items").insert(
      items.map((l, i) => ({
        invoice_id: data.invoiceId,
        label: l.label,
        kind: l.kind,
        amount: num(l.amount),
        quantity: lineQty(l.quantity),
        sort_order: i,
      })),
    );
    if (itemErr) throw new Error(itemErr.message);

    {
      const { recordInvoiceVersion } = await import("@/lib/document-versions.functions");
      await recordInvoiceVersion(supabase, data.invoiceId);
    }
    // moved to a day already past: billed now
    await billDueInvoices(supabase);
    return { ok: true };
  });

/**
 * One invoice as the Payments tab and Collections show it: its lines, payments
 * with their proofs, receipts, and what is still owed. Both lists and the single
 * invoice below are built here, so they can never tell a different story.
 */
function toBillingInvoice(
  raw: any,
  itemRows: any[],
  paymentRows: any[],
  receiptRows: any[],
  /** the ID the resident goes by, printed on the invoice - blank before they are a resident */
  residentCode = "",
): BillingInvoice {
  const myItems = itemRows.map((i: any) => ({
    label: String(i.label ?? ""),
    kind: String(i.kind ?? "fee"),
    amount: num(i.amount),
    // rows written before the column existed are one of the thing
    quantity: lineQty(i.quantity),
  }));
  const myPayments = paymentRows.map((p: any) => ({
    id: String(p.id),
    amount: num(p.amount),
    paidOn: String(p.paid_on ?? ""),
    method: String(p.method ?? ""),
    reference: String(p.reference ?? ""),
    proofPath: String(p.proof_path ?? ""),
    description: String(p.description ?? ""),
    recordedBy: String(p.recorded_by ?? ""),
  }));
  const paid = myPayments.reduce((n, p) => n + p.amount, 0);
  const total = num(raw.total);
  /*
   * Deposits held: the total stored on the invoice, else its lines typed
   * Refundable - the Type column is what says a line comes back, the same test
   * every other screen uses. Matching "deposit" in the name is only for old
   * imported lines that carry no Type at all; used first, it counted a
   * one-time "deposit top-up" as refundable and missed a refundable line
   * named anything else.
   */
  const typed = myItems.filter((i) => i.kind === "refundable");
  const deposits =
    num(raw.deposits_total) ||
    (typed.length ? typed : myItems.filter((i) => isDeposit(i.kind, i.label))).reduce(
      // amount is the price of one, so an old "2 x" line counts twice
      (n, i) => n + i.amount * i.quantity,
      0,
    );

  const type = (["initial", "rental", "charge", "checkout"] as const).includes(raw.invoice_type)
    ? (raw.invoice_type as BillingInvoice["type"])
    : "initial";

  const scheduled = raw.status === "scheduled";
  // what came off the set price, and why - the invoice states it, Lav 17 Sept 2026
  const rentDiscount = discountLabel(raw.discount_type, num(raw.discount_value));

  return {
    id: String(raw.id),
    // a scheduled invoice's number is only a placeholder until it is billed
    number: scheduled ? "" : String(raw.number ?? ""),
    type,
    status: String(raw.status ?? ""),
    scheduled,
    billOn: String(raw.bill_on ?? ""),
    edited: scheduled && raw.auto_scheduled === false,
    issuedAt: scheduled ? "" : String(raw.issued_at ?? ""),
    dueDate: dueDateOf(raw),
    periodStart: String(raw.period_start ?? ""),
    periodEnd: String(raw.period_end ?? ""),
    tenancyId: String(raw.tenancy_id ?? ""),
    total,
    paid,
    outstanding: Math.max(0, total - paid),
    // never hide an overpayment: the money exists whether or not anyone has
    // decided to refund it or carry it forward
    credit: Math.max(0, paid - total),
    depositsHeld: deposits,
    items: myItems,
    payments: myPayments,
    receipts: receiptRows.map((r: any) => ({
      number: String(r.number ?? ""),
      amount: num(r.amount),
      issuedAt: String(r.issued_at ?? ""),
      paymentId: String(r.payment_id ?? ""),
      balanceAfter: num(r.balance_after),
      paidToDate: r.paid_to_date == null ? null : num(r.paid_to_date),
    })),
    doc: {
      number: scheduled ? "Scheduled" : String(raw.number ?? ""),
      // what it is - the PDF states the rental terms only where they mean something
      kind: type,
      ...(residentCode ? { resident_code: residentCode } : {}),
      ...(rentDiscount && num(raw.list_rent) > 0
        ? {
            list_rent: num(raw.list_rent),
            discount_label: rentDiscount,
            ...(raw.discount_note ? { discount_note: String(raw.discount_note) } : {}),
          }
        : {}),
      issued_at: raw.issued_at ?? null,
      invoice_date: raw.invoice_date ?? null,
      payment_terms: String(raw.payment_terms ?? ""),
      full_name: String(raw.full_name ?? ""),
      email: String(raw.email ?? ""),
      phone: String(raw.phone ?? ""),
      university: String(raw.university ?? ""),
      company: String(raw.company ?? ""),
      occupation: String(raw.occupation ?? ""),
      nationality: String(raw.nationality ?? ""),
      residence_name: String(raw.residence_name ?? ""),
      room_name: String(raw.room_name ?? ""),
      occupancy: String(raw.occupancy ?? ""),
      tenancy_start: raw.tenancy_start ?? null,
      tenancy_end: raw.tenancy_end ?? null,
      monthly_rent: num(raw.monthly_rent),
      // reprinting an invoice reprints its terms - they are part of what was issued
      ...(raw.show_terms
        ? {
            show_terms: true,
            next_payment_date: raw.next_payment_date ?? null,
            next_payment_amount:
              raw.next_payment_amount == null ? null : num(raw.next_payment_amount),
          }
        : {}),
      payment_frequency: String(raw.payment_frequency ?? ""),
      total,
      deposits_total: num(raw.deposits_total),
      notes: String(raw.notes ?? ""),
      items: myItems,
      paid,
      ...(type !== "initial" ? { heading: HEADINGS[type] } : {}),
      ...(raw.period_start
        ? {
            period: [raw.period_start, raw.period_end].filter(Boolean).map(dayLabel).join(" – "),
          }
        : {}),
    },
  };
}

/**
 * The ID a resident goes by, from what an invoice files them under - their uuid,
 * or the Brachtia ID older billing was raised with. The resident ID when they
 * have one, else the Brachtia ID they kept. Never the university's student ID,
 * which is a different number in a different field.
 */
export async function residentCodeFor(supabase: any, ref: string) {
  if (!ref) return "";
  const byUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  const { data } = await supabase
    .from("residents")
    .select("resident_code, quickbooks_id")
    .eq(byUuid ? "id" : "quickbooks_id", ref)
    .maybeSingle();
  return String(data?.resident_code || data?.quickbooks_id || "");
}

/** One invoice, opened from Collections: its lines, payments, proofs and receipts. */
export const getInvoiceBilling = createServerFn({ method: "GET" })
  .inputValidator((data: { invoiceId: string }) => data)
  .handler(async ({ data }): Promise<BillingInvoice | null> => {
    const supabase = await admin();
    const { data: raw, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!raw) return null;

    const [itemsRes, paymentsRes, receiptsRes] = await Promise.all([
      supabase.from("invoice_items").select("*").eq("invoice_id", raw.id).order("sort_order"),
      supabase.from("payments").select("*").eq("invoice_id", raw.id).order("paid_on"),
      supabase.from("receipts").select("*").eq("invoice_id", raw.id).order("issued_at"),
    ]);
    return toBillingInvoice(
      raw,
      itemsRes.data ?? [],
      paymentsRes.data ?? [],
      receiptsRes.data ?? [],
      await residentCodeFor(supabase, String(raw.resident_id ?? "")),
    );
  });

/* ---------------- replacing a wrong payment proof (1 Oct 2026) ---------------- */

/*
 * A proof attached by mistake - the wrong slip, another student's - is taken
 * off the payment, but never deleted: accounts must be able to see what was
 * there, when it changed, and why. Each change is kept in
 * proof-history/<payment id>.json beside the proofs, and the new proof is
 * required in the same step, so a payment is never left without one.
 */
type ProofChange = { at: string; reason: string; removedPath: string; newPath: string };
const historyPath = (paymentId: string) => `proof-history/${paymentId}.json`;

async function readProofHistory(supabase: any, paymentId: string): Promise<ProofChange[]> {
  const { data } = await supabase.storage.from(DOC_BUCKET).download(historyPath(paymentId), { cacheNonce: Date.now() });
  if (!data) return [];
  try {
    return JSON.parse(await data.text()) as ProofChange[];
  } catch {
    return [];
  }
}

export const replacePaymentProof = createServerFn({ method: "POST" })
  .inputValidator((data: { paymentId: string; reason: string; proofPath: string }) => data)
  .handler(async ({ data }) => {
    const { requireAdminSession } = await import("@/lib/admin-session.server");
    await requireAdminSession();
    const reason = String(data.reason ?? "").trim();
    if (reason.length < 3) throw new Error("Say why the proof is being replaced");
    if (!data.proofPath) throw new Error("Attach the correct proof");
    const supabase = await admin();
    const { data: payment, error } = await supabase.from("payments").select("id, proof_path").eq("id", data.paymentId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!payment) throw new Error("Payment not found");
    if (payment.proof_path === data.proofPath) throw new Error("That is the same file");

    const history = await readProofHistory(supabase, data.paymentId);
    history.push({ at: new Date().toISOString(), reason: reason.slice(0, 500), removedPath: String(payment.proof_path ?? ""), newPath: data.proofPath });
    // the history first: if it cannot be kept, the proof is not changed
    const { error: hErr } = await supabase.storage
      .from(DOC_BUCKET)
      .upload(historyPath(data.paymentId), new Blob([JSON.stringify(history, null, 2)], { type: "application/json" }), {
        upsert: true,
        contentType: "application/json",
      });
    if (hErr) throw new Error(`Could not keep the history: ${hErr.message}`);
    const { error: uErr } = await supabase.from("payments").update({ proof_path: data.proofPath } as any).eq("id", data.paymentId);
    if (uErr) throw new Error(uErr.message);
    return { ok: true as const, changes: history.length };
  });

/** Every proof change on a payment, oldest first - for accounts. */
export const paymentProofHistory = createServerFn({ method: "GET" })
  .inputValidator((data: { paymentId: string }) => data)
  .handler(async ({ data }) => {
    const { requireAdminSession } = await import("@/lib/admin-session.server");
    await requireAdminSession();
    return readProofHistory(await admin(), data.paymentId);
  });
