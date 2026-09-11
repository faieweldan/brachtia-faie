import { createServerFn } from "@tanstack/react-start";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A resident's money, grouped the way an admin thinks about it rather than the
 * way it is stored.
 *
 * Invoices, payments and receipts already exist from the booking flow and carry
 * a resident_id, so nothing new is recorded here - this reads what is there and
 * arranges it into four things: what they paid to move in, their rent, one-off
 * charges, and check-out.
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
  issuedAt: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  total: number;
  paid: number;
  outstanding: number;
  /** paid beyond the total. Money we are holding that nobody has decided about. */
  credit: number;
  depositsHeld: number;
  items: { label: string; kind: string; amount: number }[];
  payments: { id: string; amount: number; paidOn: string; method: string; reference: string }[];
  receipts: { number: string; amount: number; issuedAt: string }[];
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
};

const num = (v: unknown) => Number(v ?? 0) || 0;

/** A deposit is money held, not earned - it comes back at check-out. */
const isDeposit = (kind: string, label: string) => /deposit/i.test(kind) || /deposit/i.test(label);

export const getResidentBilling = createServerFn({ method: "GET" })
  .inputValidator((data: { residentId: string; legacyId?: string }) => data)
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
    };

    // billing may be filed under either id, depending on when it was raised
    const ids = [data.residentId, data.legacyId].filter(Boolean) as string[];
    if (!ids.length) return empty;

    const { data: invoices, error } = await supabase
      .from("invoices")
      .select("*")
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
    } as ResidentBilling;

    for (const raw of invoices as any[]) {
      const myItems = (items.get(raw.id) ?? []).map((i: any) => ({
        label: String(i.label ?? ""),
        kind: String(i.kind ?? "fee"),
        amount: num(i.amount),
      }));
      const myPayments = (payments.get(raw.id) ?? []).map((p: any) => ({
        id: String(p.id),
        amount: num(p.amount),
        paidOn: String(p.paid_on ?? ""),
        method: String(p.method ?? ""),
        reference: String(p.reference ?? ""),
      }));
      const paid = myPayments.reduce((n, p) => n + p.amount, 0);
      const total = num(raw.total);
      const deposits =
        num(raw.deposits_total) ||
        myItems.filter((i) => isDeposit(i.kind, i.label)).reduce((n, i) => n + i.amount, 0);

      const type = (["initial", "rental", "charge", "checkout"] as const).includes(raw.invoice_type)
        ? (raw.invoice_type as BillingInvoice["type"])
        : "initial";

      const invoice: BillingInvoice = {
        id: String(raw.id),
        number: String(raw.number ?? ""),
        type,
        status: String(raw.status ?? ""),
        issuedAt: String(raw.issued_at ?? ""),
        dueDate: String(raw.invoice_date ?? ""),
        periodStart: String(raw.period_start ?? ""),
        periodEnd: String(raw.period_end ?? ""),
        total,
        paid,
        outstanding: Math.max(0, total - paid),
        // never hide an overpayment: the money exists whether or not anyone has
        // decided to refund it or carry it forward
        credit: Math.max(0, paid - total),
        depositsHeld: deposits,
        items: myItems,
        payments: myPayments,
        receipts: (receipts.get(raw.id) ?? []).map((r: any) => ({
          number: String(r.number ?? ""),
          amount: num(r.amount),
          issuedAt: String(r.issued_at ?? ""),
        })),
      };

      out.groups[type].push(invoice);
      out.billed += total;
      out.collected += paid;
      out.credit += invoice.credit;
      out.depositsHeld += deposits;
      if (!out.monthlyRent) out.monthlyRent = num(raw.monthly_rent);
      if (!out.paymentFrequency) out.paymentFrequency = String(raw.payment_frequency ?? "");
    }

    out.outstanding = Math.max(0, out.billed - out.collected);

    // the soonest unpaid invoice is what the admin needs to chase
    const unpaid = [...out.groups.rental, ...out.groups.charge, ...out.groups.initial]
      .filter((i) => i.outstanding > 0 && i.dueDate)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    out.nextDue = unpaid[0]?.dueDate ?? "";

    return out;
  });
