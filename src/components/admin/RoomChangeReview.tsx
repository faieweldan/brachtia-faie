import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropdown, StaffPicker } from "@/components/admin/Dropdown";
import { DraftEye } from "@/components/admin/PdfPreview";
import { changeRoomBeforeStart, changeStayDatesBeforeStart, previewRoomChange } from "@/lib/admin.functions";
import { fmtDate, money } from "@/lib/ops-store";
import { ROOM_CHANGE_REASONS, STAY_DATE_REASONS, creditPartLabel } from "@/lib/room-change";

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
 * picked (Dani, 10 Oct 2026) - no popup. Also the review for new dates on a
 * paid booking before move-in (`dates` instead of `picked`, 13 Oct 2026): the
 * same server path, so the same price impact, documents and approval. Placement first, then the money only
 * when it moves, then the documents only when they need something, and who
 * approved it and why. On or after the tenancy start it points to Update
 * Tenancy instead.
 */
export function RoomChangeReview({
  enquiryId,
  residentId,
  current,
  picked,
  dates,
  onCancel,
  onDone,
}: {
  enquiryId: string;
  residentId?: string | undefined;
  /** "B-08-05 · Room C · Single" */
  current: string;
  /** a room change */
  picked?: RoomOption | undefined;
  /** or new dates in the same room: "01 Sep 2026 – 31 May 2027", and the rent it stays at */
  dates?: { from: string; to: string; rent: number } | undefined;
  onCancel: () => void;
  onDone: (res: RoomChangeResult & { ok: true }) => void;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rent = picked?.rent ?? dates?.rent ?? 0;
  /*
   * One key for this change (16 Oct 2026): Confirm pressed again, or after an
   * answer that never came back, sends the same key, so any account credit it
   * gives is given once. Another room, rent or dates is another change.
   */
  const changeId = picked ? `${picked.bedId}|${picked.rent}` : `dates:${dates?.to}`;
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const keyFor = useRef(changeId);
  useEffect(() => {
    if (keyFor.current === changeId) return;
    keyFor.current = changeId;
    setRequestKey(crypto.randomUUID());
  }, [changeId]);
  const preview = useQuery({
    queryKey: ["room-change", enquiryId, picked?.bedId ?? `dates:${dates?.to}`, rent],
    // the room's details too, so the drafts name it as Confirm will
    queryFn: () =>
      previewRoomChange({
        data: {
          enquiryId,
          newRent: rent,
          ...(picked?.bedId ? { bedId: picked.bedId } : {}),
          ...(picked?.roomName ? { roomName: picked.roomName } : {}),
          ...(picked?.occupancy ? { occupancy: picked.occupancy } : {}),
          ...(picked?.residenceName ? { residenceName: picked.residenceName } : {}),
          fromLabel: current,
          toLabel: picked?.label ?? "the new dates",
        },
      }),
    retry: false,
  });
  const p = preview.data;
  // it opens under a long list of rooms - brought into view, or nobody sees it (10 Oct 2026)
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [picked?.bedId, dates?.to]);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const res = !picked
        ? await changeStayDatesBeforeStart({
            data: { enquiryId, approvedBy, reason, ...(note.trim() ? { note: note.trim() } : {}), requestKey, ...(p?.key ? { expectedKey: p.key } : {}) },
          })
        : await changeRoomBeforeStart({
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
          // the figures shown here - refused if they moved since
          ...(p?.key ? { expectedKey: p.key } : {}),
        },
      });
      if (!res.ok) {
        setError([res.error, res.detail].filter(Boolean).join(" "));
        // a payment came in while this was open: show the figures as they are now
        if ("stale" in res && res.stale) void preview.refetch();
        return;
      }
      setRequestKey(crypto.randomUUID());
      onDone(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : picked ? "The room could not be changed." : "The dates could not be changed.");
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
  const drafts = (p?.drafts ?? {}) as {
    invoice?: import("@/lib/invoice-pdf").InvoiceDoc;
    ip?: import("@/lib/invoice-pdf").InvoiceDoc;
    credit?: import("@/lib/credit-note-pdf").CreditNoteDoc;
  };
  /*
   * The eye on a draft (Dani, 14 Oct 2026): the document Confirm will make,
   * built from the same figures as the rows beside it - the server handed both
   * over in one answer. A draft has no number, so it is not downloaded.
   */
  const eye = (what: string, build: () => Promise<string>) => <DraftEye what={what} build={build} />;
  const invoiceEye = (doc: import("@/lib/invoice-pdf").InvoiceDoc, what: string) =>
    eye(what, async () => (await import("@/lib/invoice-pdf")).invoicePdfUrl(doc));
  /** one figure to a line, the amount on the right */
  const figure = (label: string, value: React.ReactNode, strong = false) => (
    <div className={`flex justify-between gap-3 text-xs ${strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
  /** a document row: its name and the eye, then its figures beneath */
  const docRow = (title: React.ReactNode, eyeButton: React.ReactNode, figures: React.ReactNode) => (
    <div className="space-y-1.5 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{title}</span>
        {eyeButton}
      </div>
      <div className="space-y-1 rounded-lg bg-muted/40 px-2.5 py-2">{figures}</div>
    </div>
  );
  const itemTotal = (items: { amount: number; quantity?: number | undefined }[]) =>
    items.reduce((n, l) => n + l.amount * (l.quantity ?? 1), 0);

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
          <p>The tenancy has started, so {picked ? "a room change" : "a change of dates"} goes through Update Tenancy.</p>
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
            {picked ? (
              <>
                {line("Current placement", current)}
                {line("New placement", <span className="font-medium">{picked.label}</span>)}
                {line("Tenancy start", fmtDate(p.start))}
              </>
            ) : (
              <>
                {line("Room", current)}
                {line("Current dates", dates?.from)}
                {line("New dates", <span className="font-medium">{dates?.to}</span>)}
              </>
            )}
          </div>

          {/* the money, only when it moves */}
          {priceMoves || (m && m.kind !== "none" && m.kind !== "same") ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-brand-deep">Price impact</p>
              <div className="divide-y divide-border rounded-xl border border-border px-3">
                {line("Monthly rent", `${money(p.oldRent)} → ${money(p.newRent)}`)}
                {m?.kind === "revise"
                  ? docRow(
                      <>{p.invoice?.number} · revised</>,
                      drafts.invoice ? invoiceEye(drafts.invoice, `revised invoice ${p.invoice?.number}`) : null,
                      <>
                        {figure("Total", `${money(m.oldTotal)} → ${money(m.newTotal)}`)}
                        {figure("Paid to date", money(m.paid))}
                        {figure("Balance due", money(m.outstanding), true)}
                        {m.credit > 0.005 ? figure("To account credit", money(m.credit)) : null}
                      </>,
                    )
                  : m?.kind === "ip"
                    ? (
                      <>
                        {line(p.invoice?.number ?? "Invoice", "Fully paid · stays as it is")}
                        {docRow(
                          "New invoice (draft)",
                          drafts.ip ? invoiceEye(drafts.ip, "new Initial Payment invoice") : null,
                          <>
                            {(drafts.ip?.items ?? m.lines).map((l, i) => (
                              <div key={i}>{figure(l.label, money(l.amount))}</div>
                            ))}
                            <div className="border-t border-border pt-1">
                              {figure("Total due", money(drafts.ip ? itemTotal(drafts.ip.items) : m.difference), true)}
                            </div>
                          </>,
                        )}
                      </>
                    )
                    : m?.kind === "credit"
                      ? (
                        <>
                          {line(p.invoice?.number ?? "Invoice", "Fully paid · stays as it is")}
                          {docRow(
                            "Credit note (draft)",
                            drafts.credit
                              ? eye("credit note", async () => (await import("@/lib/credit-note-pdf")).creditNotePdfUrl(drafts.credit!))
                              : null,
                            <>
                              {(drafts.credit?.lines ?? m.parts.map((x) => ({ label: creditPartLabel(x), amount: x.amount }))).map((l, i) => (
                                <div key={i}>{figure(l.label, money(l.amount))}</div>
                              ))}
                              <div className="border-t border-border pt-1">
                                {figure("Carried forward as account credit", money(m.difference), true)}
                              </div>
                            </>,
                          )}
                        </>
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
                  ? docRow(
                      <>{p.invoice?.number} · {picked ? "room details" : "dates"} updated</>,
                      drafts.invoice ? invoiceEye(drafts.invoice, `updated invoice ${p.invoice?.number}`) : null,
                      <>
                        {figure("Total", money(m.total))}
                        {figure("Paid to date", money(p.invoice?.paid ?? 0))}
                        {figure("Balance due", money(m.outstanding), true)}
                      </>,
                    )
                  : null}
                {p.ta === "draft"
                  ? line(
                      "Tenancy agreement",
                      `Not signed yet - reset, to be made again for the new ${picked ? "room" : "dates"}`,
                    )
                  : p.ta === "signed"
                    ? line(
                        "Tenancy agreement",
                        "Signed - kept as the record. A revised Schedule A is made for the resident to sign again",
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
                {(picked ? ROOM_CHANGE_REASONS : STAY_DATE_REASONS).map((r) => (
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
            {busy ? "Changing…" : picked ? "Confirm room change" : "Confirm new dates"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** What is said once the room has changed - one sentence, by what happened to the money. */
export function roomChangeMessage(res: RoomChangeResult & { ok: true }, to: string, done = "Room changed") {
  const ta = res.ta === "revised" ? " A revised Schedule A is ready to sign." : res.ta === "reset" ? " The document pack is to be made again." : "";
  if (res.ipNumber)
    return `${done}. Initial Payment invoice ${res.ipNumber} was created for the ${money(res.ipAmount ?? 0)} difference.${ta}`;
  if (res.kind === "credit" && res.credit)
    return `${done}. ${money(res.credit)} was carried forward as account credit - it comes off the next rent.${ta}`;
  if (res.kind === "revise")
    return `${done}. Initial invoice ${res.invoice} was revised. New balance: ${money(res.outstanding ?? 0)}.${res.credit ? ` ${money(res.credit)} to account credit.` : ""}${ta}`;
  return `${done}${to ? ` to ${to}` : ""}. Payments and balance are unchanged.${ta}`;
}
