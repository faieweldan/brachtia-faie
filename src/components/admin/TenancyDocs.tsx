import { roomName } from "@/lib/room-name";
import { useState } from "react";
import { DismissibleNotice } from "@/components/ui/notice";
import { soldBedLabel } from "@/lib/placement";
import { Dropdown, StaffPicker } from "@/components/admin/Dropdown";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfileReview, isPendingReview } from "@/lib/profile-link.functions";
import { ExternalLink, Check, ChevronDown, ChevronRight, FileStack, Plus, RefreshCw, Stamp, Undo2, Upload } from "lucide-react";
import { MIGRATED, MIGRATED_MEANING } from "@/lib/migration/import-plan";
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
import { Switch } from "@/components/ui/switch";
import { DateInput } from "@/components/ui/date-input";
import { DocumentViewDialog } from "@/components/admin/DocumentViewDialog";
import { PdfPreviewDialog } from "@/components/admin/PdfPreview";
import {
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
import { fmtDate, money, type Resident } from "@/lib/ops-store";
import { completeness } from "@/lib/resident-fields";
import type { ServerTenancy } from "@/lib/rental-schedule.functions";
import {
  ACCESS_CARD_END_STATES,
  ACCESS_CARD_REASONS,
  ACCESS_CARD_STATUSES,
  DOC_STATUSES,
  DOC_TYPE_LABELS,
  notNeeded,
  type AccessCardForm,
  type AgreementDoc,
  type AgreementDocType,
  type TenancyAgreement,
} from "@/lib/tenancy-docs";
import {
  createAccessCardForm,
  getTenancyDocs,
  setDocumentStatus,
  regenerateAgreement,
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

/**
 * Newest first - but a version a cancelled Update Tenancy made is never the
 * current one (7 Oct 2026): the version before it stands again, and the
 * cancelled one is listed below with the older ones.
 */
const byCurrent = (a: AgreementDoc, b: AgreementDoc) =>
  Number(a.status === "cancelled") - Number(b.status === "cancelled") || b.version - a.version;

/** the current version of each document type in an agreement */
function latestDocs(agreement: TenancyAgreement): AgreementDoc[] {
  return DOC_ORDER.map((t) => {
    const versions = agreement.documents.filter((d) => d.docType === t);
    return versions.sort(byCurrent)[0];
  }).filter(Boolean) as AgreementDoc[];
}

function versionsOf(agreement: TenancyAgreement, docType: AgreementDocType): AgreementDoc[] {
  return agreement.documents.filter((d) => d.docType === docType).sort(byCurrent);
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
      {/* a Schedule C hidden from the signing link greys out (Dani, 28 Oct 2026) */}
      <tr className={doc.docType === "sched_c" && notNeeded(doc.mergeValues) ? "border-t border-border opacity-50" : "border-t border-border"}>
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
              {doc.mergeValues["source"] === "uploaded" && doc.docType === "agreement"
                ? "Tenancy Agreement (uploaded, all pages)"
                : doc.mergeValues["source"] === "migrated"
                  ? "Tenancy Agreement (signed, all pages)"
                  : DOC_TYPE_LABELS[doc.docType]}
              {/* signed before the system: the same "Migrated" tag the invoice carries */}
              {doc.mergeValues["source"] === "migrated" ? (
                <span title={MIGRATED_MEANING} className="ml-1.5 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                  {MIGRATED}
                </span>
              ) : null}
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
              <ScheduleCNeeded doc={doc} onChanged={onChanged}>
                <InventoryActions docId={doc.id} stage={doc.stage ?? "open"} periodEnd={doc.periodEnd} onChanged={onChanged} />
              </ScheduleCNeeded>
            ) : (
            <>
            {doc.mergeValues["source"] === "migrated" ? (
              // the signed original lives on Google Drive - there is no template to show
              <Button size="sm" variant="ghost" asChild>
                <a href={doc.mergeValues["original_url"]} target="_blank" rel="noopener noreferrer">
                  Open original <ExternalLink className="ml-1 size-3.5" />
                </a>
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setViewing({ kind: "agreement", id: doc.id, title: DOC_TYPE_LABELS[doc.docType] })}>
                View
              </Button>
            )}
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
                {DOC_TYPE_LABELS[v.docType]} · v{v.version} ({v.status === "cancelled" ? "cancelled" : "superseded"})
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
  stay,
}: {
  agreement: TenancyAgreement;
  onChanged: () => void;
  /** the tenancy as it is now - its dates and room - the pack says which it was made for */
  stay?: { start: string; end: string; unitNo?: string | undefined; room?: string | undefined } | undefined;
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
  /*
   * What an Update Tenancy change made belongs to it while it stands (Dani, 14
   * Oct 2026): a second agreement is never reset away - it is made again in
   * place, same number (regenerateAgreement) - and a first pack with a schedule
   * the change revised cannot be reset. Cancelling the change takes them away.
   */
  const byChange = agreement.kind === "renewal";
  const revisedByChange = agreement.documents.some((d) => d.version > 1 && d.status !== "cancelled");
  const canRedo = untouched && (byChange || !revisedByChange);
  const [undoing, setUndoing] = useState(false);
  const [busy, setBusy] = useState(false);
  // every document signed: the whole agreement opens as one PDF
  const complete = docs.length > 0 && docs.every((d) => DONE.includes(d.status));
  const [full, setFull] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  async function openFull() {
    setOpening(true);
    try {
      // before every document is signed: the agreement draft (Dani, 7 Oct 2026)
      const { base64 } = await fullAgreementPdf({ data: { agreementId: agreement.id, draft: !complete } });
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
      if (byChange) {
        await regenerateAgreement({ data: { agreementId: agreement.id } });
        toast.success(`${agreement.agreementNo} generated again`);
      } else {
        await undoDocumentPack({ data: { agreementId: agreement.id } });
        toast.success(`${agreement.agreementNo} reset - generate the pack again when ready`);
      }
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
      {parent && DONE.includes(parent.status) && parent.mergeValues?.["source"] !== "migrated" ? <StampUpload doc={parent} onChanged={onChanged} /> : null}
      {agreement.kind === "renewal" ? (
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Renewal</span>
      ) : null}
      {agreement.documents.length && agreement.documents.every((d) => d.status === "cancelled") ? (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Cancelled</span>
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
      {docs.length ? (
        <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" disabled={opening} onClick={() => void openFull()}>
          <FileStack className="mr-1 size-3.5" /> {opening ? "Opening…" : complete ? "Full agreement" : "Agreement draft"}
        </Button>
      ) : null}
      <PdfPreviewDialog
        title={`${agreement.agreementNo} – ${complete ? "Full agreement" : "Agreement draft"}`}
        fileName={complete ? `${agreement.agreementNo}.pdf` : `${agreement.agreementNo} DRAFT - not signed.pdf`}
        url={full}
        onClose={() => setFull(null)}
      />
      {canRedo ? (
        <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-xs text-muted-foreground" onClick={() => setUndoing(true)}>
          {byChange ? <RefreshCw className="mr-1 size-3.5" /> : <Undo2 className="mr-1 size-3.5" />} {byChange ? "Generate again" : "Reset"}
        </Button>
      ) : null}
      </div>
      <Dialog open={undoing} onOpenChange={(o) => !busy && setUndoing(o)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{byChange ? `Generate ${agreement.agreementNo} again?` : `Reset ${agreement.agreementNo}?`}</DialogTitle>
          </DialogHeader>
          {byChange ? (
            <p className="text-sm text-muted-foreground">
              Made again from the Update Tenancy change, with the same number. The unsigned documents are replaced.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-3 text-xs" disabled={busy} onClick={() => setUndoing(false)}>
              Keep it
            </Button>
            <Button type="button" variant={byChange ? "default" : "destructive"} size="sm" className="h-7 px-3 text-xs" disabled={busy} onClick={() => void undo()}>
              {byChange ? (busy ? "Generating…" : "Generate again") : busy ? "Resetting…" : "Reset"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/*
        The stay changed after this pack was made - the booking's dates moved
        and Update invoice carried them to the tenancy (Dani, 9 Oct 2026). The
        documents still say the old dates, and so does the access card form
        made with them. Nothing signed is ever rewritten.
      */}
      {(() => {
        const made = parent ?? docs[0];
        if (!stay?.start || !stay.end || !made?.periodStart || !made.periodEnd) return null;
        if (agreement.documents.every((d) => d.status === "cancelled")) return null;
        // a second agreement is for its change's room and dates, not today's stay - read against
        // the tenancy it always looked out of date, and invited a reset (14 Oct 2026)
        if (byChange) return null;
        // the room it names: a booking moved to another room before check-in needs it made again too
        const v = made.mergeValues;
        const madeUnit = String(v["Unit_no"] || v["unit_no"] || "").trim();
        const madeRoom = String(v["Room_no"] || v["room"] || "").replace(/^room\s*/i, "").trim();
        const roomMoved =
          (!!stay.unitNo && !!madeUnit && madeUnit !== stay.unitNo) ||
          (!!stay.room && !!madeRoom && madeRoom.toUpperCase() !== stay.room.toUpperCase());
        const datesMoved = made.periodStart !== stay.start || made.periodEnd !== stay.end;
        if (!datesMoved && !roomMoved) return null;
        const was = [
          roomMoved ? `${madeUnit} · ${roomName(madeRoom)}` : "",
          datesMoved ? `${fmtDate(made.periodStart)} – ${fmtDate(made.periodEnd)}` : "",
        ].filter(Boolean).join(", ");
        const now = [
          roomMoved ? `${stay.unitNo} · ${roomName(stay.room)}` : "",
          datesMoved ? `${fmtDate(stay.start)} – ${fmtDate(stay.end)}` : "",
        ].filter(Boolean).join(", ");
        /*
         * Signed, and the change already revised what it touches (a room change
         * before move-in revises Schedule A, 13 Oct 2026): nothing left to do,
         * so it is news, said once and gone (Dani, 14 Oct 2026). Only while a
         * pack still has to be made again does the box stay.
         */
        const revised = untouched
          ? []
          : docs.filter((d) => {
              if (d.version <= 1 || d.status === "cancelled") return false;
              const dv = d.mergeValues;
              const unit = String(dv["Unit_no"] || dv["unit_no"] || "").trim();
              const room = String(dv["Room_no"] || dv["room"] || "").replace(/^room\s*/i, "").trim();
              const roomOk = !roomMoved || (unit === stay.unitNo && room.toUpperCase() === String(stay.room).toUpperCase());
              const datesOk = !datesMoved || (d.periodStart === stay.start && d.periodEnd === stay.end) || !d.periodStart;
              return roomOk && datesOk;
            });
        if (revised.length) {
          return (
            <DismissibleNotice className="mx-4 mb-3" seenKey={`${agreement.id}:${now}`}>
              <span>
                {was} → <strong>{now}</strong> ·{" "}
                {revised.map((d) => DOC_TYPE_LABELS[d.docType].split(" – ")[0]).join(", ")} revised
              </span>
            </DismissibleNotice>
          );
        }
        return (
          <div className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span>
              Made for {was}. The stay is now <strong>{now}</strong>.{" "}
              {canRedo
                ? byChange
                  ? "Generate it again - the same agreement, from the change that made it."
                  : "Reset the pack and generate it again - the access card form is made again with it."
                : "Signed documents stay as they are: issue a revised pack, and a new Access Card Form below."}
            </span>
            {canRedo ? (
              <Button type="button" size="sm" variant="outline" className="h-7 bg-white px-3 text-xs" onClick={() => setUndoing(true)}>
                {byChange ? "Generate again" : "Reset and generate again"}
              </Button>
            ) : null}
          </div>
        );
      })()}
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

  // a residence without a card form (Solstice): no Access Card panel (28 Oct 2026)
  if (replacement.data && !replacement.data.cardForm && !cards.length) return null;

  return (
    <Panel
      title="Access Card"
      description="Made by Brachtia and handed to ARC."
      action={
        replacement.data?.cardForm === false ? undefined : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-3.5" /> New Access Card Form
          </Button>
        )
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
                  title="Opens the Payments tab, at this invoice"
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
                  const line = replacement.data?.line;
                  if (line) onCardCharge?.(line);
                  else toast.error("This residence has no price for this card. Add it in Website › Residences › Terms & fees › Additional charges.");
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
              The invoice opens at this residence's Schedule B price. The new form is made when that invoice is paid.
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
            <StaffPicker value={receiptBy} onChange={setReceiptBy} />
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
 * Create Document Pack, asking first when the profile is not finished (Dani,
 * 13 Oct 2026). The pack fills the agreement from the profile, so a gap shows
 * as a blank on the paper. Asking is enough: a resident may sign before the
 * last details are in. The figure is completeness() - the same number as the
 * bar at the top of the page.
 */
function CreatePackButton({ residentId, disabled, missing, pct }: { residentId: string; disabled: boolean; missing: number; pct: number }) {
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  // a submitted profile not yet reviewed is warned about too (Dani, 15 Oct 2026)
  const { data: review } = useQuery({
    queryKey: ["profile-review", residentId],
    queryFn: () => getProfileReview({ data: { residentId } }),
  });
  const pending = isPendingReview(review);
  const go = () => void navigate({ to: "/admin/residents/$id/document-pack", params: { id: residentId } });
  return (
    <>
      <Button size="sm" disabled={disabled} onClick={() => (missing || pending ? setAsking(true) : go())}>
        Create Document Pack
      </Button>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pending && !missing ? "The profile is not reviewed" : "The profile is not finished"}</DialogTitle>
            <DialogDescription>
              {missing ? (
                <>
                  {pct}% complete - {missing} {missing === 1 ? "field" : "fields"} still to fill in. The agreement is filled from the
                  profile, so anything missing is left blank on it.{" "}
                </>
              ) : null}
              {pending ? "The submitted profile is pending review. " : null}
              Continue anyway?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={go}>
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
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
  place,
}: {
  resident: Resident;
  tenancy?: ServerTenancy | undefined;
  /** where they are placed now, for spotting a pack made for another room */
  place?: { unitNo: string; room: string } | undefined;
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
    const profile = completeness(resident);
    return (
      <Panel>
        <div className="flex flex-col items-start gap-3">
          <div>
            {/* says what is true: it used to read "complete" at 16% (13 Oct 2026) */}
            <p className="text-sm font-semibold text-brand-deep">
              {profile.pct >= 100 ? "Resident profile complete" : `Resident profile ${profile.pct}% complete`}
            </p>
            <p className="text-sm text-muted-foreground">
              Review the resident and tenancy information before generating the initial documents.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CreatePackButton residentId={resident.id} disabled={!tenancy} missing={profile.missing.length} pct={profile.pct} />
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
          {/* a migrated pack was signed before the system: nothing to send until
              the system adds a document of its own, e.g. Schedule v1 (Dani, 12 Oct 2026) */}
          {data.agreements[0]!.documents.some((d: AgreementDoc) => d.mergeValues?.["source"] !== "migrated") ? (
          <SigningMessageCard
            residentId={resident.id}
            phone={resident.mobile}
            packId={data.agreements[0]!.id}
            // nothing signed in the latest pack yet: the message is still to send
            fresh={!data.agreements[0]!.documents.some((d: AgreementDoc) => ["signed", "pending_stamping", "stamped"].includes(d.status))}
          />
          ) : null}
          {(data.agreements as TenancyAgreement[]).map((a) => (
            <AgreementBlock
              key={a.id}
              agreement={a}
              onChanged={refresh}
              stay={
                tenancy?.start && tenancy.end
                  ? { start: tenancy.start, end: tenancy.end, unitNo: place?.unitNo, room: place?.room }
                  : undefined
              }
            />
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
function UploadExisting({ resident, tenancy, onDone }: { resident: Resident; tenancy?: ServerTenancy | undefined; onDone: () => void }) {
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
  tenancy: ServerTenancy | undefined,
  placed:
    | {
        unit: { unitNo: string; residenceName: string };
        // its beds too: a twin room let whole is written as the single it was sold as
        room: { letter: string; occupancy?: string | undefined; beds?: { holdFor?: string | undefined }[] | undefined };
        bed: { label: string; rent?: number | undefined };
      }
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
    room: placed ? roomName(placed.room.letter) : "",
    bed: placed ? soldBedLabel(placed.room, placed.bed) : "",
    tenancy_start: tenancy?.start || resident.moveIn || "",
    tenancy_end: tenancy?.end || "",
    monthly_rent: rent ? String(rent) : "",
    payment_schedule: resident.paySchedule,
    deposit: "",
    ...overrides,
  };
}

export { money };

/**
 * Schedule C in the signing link, or hidden from it (Dani, 28 Oct 2026): one
 * switch - off greys the row and leaves Schedule C out of the link and the full
 * agreement, for a resident who never needs it or is not ready for it yet. On
 * again puts it back. Offered only while the move-in check is untouched.
 */
function ScheduleCNeeded({ doc, onChanged, children }: { doc: AgreementDoc; onChanged: () => void; children: React.ReactNode }) {
  const hidden = notNeeded(doc.mergeValues) !== null;
  const [busy, setBusy] = useState(false);
  async function toggle(show: boolean) {
    setBusy(true);
    try {
      const { setScheduleCNotNeeded } = await import("@/lib/inventory.functions");
      await setScheduleCNotNeeded({ data: { docId: doc.id, reason: show ? null : "" } });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Not saved");
    } finally {
      setBusy(false);
    }
  }
  const title = hidden ? "Hidden from signing link" : "In signing link";
  return (
    <span className="inline-flex items-center gap-2">
      {children}
      {hidden || (doc.stage ?? "open") === "open" ? (
        <Switch checked={!hidden} disabled={busy} title={title} aria-label={title} onCheckedChange={(on) => void toggle(on)} />
      ) : null}
    </span>
  );
}
