import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropdown, StaffPicker } from "@/components/admin/Dropdown";
import { changeRoomBeforeStart, previewRoomChange } from "@/lib/admin.functions";
import { fmtDate, money } from "@/lib/ops-store";
import { ROOM_CHANGE_REASONS } from "@/lib/room-change";

/** A room picked in the booking's Room assignment picker. */
export type RoomOption = {
  bedId: string;
  /** "A-10-11 · Room A · Twin 1" */
  label: string;
  residenceName: string;
  residenceSlug?: string | undefined;
  rent: number;
  roomCode?: string | undefined;
  roomName?: string | undefined;
  unitType?: string | undefined;
  occupancy?: string | undefined;
  /** a twin room nobody is in, let whole as one single */
  whole?: boolean | undefined;
};

export type RoomChangeResult = Awaited<ReturnType<typeof changeRoomBeforeStart>>;

/**
 * The review under the booking's own Room assignment picker, once a room is
 * picked (Dani, 10 Oct 2026) - no popup. Placement first, then the money only
 * when it moves, then the documents only when they need something, and who
 * approved it and why. On or after the tenancy start it points to Update
 * Tenancy instead.
 */
export function RoomChangeReview({
  enquiryId,
  residentId,
  current,
  picked,
  onCancel,
  onDone,
}: {
  enquiryId: string;
  residentId?: string | undefined;
  /** "B-08-05 · Room C · Single" */
  current: string;
  picked: RoomOption;
  onCancel: () => void;
  onDone: (res: RoomChangeResult & { ok: true }) => void;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /*
   * One key for this room change (16 Oct 2026): Confirm pressed again, or after
   * an answer that never came back, sends the same key, so any account credit
   * it gives is given once. Another room or rent picked is another room change.
   */
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const keyFor = useRef(`${picked.bedId}|${picked.rent}`);
  useEffect(() => {
    const now = `${picked.bedId}|${picked.rent}`;
    if (keyFor.current === now) return;
    keyFor.current = now;
    setRequestKey(crypto.randomUUID());
  }, [picked.bedId, picked.rent]);
  const preview = useQuery({
    queryKey: ["room-change", enquiryId, picked.bedId, picked.rent],
    queryFn: () => previewRoomChange({ data: { enquiryId, newRent: picked.rent } }),
    retry: false,
  });
  const p = preview.data;
  // it opens under a long list of rooms - brought into view, or nobody sees it (10 Oct 2026)
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [picked.bedId]);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const res = await changeRoomBeforeStart({
        data: {
          enquiryId,
          bedId: picked.bedId,
          newRent: picked.rent,
          ...(picked.roomCode ? { roomCode: picked.roomCode } : {}),
          ...(picked.roomName ? { roomName: picked.roomName } : {}),
          ...(picked.unitType ? { unitType: picked.unitType } : {}),
          ...(picked.residenceSlug ? { residenceSlug: picked.residenceSlug } : {}),
          ...(picked.residenceName ? { residenceName: picked.residenceName } : {}),
          ...(picked.occupancy ? { occupancy: picked.occupancy } : {}),
          ...(picked.whole ? { whole: true } : {}),
          approvedBy,
          reason,
          ...(note.trim() ? { note: note.trim() } : {}),
          fromLabel: current,
          toLabel: picked.label,
          requestKey,
        },
      });
      if (!res.ok) {
        setError([res.error, res.detail].filter(Boolean).join(" "));
        return;
      }
      setRequestKey(crypto.randomUUID());
      onDone(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The room could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  const line = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
  const m = p?.money;
  const priceMoves = !!p && Math.abs(p.oldRent - p.newRent) > 0.005;

  return (
    <div ref={box} className="scroll-mt-24 space-y-4 rounded-xl border border-brand-deep/30 bg-muted/20 p-4">
      <p className="text-sm font-semibold text-brand-deep">Review and confirm</p>
      {preview.error ? (
        <p className="text-sm text-rose-700">
          {preview.error instanceof Error ? preview.error.message : "Could not work it out."}
        </p>
      ) : preview.isLoading || !p ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Working it out…</p>
      ) : !p.allowed ? (
        <div className="space-y-3 text-sm">
          <p>The tenancy has started, so a room change goes through Update Tenancy.</p>
          {residentId ? (
            <Button size="sm" asChild>
              <Link to="/admin/residents/$id" params={{ id: residentId }}>
                Open the resident
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {/* placement first */}
          <div className="divide-y divide-border rounded-xl border border-border px-3">
            {line("Current placement", current)}
            {line("New placement", <span className="font-medium">{picked.label}</span>)}
            {line("Tenancy start", fmtDate(p.start))}
          </div>

          {/* the money, only when it moves */}
          {priceMoves || (m && m.kind !== "none" && m.kind !== "same") ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-brand-deep">Price impact</p>
              <div className="divide-y divide-border rounded-xl border border-border px-3">
                {line("Monthly rent", `${money(p.oldRent)} → ${money(p.newRent)}`)}
                {m?.kind === "revise"
                  ? line(
                      "Invoice update",
                      <>
                        {p.invoice?.number} revised {money(m.oldTotal)} → {money(m.newTotal)}
                        <span className="block text-xs text-muted-foreground">
                          Paid {money(m.paid)} · outstanding {money(m.outstanding)}
                          {m.credit > 0.005 ? ` · ${money(m.credit)} to account credit` : ""}
                        </span>
                      </>,
                    )
                  : m?.kind === "ip"
                    ? line(
                        "Invoice update",
                        <>
                          {p.invoice?.number} stays paid. New Initial Payment invoice for{" "}
                          {money(m.difference)}
                          <span className="block text-xs text-muted-foreground">
                            {m.lines.map((l) => `${l.label} ${money(l.amount)}`).join(" · ")}
                          </span>
                        </>,
                      )
                    : m?.kind === "credit"
                      ? line(
                          "Invoice update",
                          `${p.invoice?.number} stays paid. ${money(m.difference)} carried forward as account credit.`,
                        )
                      : null}
              </div>
            </div>
          ) : null}

          {/* documents, only when something needs doing */}
          {m?.kind === "same" || p.ta !== "none" ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-brand-deep">Documents</p>
              <div className="divide-y divide-border rounded-xl border border-border px-3">
                {m?.kind === "same"
                  ? line(
                      "Invoice update",
                      `${p.invoice?.number}: room details updated, balance unchanged`,
                    )
                  : null}
                {p.ta === "draft"
                  ? line(
                      "Tenancy agreement",
                      "Not signed yet - reset, to be made again for the new room",
                    )
                  : p.ta === "signed"
                    ? line(
                        "Tenancy agreement",
                        "Signed - kept. Issue a revised pack from the Tenancy tab",
                      )
                    : null}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Reason</p>
              <Dropdown
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-9 w-full"
              >
                <option value="">Choose…</option>
                {ROOM_CHANGE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Dropdown>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Approved by</p>
              <StaffPicker value={approvedBy} onChange={setApprovedBy} className="w-full" />
            </div>
          </div>
          {reason === "Other" ? (
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What is the reason?"
            />
          ) : null}
          {error ? <p className="text-xs text-rose-700">{error}</p> : null}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        {p?.allowed ? (
          <Button
            disabled={
              busy || !reason || !approvedBy || (reason === "Other" && note.trim().length < 3)
            }
            onClick={() => void confirm()}
          >
            {busy ? "Changing…" : "Confirm room change"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** What is said once the room has changed - one sentence, by what happened to the money. */
export function roomChangeMessage(res: RoomChangeResult & { ok: true }, to: string) {
  if (res.ipNumber)
    return `Room changed. Initial Payment invoice ${res.ipNumber} was created for the ${money(res.ipAmount ?? 0)} difference.`;
  if (res.kind === "credit" && res.credit)
    return `Room changed. ${money(res.credit)} was carried forward as account credit.`;
  if (res.kind === "revise")
    return `Room changed. Initial invoice ${res.invoice} was revised. New balance: ${money(res.outstanding ?? 0)}.${res.credit ? ` ${money(res.credit)} to account credit.` : ""}`;
  return `Room changed to ${to}. Payments and balance are unchanged.`;
}
