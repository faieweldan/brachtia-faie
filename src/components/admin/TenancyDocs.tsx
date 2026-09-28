import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
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
import { DocumentViewDialog } from "@/components/admin/DocumentViewDialog";
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
  updateAccessCard,
} from "@/lib/tenancy-docs.functions";

const DOC_ORDER: AgreementDocType[] = ["agreement", "sched_a", "sched_b", "sched_c"];

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
              {DOC_TYPE_LABELS[doc.docType]}
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
          <StatusPill status={doc.status} label={docLabel(doc.status)} />
        </td>
        <td className="py-2.5 text-right">
          <span className="inline-flex flex-wrap justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setViewing({ kind: "agreement", id: doc.id, title: DOC_TYPE_LABELS[doc.docType] })}>
              View
            </Button>
            {nextStatus ? (
              <Button size="sm" variant="outline" onClick={() => void advance()}>
                Mark {nextStatus.label}
              </Button>
            ) : null}
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

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-deep">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          {agreement.agreementNo}
          {agreement.kind === "renewal" ? (
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Renewal
            </span>
          ) : null}
        </span>
        {parent ? <StatusPill status={parent.status} label={docLabel(parent.status)} /> : null}
      </button>
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
}: {
  cards: AccessCardForm[];
  residentId: string;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [viewCard, setViewCard] = useState<{ id: string; n: number } | null>(null);
  const [reason, setReason] = useState(ACCESS_CARD_REASONS[1] ?? "Lost Card");
  const [cardNoFor, setCardNoFor] = useState<string | null>(null);
  const [cardNo, setCardNo] = useState("");

  async function add() {
    try {
      await createAccessCardForm({ data: { residentId, reason } });
      toast.success("Access card form created");
      setAdding(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the form");
    }
  }

  async function setStatus(card: AccessCardForm, status: string) {
    try {
      await updateAccessCard({ data: { id: card.id, status } });
      toast.success(`Marked ${cardLabel(status)}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the card");
    }
  }

  async function saveCardNo(card: AccessCardForm) {
    if (!cardNo.trim()) {
      toast.error("Enter the card number first");
      return;
    }
    try {
      await updateAccessCard({ data: { id: card.id, cardNo: cardNo.trim(), status: "issued" } });
      toast.success("Card number recorded — marked Issued");
      setCardNoFor(null);
      setCardNo("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the card number");
    }
  }

  const nextFor = (card: AccessCardForm) =>
    ACCESS_CARD_STATUSES[ACCESS_CARD_STATUSES.findIndex((s) => s.key === card.status) + 1];

  return (
    <Panel
      title="Access Card"
      description="Applications and replacements. Each one is a new record — nothing is overwritten."
      action={
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="mr-1 size-3.5" /> New Access Card Form
        </Button>
      }
    >
      {cards.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Form</th>
                <th className="pb-2 pr-3 font-medium">Date</th>
                <th className="pb-2 pr-3 font-medium">Reason</th>
                <th className="pb-2 pr-3 font-medium">Card No.</th>
                <th className="pb-2 pr-3 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c, i) => {
                const next = nextFor(c);
                const isEndState = ACCESS_CARD_END_STATES.some((s) => s.key === c.status);
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-2.5 pr-3 text-sm text-foreground">
                      Access Card Form {cards.length - i}
                    </td>
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
                        {next && next.key !== "issued" ? (
                          <Button size="sm" variant="outline" onClick={() => void setStatus(c, next.key)}>
                            Mark {next.label}
                          </Button>
                        ) : null}
                        {next?.key === "issued" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setCardNo(c.cardNo);
                              setCardNoFor(c.id);
                            }}
                          >
                            Enter Card No. & Issue
                          </Button>
                        ) : null}
                        {c.status === "issued"
                          ? ACCESS_CARD_END_STATES.map((s) => (
                              <Button
                                key={s.key}
                                size="sm"
                                variant="ghost"
                                className="text-muted-foreground"
                                onClick={() => void setStatus(c, s.key)}
                              >
                                {s.label}
                              </Button>
                            ))
                          : null}
                        {isEndState ? null : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No access card forms yet.</p>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="admin-ui">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-brand-deep">
              New Access Card Form
            </DialogTitle>
            <DialogDescription>A new record is created; previous forms are kept.</DialogDescription>
          </DialogHeader>
          <Select
            label="Reason"
            value={reason}
            onChange={setReason}
            options={ACCESS_CARD_REASONS.map((r) => ({ value: r, label: r }))}
          />
          <Button onClick={() => void add()}>Create form</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cardNoFor} onOpenChange={(v) => !v && setCardNoFor(null)}>
        <DialogContent className="admin-ui">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-brand-deep">Issue access card</DialogTitle>
            <DialogDescription>
              Enter the card number printed on the access card before marking it issued.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Access Card Number</p>
            <Input
              autoFocus
              value={cardNo}
              onChange={(e) => setCardNo(e.target.value)}
              placeholder="e.g. AC-10234"
            />
          </div>
          <Button onClick={() => void saveCardNo(cards.find((c) => c.id === cardNoFor)!)}>
            Save & mark Issued
          </Button>
        </DialogContent>
      </Dialog>
      <DocumentViewDialog target={viewCard ? { kind: "card", id: viewCard.id } : null} title={viewCard ? `Access Card Form ${viewCard.n}` : ""} onClose={() => setViewCard(null)} />
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
}: {
  resident: Resident;
  tenancy?: Tenancy | undefined;
  checklist?: React.ReactNode;
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
          <Button asChild size="sm" disabled={!tenancy}>
            <Link to="/admin/residents/$id/document-pack" params={{ id: resident.id }}>
              Create Document Pack
            </Link>
          </Button>
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
          {(data.agreements as TenancyAgreement[]).map((a) => (
            <AgreementBlock key={a.id} agreement={a} onChanged={refresh} />
          ))}
        </div>
      </Panel>
      <AccessCardTable cards={data.accessCards} residentId={resident.id} onChanged={refresh} />
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
