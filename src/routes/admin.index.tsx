import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, FileSignature, Inbox, ListChecks } from "lucide-react";
import type { ReactNode } from "react";

import { adminOverview } from "@/lib/admin.functions";
import { adminWorkQueue } from "@/lib/work-queue.functions";
import { formatSlot } from "@/lib/slots";
import { useState } from "react";
import { Panel } from "@/components/admin/ops-ui";
import { dashboardMoney } from "@/lib/dashboard-money.functions";
import {
  DEPOSIT_KINDS,
  DEPOSIT_LABEL,
  frequencyOptions,
  bucketLabel,
  depositsHeld,
  nextCycleMonth,
  rentForecast,
  type FrequencyFilter,
  type Grouping,
} from "@/lib/dashboard-money";
import { money, useOps } from "@/lib/ops-store";

const TASK_LABEL: Record<string, string> = {
  agreement: "Agreements",
  checkin: "Check-ins",
  stamping: "Stamping",
  payment: "Payments",
  hold: "Room holds",
};

export const Route = createFileRoute("/admin/")({
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => adminOverview(),
  });
  // the same list the Tasks badge counts, so the two never differ
  const { data: queue } = useQuery({
    queryKey: ["admin", "work-queue"],
    queryFn: () => adminWorkQueue(),
  });
  const ops = useOps();
  const openTasks = ops.tasks.filter((t) => t.status === "open");
  const toBook = ((data as any)?.checkinsToBook ?? []) as {
    id: string;
    full_name: string;
    remind: boolean;
  }[];
  const byType = openTasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.type] = (acc[t.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-deep">Revenue overview</h1>
        <p className="text-sm text-muted-foreground">What is held now and what is due next.</p>
      </div>

      <MoneyCards />

      {/* the day-to-day counts: kept small, below the money */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          to="/admin/bookings"
          icon={<Inbox className="size-4" />}
          label="Open enquiries"
          value={isLoading ? "—" : String((data as any)?.newEnquiries ?? 0)}
        />
        <Metric
          to="/admin/appointments"
          icon={<CalendarDays className="size-4" />}
          label="Pending appointments"
          value={isLoading ? "—" : String((data as any)?.pendingAppointments ?? 0)}
        />
        <Metric
          to="/admin/tasks"
          icon={<FileSignature className="size-4" />}
          label="Agreements to stamp"
          value={queue ? String(queue.filter((w) => w.kind === "stamping").length) : "—"}
        />
        <Metric
          to="/admin/tasks"
          icon={<ListChecks className="size-4" />}
          label="Open tasks"
          value={queue ? String(queue.length) : "—"}
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-brand-deep">Action needed</h2>
          <Link to="/admin/tasks" className="text-xs font-medium text-brand hover:underline">
            View all tasks
          </Link>
        </div>
        {openTasks.length === 0 && toBook.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nothing outstanding.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {/* moving in within the week with no arrival time - the website
                does not remind them itself yet, so the admin does */}
            {toBook.map((r) => (
              <Link
                key={r.id}
                to="/admin/residents/$id"
                params={{ id: r.id }}
                title={r.remind ? "Asked to be reminded" : "Has not chosen a time"}
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:border-amber-400"
              >
                Check-in to book · {r.full_name || "Resident"}
              </Link>
            ))}
            {Object.entries(byType).map(([type, count]) => (
              <Link
                key={type}
                to="/admin/tasks"
                className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:border-brand/40"
              >
                {TASK_LABEL[type] ?? type} · {count}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-brand-deep">Next appointments</h2>
        <div className="mt-3 divide-y divide-border text-sm">
          {((data as any)?.upcoming ?? []).length === 0 ? (
            <p className="text-muted-foreground">Nothing scheduled yet.</p>
          ) : (
            ((data as any)?.upcoming ?? []).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{a.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.residence_name} · {a.mode === "virtual" ? "Virtual" : "In person"}
                  </p>
                </div>
                <p className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(a.starts_at).toLocaleDateString("en-MY", {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  · {formatSlot(a.starts_at)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({
  to,
  icon,
  label,
  value,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-brand/40"
    >
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-brand-deep">{value}</p>
    </Link>
  );
}

/** A row of choices, one pressed - buttons, so the keyboard reaches them. */
function Toggle<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground" aria-hidden>
        {label}
      </span>
      <div
        role="group"
        aria-label={label}
        className="flex flex-wrap rounded-full border border-border p-0.5 text-xs"
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-full px-2.5 py-1 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${value === o.value ? "bg-brand-deep text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// the parts of the deposits bar: the brand's greens, named beside the bar so colour is never the only key
const DEPOSIT_SHADE = {
  security: "bg-brand-deep",
  utility: "bg-brand",
  access: "bg-emerald-300",
  other: "bg-muted-foreground/40",
} as const;

/**
 * Money at a glance (12 Oct 2026): the rent due next, first and largest, then
 * the deposits held. Built from the same panel as Collections; orange is kept
 * for rent falling due.
 */
function MoneyCards() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "dashboard-money"],
    queryFn: () => dashboardMoney(),
  });
  const [by, setBy] = useState<Grouping>("month");
  const [freq, setFreq] = useState<FrequencyFilter>("all");
  const today = new Date().toISOString().slice(0, 10);
  const forecast = rentForecast(data?.rent ?? [], today, by, freq);
  const held = depositsHeld(data?.deposits ?? []);
  const peak = Math.max(1, ...forecast.periods.map((p) => p.amount));
  const cycleName = bucketLabel(nextCycleMonth(today), true);
  const freqOptions = frequencyOptions(data?.rent ?? [], today);
  const freqName = (freqOptions.find((f) => f.value === freq)?.label ?? "").toLowerCase();

  if (isError)
    return (
      <Panel>
        <p className="flex items-center gap-2 text-sm text-rose-700">
          <AlertCircle className="size-4" /> The money figures could not be loaded.
          <button type="button" onClick={() => refetch()} className="font-medium underline">
            Try again
          </button>
        </p>
      </Panel>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel className="lg:col-span-2">
        <p className="text-sm font-semibold text-brand-deep">Rent due in {cycleName}</p>
        <p className="mt-1 text-4xl font-bold tabular-nums text-amber-700">
          {isLoading ? "—" : money(forecast.next.amount)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isLoading
            ? "Loading…"
            : `${forecast.next.count} invoice${forecast.next.count === 1 ? "" : "s"}${freq === "all" ? "" : ` · ${freqName} only`}`}{" "}
          · billed and scheduled rent invoices, by due date
        </p>

        <div className="mt-5 space-y-2 border-t border-border pt-4">
          <p className="text-xs font-semibold text-brand-deep">Forecast</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Toggle
              label="Show by"
              value={by}
              onChange={setBy}
              options={[
                { value: "month", label: "Month" },
                { value: "quarter", label: "Quarter" },
              ]}
            />
            <Toggle
              label="Residents who pay"
              value={freq}
              onChange={setFreq}
              options={freqOptions}
            />
          </div>
        </div>
        <div className="mt-3 space-y-2.5">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : forecast.periods.length === 0 ? (
            <p className="rounded-xl bg-muted px-3 py-4 text-center text-xs text-muted-foreground">
              No rent due from {cycleName} on{freq === "all" ? "" : ` for ${freqName} residents`}.
              Rent appears here once a resident's rent schedule is set.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {forecast.periods.map((p) => (
                <li
                  key={p.key}
                  className="grid grid-cols-[4.5rem_1fr_8.5rem] sm:grid-cols-[5.5rem_1fr_10rem] items-center gap-3 text-xs"
                >
                  <span className="text-muted-foreground">
                    {p.label}
                    {p.partial ? (
                      <span className="block text-[10px]">from {bucketLabel(forecast.cycle)}</span>
                    ) : null}
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span
                      className="block h-full rounded-full bg-amber-500"
                      style={{ width: `${Math.max(2, Math.round((p.amount / peak) * 100))}%` }}
                    />
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="font-semibold text-brand-deep">{money(p.amount)}</span>
                    <span className="ml-1.5 text-muted-foreground">· {p.count}</span>
                  </span>
                </li>
              ))}
              {/* the bars add up to this - the same invoices, however they are grouped */}
              <li className="grid grid-cols-[4.5rem_1fr_8.5rem] items-center gap-3 border-t border-border pt-2.5 text-xs sm:grid-cols-[5.5rem_1fr_10rem]">
                <span className="font-semibold text-brand-deep">Total</span>
                <span className="text-muted-foreground">from {bucketLabel(forecast.cycle)}</span>
                <span className="text-right tabular-nums">
                  <span className="font-semibold text-brand-deep">
                    {money(forecast.total.amount)}
                  </span>
                  <span className="ml-1.5 text-muted-foreground">· {forecast.total.count}</span>
                </span>
              </li>
            </ul>
          )}
        </div>
      </Panel>

      <Panel
        title="Deposits held"
        description="Refundable deposits paid by residents who have not checked out."
      >
        <p className="text-3xl font-bold tabular-nums text-brand-deep">
          {isLoading ? "—" : money(held.total)}
        </p>
        {held.total > 0 ? (
          <div
            className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label="How the deposits held are made up"
          >
            {DEPOSIT_KINDS.filter((k) => held.byKind[k] > 0).map((k) => (
              <span
                key={k}
                className={DEPOSIT_SHADE[k]}
                style={{ width: `${(held.byKind[k] / held.total) * 100}%` }}
              />
            ))}
          </div>
        ) : null}
        <ul className="mt-4 space-y-2 text-xs">
          {DEPOSIT_KINDS.filter((k) => k !== "other" || held.byKind.other > 0).map((k) => (
            <li key={k} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className={`size-2 rounded-full ${DEPOSIT_SHADE[k]}`} aria-hidden />
                {DEPOSIT_LABEL[k]}
              </span>
              <span className="whitespace-nowrap tabular-nums">
                <span className="font-semibold text-brand-deep">
                  {isLoading ? "—" : money(held.byKind[k])}
                </span>
                {held.total > 0 ? (
                  <span className="ml-1.5 text-muted-foreground">
                    {Math.round((held.byKind[k] / held.total) * 100)}%
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
