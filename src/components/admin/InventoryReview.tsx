import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileText, PackageX } from "lucide-react";
import { ReturnMessage } from "@/components/admin/InventoryReturnMessage";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PdfPreviewDialog } from "@/components/admin/PdfPreview";
import { PdfPageViewer } from "@/components/admin/PdfPageViewer";
import { STAFF } from "@/data/form-options";
import { StaffTag } from "@/components/admin/RecordPaymentDialog";
import { confirmInventory, getInventoryReview, inventoryPdfUrl, openMoveOutCheck, returnInventory } from "@/lib/inventory.functions";
import {
  INVENTORY,
  MODE_LABEL,
  REVIEW_HOURS,
  STATUS_LABEL,
  VERDICT_LABEL,
  inventoryDefects,
  inventoryNotProvided,
  liveDecisions,
  type DefectDecision,
  type InventoryMode,
  type InventoryRecord,
  type InventoryStatus,
} from "@/lib/inventory";

/**
 * Schedule C on the Tenancy tab (Dani, 1 Oct 2026). Two turns with Brachtia:
 *   1. the resident sends the check in, unsigned. Each defect is answered
 *      here - Resolved (fixed, outside the system) or Accepted (left as it
 *      is) - within 48 hours, and the check goes back to them
 *   2. they agree and sign. Approve stamps the saved signatory's
 *      signature and makes the PDF - nobody draws it again
 * Then the move-out check can be opened on the same link.
 */

/*
 * Schedule C's status, in the agreement's own words (Dani, 2 Oct 2026):
 *   Pending Submission  with the resident - checking the unit, or reading
 *                       Brachtia's answers and signing
 *   Pending Approval    with Brachtia - answering the defects, or approving
 *   Valid               approved, and the tenancy is running
 *   Coming Due          within 60 days of the tenancy's end
 *   Expired             the tenancy's end date has passed
 *   Terminated          ended early - not recorded anywhere yet, so not shown
 * Whose turn it is shows on the button: Review, Approve, or View.
 */
const STATE: Record<string, { label: string; tone: string }> = {
  pending_submission: { label: "Pending Submission", tone: "border-border bg-muted text-muted-foreground" },
  pending_approval: { label: "Pending Approval", tone: "border-amber-200 bg-amber-100 text-amber-900" },
  valid: { label: "Valid", tone: "border-emerald-200 bg-emerald-100 text-emerald-900" },
  coming_due: { label: "Coming Due", tone: "border-orange-200 bg-orange-100 text-orange-900" },
  expired: { label: "Expired", tone: "border-slate-300 bg-slate-200 text-slate-700" },
  terminated: { label: "Terminated", tone: "border-red-200 bg-red-100 text-red-900" },
};

/** The check's stage, and the tenancy's end, as one of the statuses above. */
export function scheduleCStatus(stage: string, periodEnd?: string): string {
  if (stage === "review" || stage === "submitted") return "pending_approval";
  if (stage !== "signed") return "pending_submission";
  const end = periodEnd ? new Date(`${periodEnd}T23:59:59+08:00`).getTime() : NaN;
  if (Number.isNaN(end)) return "valid";
  const left = end - Date.now();
  if (left < 0) return "expired";
  return left <= 60 * 86400000 ? "coming_due" : "valid";
}

/** the status column: a defect and a missing item each stand out (Dani, 2 Oct 2026) */
const TONE: Record<string, string> = {
  defect: "font-medium text-amber-700",
  not_provided: "font-medium text-sky-700",
};

export function InventoryPill({ stage, periodEnd }: { stage: string; periodEnd?: string | undefined }) {
  const s = STATE[scheduleCStatus(stage, periodEnd)]!;
  return (
    <span className={`inline-flex items-center justify-center whitespace-nowrap rounded-full border px-2 py-0.5 text-center text-[11px] font-semibold ${s.tone}`}>
      {s.label}
    </span>
  );
}

