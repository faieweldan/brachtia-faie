import { createServerFn } from "@tanstack/react-start";

import type { DepositLine, RentDue } from "@/lib/dashboard-money";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The figures behind the dashboard's money cards.
 *
 * Rent due - every rental invoice, billed or still scheduled, by its due date
 * (read as the Payments tab reads it, dueDateOf). A scheduled invoice is the
 * same row once billed, so nothing is counted twice; void and cancelled rows
 * (a schedule Update Tenancy replaced) and drafts are left out.
 *
 * Deposits held - refundable lines on invoices paid in full, for residents
 * still with us: not Inactive, and no checkout statement settled (settling it
 * is when deposits are applied and refunded - it makes an invoice only when the
 * resident owes). A deposit Update Tenancy moved to account credit is taken off.
 */
export const dashboardMoney = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ deposits: DepositLine[]; rent: RentDue[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { dueDateOf, isDeposit } = await import("@/lib/resident-billing.functions");
    const { readStatement } = await import("@/lib/checkout.server");
    const { reclassifiedDeposits } = await import("@/lib/account-credit.server");
    const sb = supabaseAdmin as any;

    const { data: invoices, error } = await sb
      .from("invoices")
      .select(
        "id, resident_id, tenancy_id, invoice_type, status, total, invoice_date, payment_terms, payment_frequency",
      )
      .not("status", "in", "(void,cancelled,draft)");
    if (error) throw new Error(error.message);
    const all = (invoices ?? []) as any[];

    /* ---- rent ---- */
    const rental = all.filter((i) => i.invoice_type === "rental");
    const tenancyIds = [
      ...new Set(
        rental.filter((i) => !i.payment_frequency && i.tenancy_id).map((i) => i.tenancy_id),
      ),
    ];
    const { data: tens } = tenancyIds.length
      ? await sb.from("tenancies").select("id, payment_frequency").in("id", tenancyIds)
      : { data: [] };
    const freqOf = new Map(
      ((tens ?? []) as any[]).map((t) => [t.id, String(t.payment_frequency ?? "")]),
    );
    const rent: RentDue[] = rental.map((i) => ({
      dueDate: dueDateOf(i),
      amount: Number(i.total) || 0,
      frequency: String(i.payment_frequency || freqOf.get(i.tenancy_id) || ""),
    }));

    /* ---- deposits ---- */
    const holders = [
      ...new Set(
        all
          .filter((i) => i.invoice_type !== "rental" && i.resident_id)
          .map((i) => String(i.resident_id)),
      ),
    ];
    if (!holders.length) return { deposits: [], rent };
    const { data: people } = await sb.from("residents").select("id, status").in("id", holders);
    const stillHere = ((people ?? []) as any[])
      .filter((p) => p.status !== "Inactive")
      .map((p) => String(p.id));
    const settled = await Promise.all(
      stillHere.map(async (id) => ((await readStatement(sb, id))?.settled ? id : null)),
    );
    const keep = new Set(stillHere.filter((id) => !settled.includes(id)));

    const candidates = all.filter(
      (i) =>
        i.invoice_type !== "rental" && i.status !== "scheduled" && keep.has(String(i.resident_id)),
    );
    const ids = candidates.map((i) => i.id);
    const deposits: DepositLine[] = [];
    if (ids.length) {
      const [{ data: items }, { data: pays }] = await Promise.all([
        sb
          .from("invoice_items")
          .select("invoice_id, label, kind, amount, quantity")
          .in("invoice_id", ids),
        sb.from("payments").select("invoice_id, amount").in("invoice_id", ids),
      ]);
      const paid = new Map<string, number>();
      for (const p of (pays ?? []) as any[])
        paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + Number(p.amount));
      const fullyPaid = new Set(
        candidates.filter((i) => (paid.get(i.id) ?? 0) >= Number(i.total) - 0.005).map((i) => i.id),
      );
      const byInvoice = new Map<string, any[]>();
      for (const it of (items ?? []) as any[]) {
        if (!fullyPaid.has(it.invoice_id)) continue;
        byInvoice.set(it.invoice_id, [...(byInvoice.get(it.invoice_id) ?? []), it]);
      }
      for (const lines of byInvoice.values()) {
        // the Type column says a line comes back; the name only for old untyped lines (as in the Payments tab)
        const typed = lines.filter((l) => l.kind === "refundable");
        for (const l of typed.length
          ? typed
          : lines.filter((x) => isDeposit(String(x.kind ?? ""), String(x.label ?? ""))))
          deposits.push({
            label: String(l.label ?? ""),
            amount: Number(l.amount) * (Number(l.quantity) || 1),
          });
      }
    }
    // a deposit lowered by Update Tenancy became account credit: held no more
    for (const id of keep)
      for (const r of await reclassifiedDeposits(sb, id))
        deposits.push({ label: String(r.depositLabel ?? "Deposit"), amount: -Number(r.amount) });

    return { deposits, rent };
  },
);
