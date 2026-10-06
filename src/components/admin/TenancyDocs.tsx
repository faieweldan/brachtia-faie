import { useState } from "react";
import { Dropdown } from "@/components/admin/Dropdown";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, FileStack, Plus, Stamp, Undo2, Upload } from "lucide-react";
import { SigningMessageCard } from "@/components/admin/SigningMessageCard";
import { STAFF } from "@/data/form-options";
import { StaffTag } from "@/components/admin/RecordPaymentDialog";
import { InventoryActions, InventoryPill } from "@/components/admin/InventoryReview";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { DocumentViewDialog } from "@/components/admin/DocumentViewDialog";
import { PdfPreviewDialog } from "@/components/admin/PdfPreview";
import {
  REPLACEMENT_FEE,
  REPLACEMENT_REASONS,
  accessCardReceiptNames,
  accessCardReceiptUrl,
  activateAccessCard,
  cancelReplacementCard,
  getReplacementCard,
  startReplacementCard,
} from "@/lib/access-card.functions";
import {
  Select as Choice,
  SelectContent as ChoiceContent,
  SelectItem as ChoiceItem,
  SelectTrigger as ChoiceTrigger,
  SelectValue as ChoiceValue,
} from "@/components/ui/select";
import { fullAgreementPdf, uploadExistingAgreement, uploadStampPage } from "@/lib/agreement-files.functions";
import { EmptyState, Panel, Select, StatusPill } from "@/components/admin/ops-ui";
import { fmtDate, money, type Resident, type Tenancy } from "@/lib/ops-store";
import {
  ACCESS_CARD_END_STATES,
  ACCESS_CARD_REASONS,
  ACCESS_CARD_STATUSES,
  DOC_STATUSES,
  DOC_TYPE_LABELS,
  type AccessCardForm,
  type AgreementDoc,
  type AgreementDocType,
  type TenancyAgreement,
} from "@/lib/tenancy-docs";
import {
  createAccessCardForm,
  getTenancyDocs,
  setDocumentStatus,
  undoDocumentPack,
  updateAccessCard,
} from "@/lib/tenancy-docs.functions";

const DOC_ORDER: AgreementDocType[] = ["agreement", "sched_a", "sched_b", "sched_c"];
// signed, whatever came after - what can be stamped and put in the full agreement
const DONE = ["signed", "pending_stamping", "stamped"];

const pdfUrl = (base64: string) =>
  URL.createObjectURL(new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: "application/pdf" }));

/**
 * The stamp page, uploaded beside the document's name (Dani, 1 Oct 2026): it
 * is one extra page from the stamping, put in front of the signed document.
 * Uploading it marks the document Stamped; uploading again replaces it.
 */
