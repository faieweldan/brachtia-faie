import { CalendarClock } from "lucide-react";

import { Panel } from "@/components/admin/ops-ui";
import { fmtDate, money } from "@/lib/ops-store";

type EventRow = {
  eventId: string;
  name: string;
  date: string;
  rentBefore: number;
  rent: number;
  periodEnd: string;
  ip: { number: string; total: number; paid: number; billOn: string } | null;
  documents: string[];
  state: "scheduled" | "settled" | "effective";
  waitingFor: string;
  adjustment: string;
  credit: number;
};

const STATE = {
  scheduled: { label: "Scheduled", tone: "bg-amber-50 text-amber-800" },
  settled: { label: "Settled · takes effect on its date", tone: "bg-sky-50 text-sky-800" },
  effective: { label: "Effective", tone: "bg-emerald-50 text-emerald-800" },
} as const;

/**
 * Update Tenancy's events on the Tenancy tab (7 Oct 2026 review): each one's
 * date, rent, IP and documents, and how far it has gone - Scheduled, IP
 * settled (documents made, rent changed from its date), Effective (its day
 * has come: the bed and end date have changed).
 */
export function TenancyEvents({ events }: { events: EventRow[] }) {
  const open = events.filter((e) => e.state !== "effective").sort((a, b) => a.date.localeCompare(b.date));
  const shown = open.length ? open : events.slice(0, 1);
  return (
    <Panel>
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="size-4 text-brand-deep" />
        <p className="text-sm font-semibold text-brand-deep">Tenancy changes</p>
      </div>
      <ul className="space-y-2">
        {shown.map((e) => {
          const ipLeft = e.ip ? Math.max(0, Math.round((e.ip.total - e.ip.paid) * 100) / 100) : 0;
          return (
            <li key={e.eventId} className="rounded-lg border border-border px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {fmtDate(e.date)} · {e.name}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE[e.state].tone}`}>{STATE[e.state].label}</span>
              </div>
              <dl className="mt-1.5 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                <div>
                  <dt className="inline">Rental </dt>
                  <dd className="inline text-foreground">
                    {Math.abs(e.rent - e.rentBefore) > 0.005 ? `${money(e.rentBefore)} → ${money(e.rent)}` : money(e.rent)} a month
                  </dd>
                </div>
                <div>
                  <dt className="inline">IP </dt>
                  <dd className="inline text-foreground">
                    {!e.ip
                      ? "None"
                      : ipLeft <= 0
                        ? `${e.ip.number || "Paid in advance"} · settled`
                        : `${e.ip.number || `Billed ${fmtDate(e.ip.billOn)}`} · ${money(ipLeft)} to pay`}
                  </dd>
                </div>
                <div>
                  <dt className="inline">Documents </dt>
                  <dd className="inline text-foreground">
                    {e.state === "scheduled" ? "after the IP is settled" : e.documents.length ? "made" : "none"}
                  </dd>
                </div>
              </dl>
              {e.waitingFor ? <p className="mt-1 text-xs text-amber-700">The new bed is still {e.waitingFor}'s - the move waits for their checkout.</p> : null}
              {e.adjustment ? <p className="mt-1 text-xs text-muted-foreground">RP adjustment {e.adjustment} for rent already billed.</p> : null}
              {e.credit ? <p className="mt-1 text-xs text-emerald-800">{money(e.credit)} account credit for rent already billed.</p> : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
