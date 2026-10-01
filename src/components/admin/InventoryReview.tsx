import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PdfPreviewDialog } from "@/components/admin/PdfPreview";
import { confirmInventory, getInventoryReview, inventoryPdfUrl, openMoveOutCheck, sendBackInventory } from "@/lib/inventory.functions";
import {
  INVENTORY,
  MODE_LABEL,
  STATUS_LABEL,
  inventoryDefects,
  type InventoryMode,
  type InventoryRecord,
  type InventoryStatus,
} from "@/lib/inventory";

/**
 * Schedule C on the Tenancy tab (Dani, 1 Oct 2026). The resident checks the
 * unit on their signing link and sends it in; it waits here for Brachtia to
 * read it - defects first - and confirm, which signs it with the signatory
 * and makes the PDF. Then the move-out check can be opened on the same link.
 */

const STATE: Record<string, { label: string; tone: string }> = {
  none: { label: "Waiting for resident", tone: "border-border bg-muted text-muted-foreground" },
  open: { label: "Waiting for resident", tone: "border-border bg-muted text-muted-foreground" },
  submitted: { label: "To review", tone: "border-amber-200 bg-amber-100 text-amber-900" },
  signed: { label: "Signed", tone: "border-emerald-200 bg-emerald-100 text-emerald-900" },
};

