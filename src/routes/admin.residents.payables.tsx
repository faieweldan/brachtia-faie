import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { PayablesTable } from "@/components/admin/PayablesTable";
import { listPayables } from "@/lib/checkout.functions";
import { money } from "@/lib/ops-store";

export const Route = createFileRoute("/admin/residents/payables")({
  component: PayablesPage,
});

/**
 * Money out (Dani, 2 Oct 2026): what Brachtia owes residents - every credit
 * note, from a checkout statement or from account credit with nothing left to
 * bill (13 Oct 2026). Collections is the money in. The table is PayablesTable,
 * the same one a resident's Payments tab shows for them alone.
 */
function PayablesPage() {
  const q = useQuery({ queryKey: ["payables"], queryFn: () => listPayables() });
  const rows = q.data ?? [];
  const toPay = rows.filter((r) => r.status !== "Paid").reduce((n, r) => n + r.amount, 0);
  const paid = rows.filter((r) => r.status === "Paid").reduce((n, r) => n + r.amount, 0);

  return (
    <div className="space-y-5">
      <section className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Owed to residents</p>
          <p className="text-2xl font-bold tabular-nums text-amber-800">{money(toPay)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Refunded</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-800">{money(paid)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Credit notes</p>
          <p className="text-2xl font-bold tabular-nums text-brand-deep">{rows.length}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {q.isLoading ? (
          <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No credit notes yet. They come from a resident's checkout statement, or from account credit with no rent left to use it on.
          </p>
        ) : (
          <PayablesTable rows={rows} onChanged={() => void q.refetch()} />
        )}
      </section>
    </div>
  );
}
