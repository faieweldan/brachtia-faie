import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel, StatusPill } from "@/components/admin/ops-ui";
import { fmtDate, money } from "@/lib/ops-store";
import { getResidentBilling, type BillingInvoice } from "@/lib/resident-billing.functions";

/**
 * A resident's money, shown the way an admin thinks about it.
 *
 * Four questions, in the order they come up over a tenancy: what did they pay to
 * move in, is their rent up to date, is anything else owed, and what happens at
 * check-out. Each answers itself in one line and only opens up when asked.
 *
 * Nothing accounting-shaped on the surface - no ageing, no debit and credit.
 * That detail lives one click down, inside the invoice.
 */
export function ResidentPayments({
  residentId,
  quickbooksId,
  tenancyEnd,
}: {
  residentId: string;
  quickbooksId?: string;
  tenancyEnd?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["resident-billing", residentId, quickbooksId],
    queryFn: () => getResidentBilling({ data: { residentId, ...(quickbooksId ? { quickbooksId } : {}) } }),
  });

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const frequency = useMemo(() => {
    const f = data?.paymentFrequency ?? "";
    const named: Record<string, string> = {
      bimonthly: "Bi-monthly",
      quarterly: "Quarterly",
      semiannual: "Semi-annually",
      full: "Full term",
      monthly: "Monthly",
    };
    return named[f] ?? (f ? f[0]!.toUpperCase() + f.slice(1) : "");
  }, [data]);

  if (isLoading) {
    return (
      <Panel>
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading payments…
        </div>
      </Panel>
    );
  }

  const b = data;
  const initial = b?.groups.initial ?? [];
  const rental = b?.groups.rental ?? [];
  const charges = b?.groups.charge ?? [];
  const checkout = b?.groups.checkout ?? [];

  const initialOutstanding = initial.reduce((n, i) => n + i.outstanding, 0);
  const rentalOutstanding = rental.reduce((n, i) => n + i.outstanding, 0);
  const chargeOutstanding = charges.reduce((n, i) => n + i.outstanding, 0);
  const nextRental = rental.find((i) => i.outstanding > 0);

  return (
    <div className="space-y-4">
      {/* the whole picture in three numbers and one line */}
      <Panel>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
          <Figure label="Billed" value={money(b?.billed ?? 0)} />
          <Figure label="Collected" value={money(b?.collected ?? 0)} tone="text-emerald-700" />
          <Figure
            label="Outstanding"
            value={money(b?.outstanding ?? 0)}
            tone={(b?.outstanding ?? 0) > 0 ? "text-amber-700" : undefined}
          />
        </div>
        {(b?.credit ?? 0) > 0 ? (
          <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900">
            {money(b!.credit)} paid beyond what was billed — not yet refunded or carried forward.
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">
          {[
            b?.monthlyRent ? `Monthly rent ${money(b.monthlyRent)}` : null,
            frequency || null,
            b?.nextDue ? `Next payment ${fmtDate(b.nextDue)}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "No billing raised yet"}
        </p>
      </Panel>

      <Card
        index="01"
        title="Initial payment"
        hint="Booking fee, advance rental and deposits"
        status={
          initial.length === 0
            ? "Not raised"
            : initialOutstanding > 0
              ? `${money(initialOutstanding)} due`
              : "Completed"
        }
        done={initial.length > 0 && initialOutstanding === 0}
        detail={
          initial.length
            ? `${money(initial.reduce((n, i) => n + i.total, 0))} billed · ${money(
                initial.reduce((n, i) => n + i.paid, 0),
              )} collected${
                initial.reduce((n, i) => n + i.credit, 0) > 0
                  ? ` · ${money(initial.reduce((n, i) => n + i.credit, 0))} in credit`
                  : ""
              }`
            : "Raised from the booking when the student accepts"
        }
        open={!!open["initial"]}
        onToggle={initial.length ? () => toggle("initial") : undefined}
      >
        {initial.map((inv) => (
          <InvoiceDetail key={inv.id} invoice={inv} />
        ))}
      </Card>

      <Card
        index="02"
        title="Rental payments"
        hint="Recurring rental payments"
        status={
          rentalOutstanding > 0
            ? `${money(rentalOutstanding)} due`
            : rental.length
              ? "Up to date"
              : "Not started"
        }
        done={rental.length > 0 && rentalOutstanding === 0}
        detail={
          nextRental
            ? `Next: ${periodLabel(nextRental)}${nextRental.dueDate ? ` · Due ${fmtDate(nextRental.dueDate)}` : ""}`
            : rental.length
              ? "Nothing outstanding"
              : "Rental invoices appear here once raised"
        }
        open={!!open["rental"]}
        onToggle={rental.length ? () => toggle("rental") : undefined}
      >
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Period</th>
              <th className="px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Invoice</th>
              <th className="px-4 py-2 font-medium">Payment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rental.map((inv) => (
              <tr key={inv.id}>
                <td className="px-4 py-2">{periodLabel(inv)}</td>
                <td className="px-4 py-2 tabular-nums">{money(inv.total)}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {inv.status === "draft" ? "Scheduled" : "Sent"}
                </td>
                <td className="px-4 py-2">
                  {inv.outstanding === 0 ? (
                    <span className="text-emerald-700">Paid</span>
                  ) : inv.status === "draft" ? (
                    <span className="text-muted-foreground">Upcoming</span>
                  ) : (
                    <span className="text-amber-700">{money(inv.outstanding)} due</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card
        index="03"
        title="Additional charges"
        hint="One-off charges during the tenancy"
        status={
          chargeOutstanding > 0
            ? `${money(chargeOutstanding)} outstanding`
            : "No outstanding charges"
        }
        done={charges.length > 0 && chargeOutstanding === 0}
        detail={
          charges.length
            ? `${charges.length} charge${charges.length === 1 ? "" : "s"} · ${money(
                charges.reduce((n, i) => n + i.total, 0),
              )} billed · ${money(charges.reduce((n, i) => n + i.paid, 0))} collected`
            : "No additional charges"
        }
        open={!!open["charge"]}
        onToggle={charges.length ? () => toggle("charge") : undefined}
        action={
          <Button size="sm" variant="outline" disabled>
            <Plus className="mr-1 size-3.5" /> Add charge
          </Button>
        }
      >
        {charges.map((inv) => (
          <InvoiceDetail key={inv.id} invoice={inv} />
        ))}
      </Card>

      <Card
        index="04"
        title="Check-out settlement"
        hint="Deposits, deductions and final settlement"
        status={checkout.length ? "In progress" : "Not started"}
        detail={
          checkout.length
            ? `${money(b?.depositsHeld ?? 0)} refundable deposits held`
            : [
                tenancyEnd ? `Tenancy ends ${fmtDate(tenancyEnd)}` : null,
                (b?.depositsHeld ?? 0) > 0
                  ? `${money(b!.depositsHeld)} refundable deposits held`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Available closer to check-out"
        }
        open={!!open["checkout"]}
        onToggle={checkout.length ? () => toggle("checkout") : undefined}
      >
        {checkout.map((inv) => (
          <InvoiceDetail key={inv.id} invoice={inv} />
        ))}
      </Card>
    </div>
  );
}

function periodLabel(inv: BillingInvoice) {
  if (!inv.periodStart) return inv.number || "—";
  const short = (d: string) =>
    new Date(d).toLocaleDateString("en-MY", { month: "short", year: "numeric" });
  return inv.periodEnd
    ? `${short(inv.periodStart)} – ${short(inv.periodEnd)}`
    : short(inv.periodStart);
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string | undefined;
}) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${tone ?? "text-brand-deep"}`}>{value}</p>
    </div>
  );
}

/** One of the four. Says its answer in a line; opens only when there is more. */
function Card({
  index,
  title,
  hint,
  status,
  detail,
  done,
  open,
  onToggle,
  action,
  children,
}: {
  index: string;
  title: string;
  hint: string;
  status: string;
  detail: string;
  done?: boolean;
  open: boolean;
  onToggle?: (() => void) | undefined;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Panel className="p-0">
      <div className="flex flex-wrap items-start gap-3 p-5">
        <span className="mt-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-brand-deep">{title}</p>
            {done ? <CheckCircle2 className="size-4 text-emerald-600" /> : null}
          </div>
          <p className="text-xs text-muted-foreground">{hint}</p>
          <p className="mt-1.5 text-sm text-foreground">{detail}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-medium text-foreground">{status}</span>
          {action}
          {onToggle ? (
            <Button size="sm" variant="ghost" onClick={onToggle}>
              <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>
          ) : null}
        </div>
      </div>
      {open && children ? (
        <div className="border-t border-border">
          <div className="overflow-x-auto">{children}</div>
        </div>
      ) : null}
    </Panel>
  );
}

/** The accounting, one level down, only when asked for. */
function InvoiceDetail({ invoice }: { invoice: BillingInvoice }) {
  return (
    <div className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-brand-deep">{invoice.number}</p>
        <StatusPill
          status={invoice.outstanding === 0 ? "active" : "notice"}
          label={invoice.outstanding === 0 ? "Paid" : "Outstanding"}
        />
        {invoice.issuedAt ? (
          <span className="text-xs text-muted-foreground">Issued {fmtDate(invoice.issuedAt)}</span>
        ) : null}
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {invoice.items.map((item, i) => (
          <li
            key={`${item.label}-${i}`}
            className="flex items-center justify-between px-4 py-2 text-sm"
          >
            <span className="text-muted-foreground">{item.label}</span>
            <span className="tabular-nums">{money(item.amount)}</span>
          </li>
        ))}
        <li className="flex items-center justify-between bg-muted px-4 py-2 text-sm font-medium">
          <span>Total</span>
          <span className="tabular-nums">{money(invoice.total)}</span>
        </li>
      </ul>

      {invoice.payments.length ? (
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">Payments</p>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {invoice.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-muted-foreground">
                  {fmtDate(p.paidOn)}
                  {p.method ? ` · ${p.method}` : ""}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
                <span className="tabular-nums text-emerald-700">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {invoice.credit > 0 ? (
        <p className="text-xs text-sky-900">{money(invoice.credit)} paid beyond this invoice.</p>
      ) : null}

      {invoice.depositsHeld > 0 ? (
        <p className="text-xs text-muted-foreground">
          Refundable deposits held: {money(invoice.depositsHeld)}
        </p>
      ) : null}
    </div>
  );
}