export function InventoryPill({ state }: { state: string }) {
  const s = STATE[state] ?? STATE["none"]!;
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${s.tone}`}>{s.label}</span>;
}

/** The row's actions: View (the review), and what comes next. */
export function InventoryActions({ docId, status, onChanged }: { docId: string; status: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const toReview = status === "submitted";
  return (
    <>
      <Button size="sm" variant={toReview ? "default" : "ghost"} onClick={() => setOpen(true)}>
        {toReview ? "Review & sign" : "View"}
      </Button>
      {open ? <InventoryReviewDialog docId={docId} onClose={() => setOpen(false)} onChanged={onChanged} /> : null}
    </>
  );
}

function InventoryReviewDialog({ docId, onClose, onChanged }: { docId: string; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["inventory-review", docId], queryFn: () => getInventoryReview({ data: { docId } }) });
  const [tab, setTab] = useState<InventoryMode>("in");
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; title: string } | null>(null);

  const entry = q.data?.[tab] ?? null;
  const file = entry?.file as
    | { status: string; record?: InventoryRecord; submitted?: { at: string; typedName: string }; signed?: { at: string; by: string } }
    | undefined;

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["inventory-review", docId] });
    onChanged();
  }

  async function confirm() {
    setBusy(true);
    try {
      await confirmInventory({ data: { docId, mode: tab } });
      toast.success(`${MODE_LABEL[tab]} signed`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign it");
    } finally {
      setBusy(false);
    }
  }

  async function sendBack() {
    setBusy(true);
    try {
      await sendBackInventory({ data: { docId, mode: tab } });
      toast.success("Sent back", { description: "It is open on the resident's link to do again." });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send it back");
    } finally {
      setBusy(false);
    }
  }

  async function openOut() {
    setBusy(true);
    try {
      await openMoveOutCheck({ data: { docId } });
      toast.success("Move-out check opened", { description: "It is on the resident's signing link now." });
      await refresh();
      setTab("out");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open it");
    } finally {
      setBusy(false);
    }
  }

  async function showPdf() {
    try {
      const { base64 } = await inventoryPdfUrl({ data: { docId, mode: tab } });
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      setPdf({ url: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), title: `Schedule C – ${MODE_LABEL[tab]}` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the PDF");
    }
  }

  const record = file?.record;
  const defects = record ? inventoryDefects(record) : [];
  const fmt = (v: string) =>
    new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="admin-ui flex max-h-[90vh] max-w-2xl flex-col gap-4 overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-brand-deep">Schedule C – Inventory & Condition</DialogTitle>
            <DialogDescription>What the resident checked in the unit. Read the defects, then confirm and sign.</DialogDescription>
          </DialogHeader>

          {/* move-in and move-out, the same underlined tabs as elsewhere */}
          <div className="flex gap-1 border-b border-border">
            {(["in", "out"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTab(m)}
                className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${
                  tab === m ? "border-brand-deep text-brand-deep" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {MODE_LABEL[m]}
                <InventoryPill state={(q.data?.[m]?.file as { status?: string } | undefined)?.status ?? "none"} />
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {q.isLoading ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
            ) : !file || file.status === "open" ? (
              <div className="space-y-3 py-8 text-center text-sm text-muted-foreground">
                <p>
                  {tab === "in"
                    ? "The resident has not sent in the move-in check yet. It opens on their signing link on their check-in day."
                    : file
                      ? "The move-out check is open on the resident's signing link. It appears here once they send it in."
                      : "Not opened yet. Open it when the resident is about to move out - it goes on their signing link."}
                </p>
                {tab === "out" && !file ? (
                  <Button size="sm" disabled={busy || q.data?.in?.file?.status !== "signed"} onClick={() => void openOut()}>
                    Open move-out check
                  </Button>
                ) : null}
                {tab === "out" && !file && q.data?.in?.file?.status !== "signed" ? (
                  <p className="text-xs">The move-in check has to be signed first.</p>
                ) : null}
              </div>
            ) : record ? (
              <>
                {/* defects first: what needs a decision */}
                {defects.length ? (
                  <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                      <AlertTriangle className="size-4" /> {defects.length} defect{defects.length === 1 ? "" : "s"} reported
                    </p>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {defects.map((d, i) => (
                        <li key={i}>
                          <span className="font-medium text-foreground">{d.name}</span>
                          <span className="text-muted-foreground"> · {d.area}</span>
                          <p className="text-amber-900">{d.remark}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : (
                  <p className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                    <CheckCircle2 className="size-4" /> No defects reported.
                  </p>
                )}

                <section className="grid grid-cols-3 gap-2 text-sm">
                  {(
                    [
                      ["Keys", record.meters.keys],
                      ["Water meter", record.meters.water],
                      ["Electric meter", record.meters.electric],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-border p-2.5">
                      <p className="text-xs text-muted-foreground">{k}</p>
                      <p className="font-medium tabular-nums">{v || "—"}</p>
                    </div>
                  ))}
                </section>

                {record.generalRemarks.trim() ? (
                  <section className="rounded-lg border border-border p-3 text-sm">
                    <p className="text-xs text-muted-foreground">Anything else</p>
                    <p className="whitespace-pre-wrap">{record.generalRemarks}</p>
                  </section>
                ) : null}

                {/* every item, folded away - the defects above are what matter */}
                <details className="rounded-lg border border-border">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-deep">Every item</summary>
                  <div className="divide-y divide-border border-t border-border text-sm">
                    {INVENTORY.map((area) => (
                      <div key={area.id} className="px-3 py-2">
                        <p className="text-xs font-semibold text-muted-foreground">{area.name}</p>
                        {area.items.map((it) => {
                          const a = record.answers[it.id];
                          return (
                            <p key={it.id} className="flex justify-between gap-2">
                              <span>
                                {it.name}
                                {a?.qty && a.qty !== it.qty ? <span className="text-muted-foreground"> · counted {a.qty}</span> : null}
                              </span>
                              <span className={a?.status === "defect" ? "font-medium text-amber-700" : "text-muted-foreground"}>
                                {a?.status ? STATUS_LABEL[a.status as InventoryStatus] : "—"}
                              </span>
                            </p>
                          );
                        })}
                        {record.extras
                          .filter((e) => e.areaId === area.id && e.name.trim())
                          .map((e) => (
                            <p key={e.id} className="flex justify-between gap-2">
                              <span>
                                {e.name} <span className="text-muted-foreground">(added · {e.qty})</span>
                              </span>
                              <span className={e.status === "defect" ? "font-medium text-amber-700" : "text-muted-foreground"}>
                                {e.status ? STATUS_LABEL[e.status as InventoryStatus] : "—"}
                              </span>
                            </p>
                          ))}
                      </div>
                    ))}
                  </div>
                </details>

                <section className="flex items-center gap-3 rounded-lg border border-border p-3">
                  {entry?.signature ? <img src={entry.signature} alt="Resident's signature" className="h-12 w-auto" /> : null}
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Signed by {file.submitted?.typedName}</p>
                    <p>Sent in {file.submitted ? fmt(file.submitted.at) : ""}</p>
                    {file.signed ? (
                      <p className="text-emerald-800">
                        Confirmed by {file.signed.by || "Brachtia"} · {fmt(file.signed.at)}
                      </p>
                    ) : null}
                  </div>
                </section>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
            {file?.status === "signed" ? (
              <>
                <Button size="sm" variant="outline" onClick={() => void showPdf()}>
                  <FileText className="size-4" /> Signed PDF
                </Button>
                {tab === "in" && !q.data?.out ? (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void openOut()}>
                    Open move-out check
                  </Button>
                ) : null}
              </>
            ) : null}
            {file?.status === "submitted" ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void sendBack()}>
                Send back to resident
              </Button>
            ) : null}
            {file?.status === "submitted" ? (
              <Button size="sm" disabled={busy} onClick={() => void confirm()}>
                {busy ? "Signing…" : "Confirm & sign"}
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <PdfPreviewDialog title={pdf?.title ?? ""} fileName={`${pdf?.title ?? "Schedule C"}.pdf`} url={pdf?.url ?? null} onClose={() => setPdf(null)} />
    </>
  );
}
