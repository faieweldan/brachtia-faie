import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";

import { Panel } from "@/components/admin/ops-ui";
import { StaffPicker } from "@/components/admin/Dropdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate, money } from "@/lib/ops-store";
import { cancelTenancyEvent } from "@/lib/tenancy-change.functions";
import { scheduleChange } from "@/lib/tenancy-change-toast";

type EventRow = {
  eventId: string;
  name: string;
  date: string;
  rentBefore: number;
  rent: number;
  periodEnd: string;
  ip: { number: string; total: number; paid: number; billOn: string } | null;
  documents: string[];
  state: "scheduled" | "settled" | "effective" | "cancelled";
  cancelled: { at: string; reason: string; approvedBy: string; toCredit: number; withEvent?: string } | null;
  waitingFor: string;
  adjustment: string;
  credit: number;
};

/**
 * One set of words for an event, used on the profile, the payment notice and
 * the tenancy history (Dani, 7 Oct 2026): Scheduled (IP not paid), Paid ·
 * Scheduled (waiting for its effective date), Effective, Cancelled.
 */
export const EVENT_STATE = {
  scheduled: { label: "Scheduled", tone: "bg-amber-50 text-amber-800" },
  settled: { label: "Paid · Scheduled", tone: "bg-sky-50 text-sky-800" },
  effective: { label: "Effective", tone: "bg-emerald-50 text-emerald-800" },
  cancelled: { label: "Cancelled", tone: "bg-muted text-muted-foreground" },
} as const;
const STATE = EVENT_STATE;

export function EventStatusPill({ state }: { state: keyof typeof EVENT_STATE }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${EVENT_STATE[state].tone}`}>{EVENT_STATE[state].label}</span>;
}

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Update Tenancy's events on the Tenancy tab (7 Oct 2026): each one's date,
 * rent, IP and documents, and how far it has gone - Scheduled, Settled
 * (documents made, rent changed from its date), Effective (its day has come).
 * An event not yet effective can be cancelled here, with a reason and the
 * staff member approving it; a cancelled one stays listed with that record.
 */
export function TenancyEvents({ events, residentId, onChanged }: { events: EventRow[]; residentId: string; onChanged: () => void }) {
  const [cancelling, setCancelling] = useState<EventRow | null>(null);
  const open = events.filter((e) => e.state === "scheduled" || e.state === "settled").sort((a, b) => a.date.localeCompare(b.date));
  // every change, the ones still to come first, then the rest newest first
  const shown = [...open, ...events.filter((e) => !open.includes(e))];
  const later = (e: EventRow) => open.filter((o) => o.date > e.date && o.eventId !== e.eventId);
  return (
    <Panel>
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="size-4 text-brand-deep" />
        <p className="text-sm font-semibold text-brand-deep">Tenancy change history</p>
      </div>
      <ul className="space-y-2">
        {shown.map((e) => {
          const ipLeft = e.ip ? Math.max(0, Math.round((e.ip.total - e.ip.paid) * 100) / 100) : 0;
          return (
            <li key={e.eventId} className="rounded-lg border border-border px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-sm font-medium ${e.state === "cancelled" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {fmtDate(e.date)} · {e.name}
                </span>
                <EventStatusPill state={e.state} />
                {e.state === "scheduled" || e.state === "settled" ? (
                  <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs text-rose-700" onClick={() => setCancelling(e)}>
                    Cancel event
                  </Button>
                ) : null}
              </div>
              {e.cancelled ? (
                <dl className="mt-1.5 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    <dt className="inline">Reason </dt>
                    <dd className="inline text-foreground">{e.cancelled.reason}</dd>
                  </div>
                  <div>
                    <dt className="inline">Approved by </dt>
                    <dd className="inline text-foreground">
                      {e.cancelled.approvedBy} · {stamp(e.cancelled.at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline">IP </dt>
                    <dd className="inline text-foreground">{e.ip ? `${e.ip.number || "Scheduled IP"} · void` : "None"}</dd>
                  </div>
                  <div>
                    <dt className="inline">To account credit </dt>
                    <dd className="inline text-foreground">{money(e.cancelled.toCredit)}</dd>
                  </div>
                </dl>
              ) : (
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
                    <dd className="inline text-foreground">{e.state === "scheduled" ? "after the IP is paid" : e.documents.length ? "made" : "none"}</dd>
                  </div>
                </dl>
              )}
              {e.waitingFor ? <p className="mt-1 text-xs text-amber-700">The new bed is still {e.waitingFor}'s - the move waits for their checkout.</p> : null}
              {e.adjustment && !e.cancelled ? <p className="mt-1 text-xs text-muted-foreground">RP adjustment {e.adjustment} for rent already billed.</p> : null}
              {e.credit && !e.cancelled ? <p className="mt-1 text-xs text-emerald-800">{money(e.credit)} account credit for rent already billed.</p> : null}
            </li>
          );
        })}
      </ul>
      {cancelling ? (
        <CancelEvent
          event={cancelling}
          alsoCancels={later(cancelling)}
          residentId={residentId}
          onClose={() => setCancelling(null)}
          onDone={() => {
            setCancelling(null);
            onChanged();
          }}
        />
      ) : null}
    </Panel>
  );
}

/** the cancellation itself: what happens, a reason, who approves */
function CancelEvent({
  event: e,
  alsoCancels,
  residentId,
  onClose,
  onDone,
}: {
  event: EventRow;
  alsoCancels: EventRow[];
  residentId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [busy, setBusy] = useState(false);
  const paid = e.ip?.paid ?? 0;
  async function go() {
    setBusy(true);
    try {
      const res = await cancelTenancyEvent({ data: { residentId, eventId: e.eventId, reason, approvedBy } });
      toast.success(`${res.cancelled.join(" and ")} cancelled`, {
        description: [
          res.toCredit ? `${money(res.toCredit)} moved to account credit.` : "Nothing was paid on it.",
          res.documentsCancelled ? "Its documents are marked cancelled." : "",
          res.scheduleEnd ? scheduleChange(res.scheduleEnd) : "",
        ]
          .filter(Boolean)
          .join(" "),
        duration: 12_000,
      });
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="admin-ui max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-brand-deep">Cancel {e.name.toLowerCase()}</DialogTitle>
          <DialogDescription>Effective {fmtDate(e.date)}. The resident keeps their current room and rent.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <li>{e.ip ? "The IP is voided and kept in the payment history." : "There is no IP."}</li>
          {paid > 0 ? <li>{money(paid)} paid moves to account credit - no cash refund here.</li> : null}
          {e.state === "settled" ? <li>The documents it made are marked cancelled, and the rent change is undone.</li> : null}
          {alsoCancels.length ? <li>Also cancelled, as it was priced from this one: {alsoCancels.map((a) => `${a.name}, ${fmtDate(a.date)}`).join("; ")}.</li> : null}
        </ul>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">Reason</span>
          <Textarea value={reason} onChange={(x) => setReason(x.target.value)} placeholder="e.g. Resident decided to remain in the current room" rows={3} />
        </label>
        <label className="flex items-center gap-3">
          <span className="text-xs font-medium text-foreground">Approved by</span>
          <StaffPicker value={approvedBy} onChange={setApprovedBy} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button variant="destructive" disabled={busy || reason.trim().length < 5 || !approvedBy} onClick={() => void go()}>
            {busy ? "Cancelling…" : "Cancel event"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