function StampUpload({ doc, onChanged }: { doc: AgreementDoc; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("documentId", doc.id);
      fd.set("file", file);
      await uploadStampPage({ data: fd });
      toast.success(`${DOC_TYPE_LABELS[doc.docType].split(" – ")[0]} stamped`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload the stamp page");
    } finally {
      setBusy(false);
    }
  }
  const stamped = doc.status === "stamped";
  return (
    <label
      title={stamped ? "Replace the stamp page" : "Upload the stamp page (PDF or photo)"}
      className={`relative ml-2 inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        stamped ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-dashed border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {stamped ? <Check className="size-3" /> : <Stamp className="size-3" />}
      {busy ? "Uploading…" : stamped ? "Stamped" : "Upload stamp"}
      <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} />
    </label>
  );
}

function docLabel(status: string) {
  return DOC_STATUSES.find((s) => s.key === status)?.label ?? status;
}

function cardLabel(status: string) {
  return (
    ACCESS_CARD_STATUSES.find((s) => s.key === status)?.label ??
    ACCESS_CARD_END_STATES.find((s) => s.key === status)?.label ??
    status
  );
}

/** the latest version of each document type in an agreement */
function latestDocs(agreement: TenancyAgreement): AgreementDoc[] {
  return DOC_ORDER.map((t) => {
    const versions = agreement.documents.filter((d) => d.docType === t);
    return versions.sort((a, b) => b.version - a.version)[0];
  }).filter(Boolean) as AgreementDoc[];
}

function versionsOf(agreement: TenancyAgreement, docType: AgreementDocType): AgreementDoc[] {
  return agreement.documents
    .filter((d) => d.docType === docType)
    .sort((a, b) => b.version - a.version);
}

function DocumentRow({
  doc,
  agreement,
  depth,
  onChanged,
}: {
  doc: AgreementDoc;
  agreement: TenancyAgreement;
  depth: number;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<{ kind: "agreement"; id: string; title: string } | null>(null);
  const versions = versionsOf(agreement, doc.docType);
  const hasHistory = versions.length > 1;
  const nextStatus = DOC_STATUSES[DOC_STATUSES.findIndex((s) => s.key === doc.status) + 1];

  async function advance() {
    if (!nextStatus) return;
    try {
      await setDocumentStatus({ data: { documentId: doc.id, status: nextStatus.key } });
      toast.success(`${DOC_TYPE_LABELS[doc.docType]} marked ${nextStatus.label}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the document");
    }
  }

  return (
    <>
      <tr className="border-t border-border">
        <td className="py-2.5 pr-3" style={{ paddingLeft: depth ? "1.75rem" : undefined }}>
          <span className="flex items-center gap-1.5">
            {hasHistory ? (
              <button
                type="button"
                onClick={() => setOpen(!open)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Show earlier versions"
              >
                {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              </button>
            ) : depth ? (
              <span className="w-3.5" />
            ) : null}
            <span className={depth ? "text-sm text-foreground" : "text-sm font-medium text-foreground"}>
              {/* a paper agreement, uploaded whole: it is the full agreement, not only the General Terms */}
              {doc.mergeValues["source"] === "uploaded" && doc.docType === "agreement" ? "Tenancy Agreement (uploaded, all pages)" : DOC_TYPE_LABELS[doc.docType]}
              {doc.version > 1 ? (
                <span className="ml-1.5 text-xs text-muted-foreground">v{doc.version}</span>
              ) : null}
            </span>
          </span>
        </td>
        <td className="py-2.5 pr-3 text-sm text-muted-foreground">{agreement.agreementNo}</td>
        <td className="py-2.5 pr-3 text-sm text-muted-foreground">{fmtDate(doc.effectiveDate)}</td>
        <td className="py-2.5 pr-3 text-sm text-muted-foreground">
          {doc.periodStart && doc.periodEnd
            ? `${fmtDate(doc.periodStart)} – ${fmtDate(doc.periodEnd)}`
            : "—"}
        </td>
        <td className="py-2.5 pr-3">
          {/* Schedule C is checked by the resident and reviewed here (1 Oct 2026) */}
          {doc.docType === "sched_c" ? (
            <InventoryPill stage={doc.stage ?? "open"} periodEnd={doc.periodEnd} />
          ) : (
            <StatusPill status={doc.status} label={docLabel(doc.status)} />
          )}
        </td>
        <td className="py-2.5 text-right">
          <span className="inline-flex flex-wrap justify-end gap-1.5">
            {doc.docType === "sched_c" ? (
              <InventoryActions docId={doc.id} stage={doc.stage ?? "open"} periodEnd={doc.periodEnd} onChanged={onChanged} />
            ) : (
            <>
            <Button size="sm" variant="ghost" onClick={() => setViewing({ kind: "agreement", id: doc.id, title: DOC_TYPE_LABELS[doc.docType] })}>
              View
            </Button>
            {/*
              No "Mark ..." buttons (Dani, 2 Oct 2026): Pending Signature comes
              from sending the link, Signed from signing, Stamped from the stamp
              upload beside the agreement number.
            */}
            </>
            )}
          </span>
          <DocumentViewDialog target={viewing} title={viewing?.title ?? ""} onClose={() => setViewing(null)} />
        </td>
      </tr>
      {open
        ? versions.slice(1).map((v) => (
            <tr key={v.id} className="border-t border-border/50 bg-muted/40">
              <td className="py-2 pr-3 text-xs text-muted-foreground" style={{ paddingLeft: "3rem" }}>
                {DOC_TYPE_LABELS[v.docType]} · v{v.version} (superseded)
              </td>
              <td className="py-2 pr-3 text-xs text-muted-foreground">{agreement.agreementNo}</td>
              <td className="py-2 pr-3 text-xs text-muted-foreground">{fmtDate(v.effectiveDate)}</td>
              <td className="py-2 pr-3 text-xs text-muted-foreground">
                {v.periodStart && v.periodEnd
                  ? `${fmtDate(v.periodStart)} – ${fmtDate(v.periodEnd)}`
                  : "—"}
              </td>
              <td className="py-2 pr-3">
                <StatusPill status={v.status} label={docLabel(v.status)} />
              </td>
              <td />
            </tr>
          ))
        : null}
    </>
  );
}

function AgreementBlock({
  agreement,
  onChanged,
}: {
  agreement: TenancyAgreement;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const docs = latestDocs(agreement);
  const parent = docs.find((d) => d.docType === "agreement");
  const schedules = docs.filter((d) => d.docType !== "agreement");

  /*
   * A pack nothing has happened to yet can be taken back and made again - a
   * pack generated before a template changed, say (Dani, 30 Sep 2026).
   */
  // until anything is signed - a sent link or an unconfirmed inventory check does not stop it
  const untouched = docs.length > 0 && agreement.documents.every((d) => ["generated", "pending_signature", "submitted"].includes(d.status));
  const [undoing, setUndoing] = useState(false);
  const [busy, setBusy] = useState(false);
  // every document signed: the whole agreement opens as one PDF
  const complete = docs.length > 0 && docs.every((d) => DONE.includes(d.status));
  const [full, setFull] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  async function openFull() {
    setOpening(true);
    try {
      const { base64 } = await fullAgreementPdf({ data: { agreementId: agreement.id } });
      setFull(pdfUrl(base64));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the agreement");
    } finally {
      setOpening(false);
    }
  }
  async function undo() {
    setBusy(true);
    try {
      await undoDocumentPack({ data: { agreementId: agreement.id } });
      toast.success(`${agreement.agreementNo} reset - generate the pack again when ready`);
      setUndoing(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reset the pack");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center gap-2 pr-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex shrink-0 items-center gap-2 py-3 pl-4 text-left text-sm font-semibold text-brand-deep"
      >
        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        {agreement.agreementNo}
      </button>
      {/* the stamp is for the agreement as a whole: one upload, beside its number (Dani, 2 Oct 2026) */}
      {parent && DONE.includes(parent.status) ? <StampUpload doc={parent} onChanged={onChanged} /> : null}
      {agreement.kind === "renewal" ? (
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Renewal</span>
      ) : null}
      {/* who made it - kept quiet, beside the number (Dani, 6 Oct 2026) */}
      {parent?.mergeValues["prepared_by"] ? (
        <span
          className="text-[11px] text-muted-foreground"
          title={parent.mergeValues["prepared_at"] ? `on ${new Date(parent.mergeValues["prepared_at"]).toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur" })}` : undefined}
        >
          by {parent.mergeValues["prepared_by"]}
        </span>
      ) : null}
      <button type="button" onClick={() => setExpanded(!expanded)} aria-label="Show or hide documents" className="flex min-w-0 flex-1 justify-end py-3 pr-1">
        {parent ? <StatusPill status={parent.status} label={docLabel(parent.status)} /> : null}
      </button>
      {complete ? (
        <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" disabled={opening} onClick={() => void openFull()}>
          <FileStack className="mr-1 size-3.5" /> {opening ? "Opening…" : "Full agreement"}
        </Button>
      ) : null}
      <PdfPreviewDialog title={`${agreement.agreementNo} – Full agreement`} fileName={`${agreement.agreementNo}.pdf`} url={full} onClose={() => setFull(null)} />
      {untouched ? (
        <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-xs text-muted-foreground" onClick={() => setUndoing(true)}>
          <Undo2 className="mr-1 size-3.5" /> Reset
        </Button>
      ) : null}
      </div>
      <Dialog open={undoing} onOpenChange={(o) => !busy && setUndoing(o)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Reset {agreement.agreementNo}?</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-3 text-xs" disabled={busy} onClick={() => setUndoing(false)}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" size="sm" className="h-7 px-3 text-xs" disabled={busy} onClick={() => void undo()}>
              {busy ? "Resetting…" : "Reset"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {expanded ? (
        <div className="overflow-x-auto px-4 pb-3">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Document</th>
                <th className="pb-2 pr-3 font-medium">Agreement No.</th>
                <th className="pb-2 pr-3 font-medium">Effective Date</th>
                <th className="pb-2 pr-3 font-medium">Period</th>
                <th className="pb-2 pr-3 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {parent ? (
                <DocumentRow doc={parent} agreement={agreement} depth={0} onChanged={onChanged} />
              ) : null}
              {schedules.map((d) => (
                <DocumentRow key={d.id} doc={d} agreement={agreement} depth={1} onChanged={onChanged} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function AccessCardTable({
  cards,
  residentId,
  onChanged,
  onCardCharge,
  onOpenInvoice,
}: {
  cards: AccessCardForm[];
  residentId: string;
  onChanged: () => void;
  /** opens the additional-charge invoice on Payments, filled in */
  onCardCharge?: ((line: { label: string; amount: number }) => void) | undefined;
  /** shows an invoice already raised, on Payments */
  onOpenInvoice?: ((number: string) => void) | undefined;
}) {
  const [adding, setAdding] = useState(false);
  const [viewCard, setViewCard] = useState<{ id: string; n: number } | null>(null);
  const [reason, setReason] = useState<string>("");
  // a lost or damaged card waiting for its invoice, then its payment
  const replacement = useQuery({
    queryKey: ["access-card-replacement", residentId],
    queryFn: () => getReplacementCard({ data: { residentId } }),
  });
  const waiting = replacement.data?.request ?? null;
  const activeIds = cards.filter((c) => c.status === "active").map((c) => c.id);
  const receiptNames = useQuery({
    queryKey: ["access-card-receipt-names", activeIds.join(",")],
    queryFn: () => accessCardReceiptNames({ data: { cardIds: activeIds } }),
    enabled: activeIds.length > 0,
  });
  // ARC's receipt and the serial number, for the form being made Active
  const [activating, setActivating] = useState<AccessCardForm | null>(null);
  const [serial, setSerial] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptBy, setReceiptBy] = useState("");
  const [busy, setBusy] = useState(false);

  async function activate() {
    if (!activating) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("cardId", activating.id);
      fd.set("serial", serial);
      fd.set("by", receiptBy);
      if (receipt) fd.set("file", receipt);
      await activateAccessCard({ data: fd });
      toast.success("Access card Active", { description: `Serial ${serial.trim()}` });
      setActivating(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  /** Lost or Damaged: the card in use ends now, and its invoice opens */
  async function startReplacement() {
    setBusy(true);
    try {
      const line = await startReplacementCard({ data: { residentId, reason: reason as (typeof REPLACEMENT_REASONS)[number] } });
      toast.success(`The card in use is marked ${reason === "Lost Card" ? "Lost" : "Damaged"}`, {
        description: "Generate the invoice. The new form is made once it is paid.",
      });
      setAdding(false);
      setReason("");
      onChanged();
      await replacement.refetch();
      onCardCharge?.(line);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the replacement");
    } finally {
      setBusy(false);
    }
  }

  async function cancelReplacement() {
    try {
      await cancelReplacementCard({ data: { residentId } });
      await replacement.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel it");
    }
  }

  async function openReceipt(id: string) {
    try {
      const { url } = await accessCardReceiptUrl({ data: { cardId: id } });
      if (url) window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the receipt");
    }
  }

  return (
    <Panel
      title="Access Card"
      description="Made by Brachtia and handed to ARC. Each form is a new record - nothing is overwritten."
      action={
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="mr-1 size-3.5" /> New Access Card Form
        </Button>
      }
    >
      {waiting ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="min-w-0 flex-1">
            Replacement - {waiting.reason}.{" "}
            {waiting.invoiceId ? (
              <>
                Waiting for payment of{" "}
                {/* straight to the invoice on Payments - no copying the number (Dani, 4 Oct 2026) */}
                <button
                  type="button"
                  onClick={() => onOpenInvoice?.(waiting.invoiceNumber ?? "")}
                  className="font-semibold underline underline-offset-2 hover:text-amber-950"
                >
                  {waiting.invoiceNumber || "its invoice"}
                </button>
                . The new form is made once it is paid in full.
              </>
            ) : (
              "No invoice yet."
            )}
          </span>
          {waiting.invoiceId ? null : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const fee = REPLACEMENT_FEE[waiting.reason];
                  if (fee) onCardCharge?.({ label: fee.label, amount: fee.amount });
                }}
              >
                Raise the invoice
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void cancelReplacement()}>
                Cancel
              </Button>
            </>
          )}
        </div>
      ) : null}
      {cards.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Form</th>
                <th className="pb-2 pr-3 font-medium">Date</th>
                <th className="pb-2 pr-3 font-medium">Reason</th>
                <th className="pb-2 pr-3 font-medium">Serial No.</th>
                <th className="pb-2 pr-3 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c, i) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="py-2.5 pr-3 text-sm text-foreground">Access Card Form {cards.length - i}</td>
                  <td className="py-2.5 pr-3 text-sm text-muted-foreground">{fmtDate(c.formDate)}</td>
                  <td className="py-2.5 pr-3 text-sm text-muted-foreground">{c.reason}</td>
                  <td className="py-2.5 pr-3 text-sm text-muted-foreground">{c.cardNo || "—"}</td>
                  <td className="py-2.5 pr-3">
                    <StatusPill status={c.status} label={cardLabel(c.status)} />
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="inline-flex flex-wrap justify-end gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => setViewCard({ id: c.id, n: cards.length - i })}>
                        View
                      </Button>
                      {/* ARC has approved it: their receipt and the card's serial number make it Active */}
                      {c.status === "pending_approval" || c.status === "generated" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSerial(c.cardNo);
                            setReceipt(null);
                            setReceiptBy("");
                            setActivating(c);
                          }}
                        >
                          Receipt & serial
                        </Button>
                      ) : null}
                      {c.status === "active" ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => void openReceipt(c.id)}>
                            Receipt
                          </Button>
                          <StaffTag name={receiptNames.data?.[c.id] ?? ""} />
                        </>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No access card forms yet.</p>
      )}

      {/* a replacement: Lost or Damaged only - a unit change gets its form from Update Tenancy */}
      <Dialog open={adding} onOpenChange={(v) => !busy && setAdding(v)}>
        <DialogContent className="admin-ui">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-brand-deep">New Access Card Form</DialogTitle>
            <DialogDescription>
              The invoice opens at the Schedule B price - lost RM60, damaged RM30. The new form is made when that invoice is
              paid.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Reason</p>
            <Choice value={reason} onValueChange={setReason}>
              <ChoiceTrigger>
                <ChoiceValue placeholder="Lost or damaged?" />
              </ChoiceTrigger>
              <ChoiceContent className="admin-ui">
                {REPLACEMENT_REASONS.map((r) => (
                  <ChoiceItem key={r} value={r}>
                    {r}
                  </ChoiceItem>
                ))}
              </ChoiceContent>
            </Choice>
          </div>
          {/* what generating does to the card in use - small, in the warning red (Dani, 5 Oct 2026) */}
          <p className="text-xs text-amber-800">
            This marks the access card in use as {reason === "Damaged Card" ? "Damaged" : "Lost"}.
          </p>
          <Button disabled={!reason || busy || !!waiting?.invoiceId} onClick={() => void startReplacement()}>
            {busy ? "Saving…" : "Generate invoice"}
          </Button>
          {waiting?.invoiceId ? <p className="text-xs text-amber-800">A replacement is already waiting for payment.</p> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!activating} onOpenChange={(v) => !v && !busy && setActivating(null)}>
        <DialogContent className="admin-ui">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-brand-deep">ARC receipt and serial number</DialogTitle>
            <DialogDescription>From the building management, once they approve the form. The card becomes Active.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Access card serial number</p>
            <Input autoFocus value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="e.g. 0012345" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">ARC&apos;s receipt</p>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} className="text-xs" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Uploaded by</p>
            <div className="grid grid-cols-3 gap-2">
              {STAFF.map((n) => (
                <Button key={n} type="button" size="sm" variant={receiptBy === n ? "default" : "outline"} onClick={() => setReceiptBy(n)}>
                  {n}
                </Button>
              ))}
            </div>
          </div>
          <Button disabled={busy || !serial.trim() || !receipt || !receiptBy} onClick={() => void activate()}>
            {busy ? "Saving…" : "Save - make Active"}
          </Button>
        </DialogContent>
      </Dialog>
      <DocumentViewDialog
        target={viewCard ? { kind: "card", id: viewCard.id } : null}
        title={viewCard ? `Access Card Form ${viewCard.n}` : ""}
        onClose={() => setViewCard(null)}
      />
    </Panel>
  );
}

/**
 * The Tenancy tab: the document-pack prompt before generation, and the
 * agreements + access card tables after.
 */
export function TenancyDocs({
  resident,
  tenancy,
  checklist,
  onCardCharge,
  onOpenInvoice,
}: {
  resident: Resident;
  tenancy?: Tenancy | undefined;
  checklist?: React.ReactNode;
  /** a lost or damaged card's invoice, opened on Payments */
  onCardCharge?: (line: { label: string; amount: number }) => void;
  onOpenInvoice?: (number: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["tenancy-docs", resident.id],
    queryFn: () => getTenancyDocs({ data: { residentId: resident.id } }),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["tenancy-docs", resident.id] });

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading tenancy documents…</p>;
  }

  if (!data.agreements.length) {
    return (
      <Panel>
        <div className="flex flex-col items-start gap-3">
          <div>
            <p className="text-sm font-semibold text-brand-deep">Resident profile complete</p>
            <p className="text-sm text-muted-foreground">
              Review the resident and tenancy information before generating the initial documents.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" disabled={!tenancy}>
              <Link to="/admin/residents/$id/document-pack" params={{ id: resident.id }}>
                Create Document Pack
              </Link>
            </Button>
            {/* a resident who signed on paper before the website */}
            <UploadExisting resident={resident} tenancy={tenancy} onDone={refresh} />
          </div>
          {!tenancy ? (
            <p className="text-xs text-muted-foreground">Create the tenancy first.</p>
          ) : null}
        </div>
      </Panel>
    );
  }

  return (
    <>
      {checklist}
      <Panel
        title="Tenancy Agreements"
        description="Legal agreement records and revisions. Earlier versions are always kept."
      >
        <div className="space-y-3">
          <SigningMessageCard
            residentId={resident.id}
            phone={resident.mobile}
            packId={data.agreements[0]!.id}
            // nothing signed in the latest pack yet: the message is still to send
            fresh={!data.agreements[0]!.documents.some((d: AgreementDoc) => ["signed", "pending_stamping", "stamped"].includes(d.status))}
          />
          {(data.agreements as TenancyAgreement[]).map((a) => (
            <AgreementBlock key={a.id} agreement={a} onChanged={refresh} />
          ))}
        </div>
      </Panel>
      <AccessCardTable cards={data.accessCards} residentId={resident.id} onChanged={refresh} onCardCharge={onCardCharge} onOpenInvoice={onOpenInvoice} />
    </>
  );
}

/**
 * An existing resident's tenancy, signed on paper before the website (Dani,
 * 1 Oct 2026): upload the scans and the pack is recorded as already signed.
 * The Tenancy Agreement is needed; the schedules are added when there are any.
 */
function UploadExisting({ resident, tenancy, onDone }: { resident: Resident; tenancy?: Tenancy | undefined; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<Partial<Record<AgreementDocType, File>>>({});
  // who is uploading it - required (Dani, 6 Oct 2026)
  const [preparedBy, setPreparedBy] = useState("");
  const [start, setStart] = useState(tenancy?.start ?? "");
  const [end, setEnd] = useState(tenancy?.end ?? "");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("residentId", resident.id);
      fd.set("periodStart", start);
      fd.set("periodEnd", end);
      fd.set("preparedBy", preparedBy);
      for (const [k, f] of Object.entries(files)) if (f) fd.set(k, f);
      const { agreementNo } = await uploadExistingAgreement({ data: fd });
      toast.success(`${agreementNo} recorded`, { description: "Uploaded as signed." });
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload the agreement");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Upload className="size-4" /> Upload existing agreement
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="admin-ui max-w-md">
          <DialogHeader>
            <DialogTitle>Upload existing agreement</DialogTitle>
            <DialogDescription>For a resident who signed on paper. Upload the whole agreement as one PDF.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* the paper agreement is one document - one file, every page (Dani, 5 Oct 2026) */}
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">
                Signed tenancy agreement, all pages<span className="text-red-600"> *</span>
              </span>
              <Input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => { const f = e.target.files?.[0]; setFiles(f ? { agreement: f } : {}); }}
                className="h-9 text-xs"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Tenancy start</span>
                <DateInput value={start} onChange={(e) => setStart(e.target.value)} className="h-9" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Tenancy end</span>
                <DateInput value={end} onChange={(e) => setEnd(e.target.value)} className="h-9" />
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <label className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
              Uploaded by
              <Dropdown
                value={preparedBy}
                onChange={(e) => setPreparedBy(e.target.value)}
                className={`h-8 rounded-md border bg-background px-2 text-xs text-foreground ${preparedBy ? "border-border" : "border-amber-400"}`}
              >
                <option value="">Choose…</option>
                {STAFF.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Dropdown>
            </label>
            <Button size="sm" disabled={busy || !files.agreement || !preparedBy} onClick={() => void save()}>
              {busy ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** merge values from the current records, for revisions and renewals */
export function currentMergeValues(
  resident: Resident,
  tenancy: Tenancy | undefined,
  placed:
    | { unit: { unitNo: string; residenceName: string }; room: { letter: string }; bed: { label: string; rent?: number | undefined } }
    | undefined,
  overrides: Record<string, string> = {},
): Record<string, string> {
  const rent = tenancy?.rent || 0;
  return {
    agreement_date: new Date().toISOString().slice(0, 10),
    resident_name: resident.fullName,
    id_number: resident.idNumber,
    residence: placed?.unit.residenceName ?? "",
    unit_no: placed?.unit.unitNo ?? "",
    room: placed ? `Room ${placed.room.letter}` : "",
    bed: placed?.bed.label ?? "",
    tenancy_start: tenancy?.start || resident.moveIn || "",
    tenancy_end: tenancy?.end || "",
    monthly_rent: rent ? String(rent) : "",
    payment_schedule: resident.paySchedule,
    deposit: "",
    ...overrides,
  };
}

export { money };