/** The row's actions: View (the review), and what comes next. */
export function InventoryActions({
  docId,
  stage,
  periodEnd,
  onChanged,
}: {
  docId: string;
  stage: string;
  periodEnd?: string | undefined;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Brachtia's turn: answer the defects, or approve
  const yours = stage === "review" || stage === "submitted";
  return (
    <>
      <Button size="sm" variant={yours ? "default" : "ghost"} onClick={() => setOpen(true)}>
        {stage === "review" ? "Review" : stage === "submitted" ? "Approve" : "View"}
      </Button>
      {open ? <InventoryReviewDialog docId={docId} periodEnd={periodEnd} onClose={() => setOpen(false)} onChanged={onChanged} /> : null}
    </>
  );
}

function InventoryReviewDialog({
  docId,
  periodEnd,
  onClose,
  onChanged,
}: {
  docId: string;
  periodEnd?: string | undefined;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["inventory-review", docId],
    queryFn: () => getInventoryReview({ data: { docId } }),
  });
  const [tab, setTab] = useState<InventoryMode>("in");
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; title: string } | null>(null);
  // a defect's photo, opened in its own window like the other previews (Dani, 2 Oct 2026)
  const [photo, setPhoto] = useState<{ url: string; title: string } | null>(null);

  const entry = q.data?.[tab] ?? null;
  const file = entry?.file as
    | {
        status: string;
        record?: InventoryRecord;
        decisions?: Record<string, DefectDecision>;
        reviewAt?: string;
        returnedAt?: string;
        submitted?: { at: string; typedName: string };
        signed?: { at: string; by: string };
        history?: { at: string; step: string; by?: string }[];
      }
    | undefined;
  // the answers being given now, before Send back
  const [verdicts, setVerdicts] = useState<Record<string, "resolved" | "accepted">>({});
  // who on the team answers or approves it (Dani, 6 Oct 2026)
  const [by, setBy] = useState("");

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["inventory-review", docId] });
    onChanged();
  }

  async function confirm() {
    if (!by) return void toast.error("Choose who is approving it");
    setBusy(true);
    try {
      await confirmInventory({ data: { docId, mode: tab, by } });
      toast.success(`${MODE_LABEL[tab]} signed`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign it");
    } finally {
      setBusy(false);
    }
  }

  async function sendBack() {
    if (!by) return void toast.error("Choose who is answering it");
    setBusy(true);
    try {
      await returnInventory({ data: { docId, mode: tab, verdicts: answers, by } });
      toast.success("Sent back to the resident", {
        description: "They read your answers, then sign - or send it back again.",
      });
      setVerdicts({});
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
      toast.success("Move-out check opened", {
        description: "It is on the resident's signing link now.",
      });
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
      setPdf({
        url: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })),
        title: `Schedule C – ${MODE_LABEL[tab]}`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the PDF");
    }
  }

  const record = file?.record;
  const defects = record ? inventoryDefects(record) : [];
  // items marked Not provided: answered too - Resolve is providing it, Accept is leaving it (Dani, 2 Oct 2026)
  const missing = record ? inventoryNotProvided(record) : [];
  // with the resident again, the answers can still change: the resident has no
  // "I disagree" button, so they message Brachtia and admin edits here (Dani, 2 Oct 2026)
  const returned = file?.status === "returned";
  const inReview = file?.status === "review" || returned;
  // what was answered before (a defect sent again unchanged), then what is picked now
  const kept = record ? liveDecisions(record, file?.decisions) : {};
  const answers: Record<string, "resolved" | "accepted"> = {
    ...Object.fromEntries(Object.entries(kept).map(([k, v]) => [k, v.verdict])),
    ...verdicts,
  };
  const unanswered = [...defects, ...missing].filter((d) => !answers[d.key]).length;
  const due = file?.reviewAt ? new Date(new Date(file.reviewAt).getTime() + REVIEW_HOURS * 3600 * 1000) : null;
  const fmt = (v: string) =>
    new Date(v).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kuala_Lumpur",
    });

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="admin-ui flex max-h-[90vh] max-w-3xl flex-col gap-4 overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-brand-deep">Schedule C – Inventory & Condition</DialogTitle>
            <DialogDescription>
              What the resident checked in the unit. Answer each defect and send it back; once they sign, approve it.
            </DialogDescription>
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
                {/* a move-out check not opened yet has no status to show */}
                {m === "in" || q.data?.[m] ? <InventoryPill stage={q.data?.[m]?.file.status ?? "open"} periodEnd={periodEnd} /> : null}
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
                    ? "The resident has not sent in the move-in check yet. It is on their signing link, after their documents."
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
                {file?.status === "review" && due ? (
                  <p className={`text-xs ${due.getTime() < Date.now() ? "font-medium text-red-700" : "text-muted-foreground"}`}>
                    Sent in {fmt(file!.reviewAt!)} · answer by {fmt(due.toISOString())}
                    {due.getTime() < Date.now() ? " - overdue" : ""}
                  </p>
                ) : null}
                {/* the PDF the resident signed, on top - their signature is seen only on it (Dani, 5 Oct 2026) */}
                {file.submitted ? <SignedCheck docId={docId} mode={tab} title={`Schedule C – ${MODE_LABEL[tab]}`} /> : null}
                {/* defects first: what needs an answer */}
                {defects.length ? (
                  <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                      <AlertTriangle className="size-4" /> {defects.length} defect{defects.length === 1 ? "" : "s"} reported
                    </p>
                    {inReview ? (
                      <p className="mt-0.5 text-xs text-amber-900/80">
                        Resolved: you fixed it. Accepted: it stays as it is, recorded as there before the resident moved in.
                      </p>
                    ) : null}
                    <ul className="mt-2 space-y-2.5 text-sm">
                      {defects.map((d) => {
                        const v = answers[d.key] ?? file?.decisions?.[d.key]?.verdict;
                        return (
                          <li key={d.key} className="flex flex-wrap items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="font-medium text-foreground">{d.name}</span>
                              <span className="text-muted-foreground"> · {d.area}</span>
                              <p className="text-amber-900">{d.remark}</p>
                              {d.photos.length ? (
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {d.photos.map((p) =>
                                    q.data?.photos?.[p] ? (
                                      <button
                                        key={p}
                                        type="button"
                                        onClick={() => setPhoto({ url: q.data!.photos[p]!, title: `${d.name} · ${d.area}` })}
                                        title="Open the photo"
                                      >
                                        <img src={q.data.photos[p]} alt={`${d.name} defect`} className="size-16 rounded-md border border-amber-300 object-cover" />
                                      </button>
                                    ) : null,
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">No photo</p>
                              )}
                            </div>
                            {inReview ? (
                              <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-border bg-background">
                                {(["resolved", "accepted"] as const).map((x, i) => (
                                  <button
                                    key={x}
                                    type="button"
                                    onClick={() => setVerdicts((m) => ({ ...m, [d.key]: x }))}
                                    className={`px-2.5 py-1 text-xs font-medium ${i ? "border-l border-border" : ""} ${
                                      v === x
                                        ? x === "resolved"
                                          ? "bg-emerald-600 text-white"
                                          : "bg-slate-600 text-white"
                                        : "text-muted-foreground hover:bg-muted"
                                    }`}
                                  >
                                    {x === "resolved" ? "Resolve" : "Accept"}
                                  </button>
                                ))}
                              </div>
                            ) : v ? (
                              <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground">
                                {VERDICT_LABEL[v]}
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : (
                  <p className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                    <CheckCircle2 className="size-4" /> No defects reported.
                    {inReview ? " Send it back so the resident can sign." : ""}
                  </p>
                )}

                {missing.length ? (
                  <section className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-900">
                      <PackageX className="size-4" /> {missing.length} item{missing.length === 1 ? "" : "s"} not provided
                    </p>
                    {inReview ? (
                      <p className="mt-0.5 text-xs text-sky-900/80">
                        Resolve: Brachtia will provide it. Accept: it stays not provided, recorded that way.
                      </p>
                    ) : null}
                    <ul className="mt-2 space-y-2 text-sm">
                      {missing.map((d) => {
                        const v = answers[d.key] ?? file?.decisions?.[d.key]?.verdict;
                        return (
                          <li key={d.key} className="flex flex-wrap items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="font-medium text-foreground">{d.name}</span>
                              <span className="text-muted-foreground"> · {d.area}</span>
                              {d.remark ? <p className="text-sky-900">{d.remark}</p> : null}
                            </div>
                            {inReview ? (
                              <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-border bg-background">
                                {(["resolved", "accepted"] as const).map((x, i) => (
                                  <button
                                    key={x}
                                    type="button"
                                    onClick={() => setVerdicts((m) => ({ ...m, [d.key]: x }))}
                                    className={`px-2.5 py-1 text-xs font-medium ${i ? "border-l border-border" : ""} ${
                                      v === x ? (x === "resolved" ? "bg-emerald-600 text-white" : "bg-slate-600 text-white") : "text-muted-foreground hover:bg-muted"
                                    }`}
                                  >
                                    {x === "resolved" ? "Resolve" : "Accept"}
                                  </button>
                                ))}
                              </div>
                            ) : v ? (
                              <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground">
                                {VERDICT_LABEL[v]}
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : null}

                {record.generalRemarks.trim() ? (
                  <section className="rounded-lg border border-border p-3 text-sm">
                    <p className="text-xs text-muted-foreground">Anything else</p>
                    <p className="whitespace-pre-wrap">{record.generalRemarks}</p>
                  </section>
                ) : null}

                {/* every item, folded away - the defects above are what matter */}
                <details className="rounded-lg border border-border">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-deep">Every item</summary>
                  {/* the form's table: Item, Qty, Details, Status, Remarks (Dani, 1 Oct 2026) */}
                  <div className="overflow-x-auto border-t border-border">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2 font-semibold">Item</th>
                          <th className="px-2 py-2 font-semibold">Qty</th>
                          <th className="px-2 py-2 font-semibold">Details</th>
                          <th className="px-2 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Remarks</th>
                        </tr>
                      </thead>
                      {INVENTORY.map((area) => (
                        <tbody key={area.id} className="border-t border-border">
                          <tr>
                            <td colSpan={5} className="bg-muted/50 px-3 py-1.5 text-xs font-semibold text-brand-deep">
                              {area.name}
                            </td>
                          </tr>
                          {area.items.map((it) => {
                            const a = record.answers[it.id];
                            return (
                              <tr key={it.id} className="border-t border-border/60 align-top">
                                <td className="px-3 py-1.5">{it.name}</td>
                                <td className="px-2 py-1.5 tabular-nums">{a?.qty || it.qty}</td>
                                <td className="px-2 py-1.5 text-muted-foreground">{it.details ? a?.detail || "—" : "—"}</td>
                                <td className={`px-2 py-1.5 ${TONE[a?.status ?? ""] ?? "text-muted-foreground"}`}>
                                  {a?.status ? STATUS_LABEL[a.status as InventoryStatus] : "—"}
                                </td>
                                <td className="px-3 py-1.5 text-muted-foreground">{a?.remark || ""}</td>
                              </tr>
                            );
                          })}
                          {record.extras
                            .filter((e) => e.areaId === area.id && e.name.trim())
                            .map((e) => (
                              <tr key={e.id} className="border-t border-border/60 align-top">
                                <td className="px-3 py-1.5">
                                  {e.name} <span className="text-muted-foreground">(added)</span>
                                </td>
                                <td className="px-2 py-1.5 tabular-nums">{e.qty}</td>
                                <td className="px-2 py-1.5 text-muted-foreground">—</td>
                                <td className={`px-2 py-1.5 ${TONE[e.status] ?? "text-muted-foreground"}`}>
                                  {e.status ? STATUS_LABEL[e.status as InventoryStatus] : "—"}
                                </td>
                                <td className="px-3 py-1.5 text-muted-foreground">{e.remark}</td>
                              </tr>
                            ))}
                        </tbody>
                      ))}
                    </table>
                  </div>
                </details>

                {file.submitted ? (
                  <section className="flex items-center gap-3 rounded-lg border border-border p-3">
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
                ) : file.status === "returned" ? (
                  <>
                  {q.data?.resident ? <ReturnMessage residentId={q.data.resident.id} phone={q.data.resident.mobile} defects={defects.length} /> : null}
                  <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                    With the resident{file.returnedAt ? ` since ${fmt(file.returnedAt)}` : ""}. They read your answers, then sign - or send
                    it back to you again. If they tell you an answer is wrong, change it above and send the changed answers.
                  </p>
                  </>
                ) : null}
              </>
            ) : null}
          </div>

          {/* Brachtia's steps and who took them - missing on checks answered before 6 Oct 2026 */}
          {file?.history?.some((h) => h.by) ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {file.history
                .filter((h) => h.by)
                .map((h, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    {h.step === "answered" ? "Reviewed" : "Approved"} {fmt(h.at)} <StaffTag name={h.by ?? ""} />
                  </span>
                ))}
            </div>
          ) : null}
          {inReview || file?.status === "submitted" ? (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{file?.status === "submitted" ? "Approved by" : "Reviewed by"}</p>
              <div className="grid grid-cols-3 gap-2">
                {STAFF.map((n) => (
                  <Button key={n} type="button" size="sm" variant={by === n ? "default" : "outline"} onClick={() => setBy(n)}>
                    {n}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
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
            {inReview ? (
              <Button size="sm" disabled={busy || unanswered > 0} onClick={() => void sendBack()}>
                {unanswered
                  ? `Answer ${unanswered} more item${unanswered === 1 ? "" : "s"}`
                  : busy
                    ? "Sending…"
                    : returned
                      ? "Send the changed answers"
                      : "Send back to resident"}
              </Button>
            ) : null}
            {file?.status === "submitted" ? (
              <Button size="sm" disabled={busy} onClick={() => void confirm()}>
                {busy ? "Approving…" : "Approve"}
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!photo} onOpenChange={(o) => !o && setPhoto(null)}>
        <DialogContent aria-describedby={undefined} className="flex h-[90vh] w-[94vw] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-border py-3 pl-5 pr-14">
            <DialogTitle className="truncate text-base">{photo?.title}</DialogTitle>
            {photo ? (
              <Button asChild size="sm" variant="outline">
                <a href={photo.url} download target="_blank" rel="noreferrer">
                  <Download className="size-4" /> Download
                </a>
              </Button>
            ) : null}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center bg-neutral-900 p-4">
            {photo ? <img src={photo.url} alt={photo.title} className="max-h-full max-w-full object-contain" /> : null}
          </div>
        </DialogContent>
      </Dialog>
      <PdfPreviewDialog title={pdf?.title ?? ""} fileName={`${pdf?.title ?? "Schedule C"}.pdf`} url={pdf?.url ?? null} onClose={() => setPdf(null)} />
    </>
  );
}

/** The signed check as a PDF, inside the window, with Preview and Download. */
function SignedCheck({ docId, mode, title }: { docId: string; mode: InventoryMode; title: string }) {
  const q = useQuery({
    queryKey: ["inventory-signed-pdf", docId, mode],
    queryFn: async () => {
      const { base64 } = await inventoryPdfUrl({ data: { docId, mode } });
      return URL.createObjectURL(new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: "application/pdf" }));
    },
  });
  const [open, setOpen] = useState(false);
  if (q.isLoading) return <p className="text-xs text-muted-foreground">Loading the signed PDF…</p>;
  if (!q.data) return null;
  return (
    <section className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Signed by the resident</p>
        <span className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <FileText className="size-4" /> Preview
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={q.data} download={`${title}.pdf`}>
              <Download className="size-4" /> Download
            </a>
          </Button>
        </span>
      </div>
      <PdfPageViewer url={q.data} fileName={`${title}.pdf`} />
      <PdfPreviewDialog title={title} fileName={`${title}.pdf`} url={open ? q.data : null} onClose={() => setOpen(false)} />
    </section>
  );
}
