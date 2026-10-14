import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { DateRangeFilter, FilterField, ResetFilters, SearchFilter } from "@/components/admin/filters";
import { Dropdown } from "@/components/admin/Dropdown";
import { PayablesTable } from "@/components/admin/PayablesTable";
import { listPayables, type PayableRow } from "@/lib/checkout.functions";
import { CREDIT_NOTE_CATEGORIES } from "@/lib/invoice-category";
import { money } from "@/lib/ops-store";

export const Route = createFileRoute("/admin/residents/payables")({
  component: PayablesPage,
});

type Status = "all" | "To pay" | "Paid";
// a row's kind -> its category in the shared code list
const CATEGORY_OF = { checkout: "checkout", credit: "refund" } as const;

/**
 * Money out (Dani, 2 Oct 2026): what Brachtia owes residents - every credit
 * note, from a checkout statement or from account credit with nothing left to
 * bill (13 Oct 2026). Collections is the money in. The table is PayablesTable,
 * the same one a resident's Payments tab shows for them alone.
 *
 * Narrowed like Collections (14 Oct 2026), with its own filters (filters.tsx):
 * date issued, search, category - and the three totals are the status filter,
 * each counting what it shows.
 */
function PayablesPage() {
  const q = useQuery({ queryKey: ["payables"], queryFn: () => listPayables() });
  const rows = q.data ?? [];
  const [status, setStatus] = useState<Status>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | keyof typeof CREDIT_NOTE_CATEGORIES>("all");

  // every filter but the status - so each total is what clicking it would show
  const narrowed = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r: PayableRow) => {
      const day = String(r.issuedAt ?? "").slice(0, 10);
      return (
        (category === "all" || CATEGORY_OF[r.kind] === category) &&
        (!from || day >= from) &&
        (!to || day <= to) &&
        (!needle || `${r.number} ${r.name} ${r.code}`.toLowerCase().includes(needle))
      );
    });
  }, [rows, category, from, to, search]);
  const shown = status === "all" ? narrowed : narrowed.filter((r) => (status === "Paid" ? r.status === "Paid" : r.status !== "Paid"));
  const toPay = narrowed.filter((r) => r.status !== "Paid");
  const paid = narrowed.filter((r) => r.status === "Paid");
  const sum = (list: PayableRow[]) => list.reduce((n, r) => n + r.amount, 0);
  const filtering = Boolean(from || to || search || category !== "all" || status !== "all");

  const totals: { key: Status; label: string; value: string; tone: string }[] = [
    { key: "To pay", label: "Owed to residents", value: money(sum(toPay)), tone: "text-amber-800" },
    { key: "Paid", label: "Refunded", value: money(sum(paid)), tone: "text-emerald-800" },
    { key: "all", label: "Credit notes", value: String(narrowed.length), tone: "text-brand-deep" },
  ];

  return (
    <div className="space-y-5">
      {/* the totals are the status filter - click one to see those, again for all */}
      <section className="grid gap-3 sm:grid-cols-3">
        {totals.map((t) => {
          const on = status === t.key;
          return (
            <button
              key={t.label}
              type="button"
              aria-pressed={on}
              onClick={() => setStatus(on && t.key !== "all" ? "all" : t.key)}
              className={`rounded-2xl border bg-card p-5 text-left transition-colors hover:bg-muted/40 ${
                on ? "border-brand-deep ring-1 ring-brand-deep/30" : "border-border"
              }`}
            >
              <p className="text-xs text-muted-foreground">{t.label}</p>
              <p className={`text-2xl font-bold tabular-nums ${t.tone}`}>{t.value}</p>
            </button>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-3 px-5 py-4">
          <FilterField label="Date issued">
            <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
          </FilterField>
          <FilterField label="Search">
            <SearchFilter value={search} onChange={setSearch} placeholder="Credit note no., name or ID" label="Search credit notes" />
          </FilterField>
          <FilterField label="Category">
            <Dropdown
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
              aria-label="Category"
              className="h-9 w-56 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">All categories</option>
              {(Object.keys(CREDIT_NOTE_CATEGORIES) as (keyof typeof CREDIT_NOTE_CATEGORIES)[]).map((k) => (
                <option key={k} value={k}>
                  {CREDIT_NOTE_CATEGORIES[k].code} · {CREDIT_NOTE_CATEGORIES[k].label}
                </option>
              ))}
            </Dropdown>
          </FilterField>
          {filtering ? (
            <ResetFilters
              onReset={() => {
                setStatus("all");
                setFrom("");
                setTo("");
                setSearch("");
                setCategory("all");
              }}
            />
          ) : null}
        </div>

        <div className="border-y border-border bg-muted/30 px-5 py-2 text-xs tabular-nums text-muted-foreground">
          {shown.length} of {rows.length} credit note{rows.length === 1 ? "" : "s"}
        </div>

        {q.isLoading ? (
          <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No credit notes yet. They come from a resident's checkout statement, or from account credit with no rent left to use it on.
          </p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No credit note matches these filters.</p>
        ) : (
          <PayablesTable rows={shown} onChanged={() => void q.refetch()} />
        )}
      </section>
    </div>
  );
}
