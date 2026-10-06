import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  DoorOpen,
  FileSignature,
  Loader2,
  Lock,
  PenLine,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentView } from "@/components/admin/DocumentView";
import { SignaturePad } from "@/components/site/SignaturePad";
import {
  getInventoryBaseline,
  getInventoryPhotoUrls,
  getInventorySignPdf,
  getReturnedInventory,
  getSigningPack,
  getSigningPdf,
  sendInventoryForReview,
  signDocument,
  submitInventory,
  uploadInventoryPhoto,
  type SigningDoc,
} from "@/lib/signing.functions";
import { getResidentCheckout, signCheckout } from "@/lib/checkout.functions";
import { InventoryChecklist, goToInventoryRow } from "@/components/site/InventoryChecklist";
import { VERDICT_LABEL, inventoryAnswerables, inventoryGaps, recordPhotos, toAgree, type InventoryRecord } from "@/lib/inventory";

export const Route = createFileRoute("/sign/$token")({
  head: () => ({ meta: [{ title: "Sign your documents — Brachtia Homes" }, { name: "robots", content: "noindex" }] }),
  component: SigningPage,
});

/**
 * Where a resident reads and signs their tenancy documents (30 Sep 2026).
 *
 * One section per document, opened one at a time: read the pages, tick that
 * you agree, type your name, sign, and the section closes as signed. They can
 * sign some now and come back for the rest with the same link.
 */
// the same lifted card as the profile form's
const CARD = "rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-16px_rgba(16,24,40,0.18)]";

function SigningPage() {
  const { token } = Route.useParams();
  const pack = useQuery({ queryKey: ["signing", token], queryFn: () => getSigningPack({ data: { token } }) });
  const [open, setOpen] = useState<string | null>(null);
  const [page, setPage] = useState<"docs" | "inventory">("docs");

  if (pack.isLoading) {
    return (
      <Shell>
        <div className={`${CARD} flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground`}>
          <Loader2 className="size-4 animate-spin" /> Loading your documents…
        </div>
      </Shell>
    );
  }
  if (!pack.data?.ok) {
    return (
      <Shell>
        <div className={`${CARD} p-8 text-center`}>
          <p className="text-sm font-semibold text-brand-deep">This link cannot be opened</p>
          <p className="mt-1 text-sm text-muted-foreground">{pack.data && !pack.data.ok ? pack.data.error : "Please ask Brachtia for a new link."}</p>
        </div>
      </Shell>
    );
  }

  const all = pack.data.documents;
  // the documents to read and sign; the inventory checks have their own page
  const docs = all.filter((d) => d.form !== "inventory");
  const checks = all.filter((d) => d.form === "inventory");
  const signed = docs.filter((d) => d.signed).length;
  const pct = docs.length ? Math.round((signed / docs.length) * 100) : 0;
  const docsDone = docs.every((d) => d.signed || d.locked);
  // a check still to do, and open - what the Next button leads to
  const checkToDo = checks.find((c) => (c.stage === "open" || c.stage === "returned") && !c.locked);
  // after signing one, the next one still to sign opens by itself
  const nextAfter = (key: string) => {
    const i = docs.findIndex((d) => d.key === key);
    return docs.slice(i + 1).find((d) => !d.signed && !d.locked)?.key ?? null;
  };

  /*
   * The inventory check is its own page, after the documents (Dani, 1 Oct
   * 2026): one long checklist done in the room, not a fourth card squeezed
   * under three documents.
   */
  if (page === "inventory" && checks.length) {
    return (
      <Shell wide>
        <button
          type="button"
          onClick={() => {
            setPage("docs");
            window.scrollTo({ top: 0 });
          }}
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to your documents
        </button>
        <section className={`${CARD} p-5 sm:p-6`}>
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand-deep">
              <ClipboardCheck className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-brand-deep sm:text-2xl">Inventory check</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Schedule C – Inventory &amp; Condition Record. Walk through the unit room by room and check each item. Mark
                anything damaged as a defect and say what is wrong — it protects your deposit when you move out.
              </p>
            </div>
          </div>
        </section>
        <div className="mt-4 space-y-3">
          {checks.map((c, i) => (
            <Section
              key={c.key}
              n={i + 1}
              token={token}
              doc={c}
              open={open === c.key || (checks.length === 1 && open === null)}
              onToggle={() => setOpen(open === c.key ? "" : c.key)}
              onSigned={() => setOpen("")}
            />
          ))}
        </div>
        <Footnote />
      </Shell>
    );
  }

  return (
    <Shell>
      <section className={`${CARD} p-5 sm:p-6`}>
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand-deep">
            <FileSignature className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-brand-deep sm:text-2xl">Your tenancy documents</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Hi {pack.data.name || "there"}. Open each document, read it through, then sign it. If anything needs clarifying, contact us
              before signing.
            </p>
          </div>
        </div>
        {docs.length ? (
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-brand-deep">{signed} of {docs.length} signed</span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-brand-deep transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : null}
      </section>

      {/* at the end of the stay: the checkout statement to sign, above the rest */}
      <CheckoutCard token={token} />

      <div className="mt-4 space-y-3">
        {all.length === 0 ? (
          <div className={`${CARD} p-8 text-center text-sm text-muted-foreground`}>Nothing to sign yet. We will send you a message when your documents are ready.</div>
        ) : (
          docs.map((d, i) => (
            <Section
              key={d.key}
              n={i + 1}
              token={token}
              doc={d}
              open={open === d.key}
              onToggle={() => setOpen(open === d.key ? null : d.key)}
              onSigned={() => setOpen(nextAfter(d.key))}
            />
          ))
        )}
      </div>

      {/* the next page: the inventory check, once the documents are signed */}
      {checks.length ? (
        <section className={`${CARD} mt-4 flex flex-wrap items-center gap-4 p-5 ${checkToDo ? "ring-2 ring-brand/20" : ""}`}>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand-deep">
            <ClipboardCheck className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-brand-deep">Next: Inventory check</p>
            <p className="text-sm text-muted-foreground">
              {checkToDo?.stage === "returned"
                ? "Brachtia has answered your check. Read the answers, then sign."
                : checkToDo
                  ? "Check every item in your unit and send it to Brachtia — Schedule C."
                  : checks.every((c) => c.signed)
                    ? "Signed. You can look at it any time."
                    : checks.some((c) => c.submitted)
                      ? "Sent in — Brachtia is reviewing it."
                      : docsDone
                        ? "Check every item in your unit and send it to Brachtia — Schedule C."
                        : "Opens once the documents above are signed."}
            </p>
          </div>
          <Button
            type="button"
            disabled={!checkToDo && !checks.some((c) => c.signed || c.submitted)}
            variant={checkToDo ? "default" : "outline"}
            onClick={() => {
              setPage("inventory");
              setOpen(null);
              window.scrollTo({ top: 0 });
            }}
          >
            {checkToDo?.stage === "returned" ? "Continue" : checkToDo ? "Start" : "Open"} <ArrowRight className="size-4" />
          </Button>
        </section>
      ) : null}

      <Footnote />
    </Shell>
  );
}

function Footnote() {
  return (
    <p className="mt-6 flex items-start gap-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
      <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
      Signing here is your electronic signature. For each document we keep the exact file you signed, with the time, your device
      and a fingerprint of the file, so it cannot be changed afterwards.
    </p>
  );
}

function Section({
  n,
  token,
  doc,
  open,
  onToggle,
  onSigned,
}: {
  n: number;
  token: string;
  doc: SigningDoc;
  open: boolean;
  onToggle: () => void;
  onSigned: () => void;
}) {
  const qc = useQueryClient();
  const pdf = useQuery({
    queryKey: ["signing-pdf", token, doc.key, doc.signed, doc.stage],
    queryFn: () => getSigningPdf({ data: { token, kind: doc.kind, id: doc.id, ...(doc.mode ? { mode: doc.mode } : {}) } }),
    // a checklist has no pages until Brachtia has signed it
    // a check has no pages to show until they have signed it
    enabled: open && !doc.locked && (doc.form !== "inventory" || doc.signed || doc.stage === "submitted"),
    staleTime: Infinity,
  });
  /*
   * The signing steps appear only once the last page has been reached - the
   * page where it is signed. Reading is the point of signing (Dani, 30 Sep 2026).
   */
  const [readToEnd, setReadToEnd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState("");
  const [png, setPng] = useState("");
  const [busy, setBusy] = useState(false);

  const isList = doc.form === "inventory";
  // at move-out, how each item was at move-in
  const baseline = useQuery({
    queryKey: ["inventory-baseline", token, doc.id],
    queryFn: () => getInventoryBaseline({ data: { token, kind: doc.kind, id: doc.id } }),
    enabled: open && doc.mode === "out" && !doc.signed && !doc.submitted,
    staleTime: Infinity,
  });
  const [record, setRecord] = useState<InventoryRecord | null>(null);
  const gaps = record ? inventoryGaps(record) : [{ label: "Loading", rows: [] }];
  const listProblems = gaps.map((g) => g.label);
  // the resident agrees to each of Brachtia's answers before signing (Dani, 2 Oct 2026)
  const [agreedKeys, setAgreedKeys] = useState<string[]>([]);
  /*
   * Schedule C goes to Brachtia before it is signed (Dani, 1 Oct 2026): sent
   * for review, each defect answered - Resolved or Accepted - and sent back.
   * Then the resident signs what was answered, or changes something and sends
   * it back again.
   */
  const returned = useQuery({
    queryKey: ["inventory-returned", token, doc.key, doc.stage],
    queryFn: () => getReturnedInventory({ data: { token, kind: doc.kind, id: doc.id, mode: doc.mode ?? "in" } }),
    enabled: open && isList && doc.stage === "returned",
    staleTime: Infinity,
  });
  const answered = returned.data?.record ?? null;
  // the defects' photos: links to show the ones already saved
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());
  useEffect(() => {
    const missing = record ? recordPhotos(record).filter((p) => !asked.current.has(p)) : [];
    if (!missing.length) return;
    missing.forEach((p) => asked.current.add(p));
    void getInventoryPhotoUrls({ data: { token, kind: doc.kind, id: doc.id, mode: doc.mode ?? "in", paths: missing } }).then((u) =>
      setPhotoUrls((m) => ({ ...m, ...u })),
    );
  }, [record, token, doc.kind, doc.id, doc.mode]);
  async function uploadPhoto(item: string, file: File): Promise<string | null> {
    try {
      const jpeg = await shrinkPhoto(file);
      const r = await uploadInventoryPhoto({ data: { token, kind: doc.kind, id: doc.id, mode: doc.mode ?? "in", item, jpeg } });
      if (!r.ok) {
        toast.error(r.error);
        return null;
      }
      asked.current.add(r.path);
      setPhotoUrls((m) => ({ ...m, [r.path]: r.url }));
      return r.path;
    } catch {
      toast.error("That photo could not be added. Please try another.");
      return null;
    }
  }
  // anything changed since Brachtia answered goes back to them, not to a signature
  const changed = !!answered && !!record && JSON.stringify(record) !== JSON.stringify(answered);

  async function sendForReview() {
    if (!record) return;
    setBusy(true);
    try {
      const r = await sendInventoryForReview({
        data: { token, kind: doc.kind, id: doc.id, mode: doc.mode ?? "in", record: record as never },
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Sent to Brachtia", { description: "They reply to your whole check within 48 hours. Then you sign." });
      // what was sent is kept by Brachtia now; the draft on this device is done with
      try {
        localStorage.removeItem(`brachtia-inventory-${doc.key}`);
      } catch {
        /* nothing kept */
      }
      await qc.invalidateQueries({ queryKey: ["signing", token] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send it. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sign() {
    setBusy(true);
    try {
      const r = isList
        ? await submitInventory({
            data: { token, kind: doc.kind, id: doc.id, mode: doc.mode ?? "in", typedName: name, agreed: true, png, agreedDefects: agreedKeys },
          })
        : await signDocument({ data: { token, kind: doc.kind, id: doc.id, typedName: name, agreed: true, png } });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(isList ? `${doc.label} signed and sent` : `${doc.label} signed`);
      // the signed record is the copy now; the draft on this device is done with
      if (isList) {
        try {
          localStorage.removeItem(`brachtia-inventory-${doc.key}`);
        } catch {
          /* nothing kept */
        }
      }
      await qc.invalidateQueries({ queryKey: ["signing", token] });
      onSigned();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // a check is signed only once Brachtia has answered it, and as it was answered
  const mustAgree = answered ? toAgree(answered, returned.data?.decisions ?? {}) : [];
  const allAgreed = mustAgree.every((d) => agreedKeys.includes(d.key));
  /*
   * Agreed to the answers, they confirm - and the check becomes its PDF, read
   * to the last page and signed there, like every other document (Dani, 2 Oct
   * 2026). Their signature goes onto that page, never one kept for later.
   */
  const [confirmed, setConfirmed] = useState(false);
  const signPdf = useQuery({
    queryKey: ["inventory-sign-pdf", token, doc.key, returned.data?.returnedAt],
    queryFn: () => getInventorySignPdf({ data: { token, kind: doc.kind, id: doc.id, mode: doc.mode ?? "in" } }),
    enabled: isList && confirmed && doc.stage === "returned",
    staleTime: Infinity,
  });
  const ready = isList
    ? doc.stage === "returned" && !!answered && !changed && allAgreed && confirmed && readToEnd
    : pdf.data?.ok === true && !pdf.data.gaps.length;
  const incomplete = !isList && pdf.data?.ok === true && pdf.data.gaps.length > 0;

  return (
    <section className={`${CARD} overflow-hidden ${open ? "ring-2 ring-brand/15" : ""}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5">
        {/* the same marks as the profile form's steps */}
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold ${
            doc.signed || doc.submitted
              ? "border-brand bg-brand text-primary-foreground"
              : doc.locked
                ? "border-border bg-muted text-muted-foreground"
                : "border-brand-deep text-brand-deep"
          }`}
        >
          {doc.signed || doc.submitted ? <Check className="size-4" /> : doc.locked ? <Lock className="size-3.5" /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-brand-deep">{doc.label}</span>
          <span className="block text-xs text-muted-foreground">
            {doc.signed
              ? "Signed"
              : doc.stage === "review"
                ? "Sent — Brachtia is answering your check"
                : doc.submitted
                  ? "Signed — waiting for Brachtia to approve"
                  : doc.locked
                    ? "Opens after you check in"
                    : doc.stage === "returned"
                      ? "Brachtia has answered — read and sign"
                      : isList
                        ? "Check each item and send it to Brachtia"
                        : "Read and sign"}
          </span>
        </span>
        {doc.signed ? (
          <span className="hidden shrink-0 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 sm:inline">Signed</span>
        ) : doc.submitted ? (
          <span className="hidden shrink-0 rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900 sm:inline">Sent in</span>
        ) : doc.locked ? (
          <span className="hidden shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground sm:inline">Later</span>
        ) : (
          <span className="hidden shrink-0 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 sm:inline">To sign</span>
        )}
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border bg-muted/20 p-4 sm:p-5">
          {doc.locked ? (
            <p className="text-sm text-muted-foreground">{doc.locked}</p>
          ) : (
            <>
              {isList && doc.stage === "review" ? (
                <p className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> Sent to Brachtia. They reply to your whole check within 48 hours - each
                  defect fixed, or accepted as it is - and send it back here. Then you read their answers and sign.
                </p>
              ) : isList && doc.submitted ? (
                <>
                  <p className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                    <CheckCircle2 className="size-4 shrink-0" /> Signed and sent. This is your copy with your signature; Brachtia signs it
                    when they approve.
                  </p>
                  <div className="overflow-hidden rounded-xl border border-border bg-background">
                    <DocumentView pdf={pdf.data} pdfLoading={pdf.isLoading} fileName={`${doc.label}.pdf`} />
                  </div>
                </>
              ) : isList && doc.stage === "returned" && !answered ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading Brachtia's answers…</p>
              ) : isList && !doc.signed ? (
                <>
                  {doc.closes ? (
                    <p className="text-xs text-muted-foreground">
                      Open until{" "}
                      {new Date(doc.closes).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: "Asia/Kuala_Lumpur",
                      })}
                      . Your answers are kept on this device until you sign.
                    </p>
                  ) : null}
                  {confirmed ? null : answered ? (
                    <Answers
                      record={answered}
                      decisions={returned.data?.decisions ?? {}}
                      agreed={agreedKeys}
                      onToggle={(k) => setAgreedKeys((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]))}
                    />
                  ) : null}
                  {confirmed ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmed(false);
                          setReadToEnd(false);
                        }}
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                      >
                        <ArrowLeft className="size-4" /> Back to Brachtia's answers
                      </button>
                      <div className="overflow-hidden rounded-xl border border-border bg-background">
                        <DocumentView pdf={signPdf.data} pdfLoading={signPdf.isLoading} onLastPage={() => setReadToEnd(true)} fileName={`${doc.label}.pdf`} />
                      </div>
                    </div>
                  ) : (
                  // once Brachtia has answered, the list is not shown: it cannot change, and the
                  // PDF they sign shows every item (Dani, 5 Oct 2026). It stays mounted, hidden,
                  // so what was sent is still what is signed
                  <div className={doc.stage === "returned" ? "hidden" : ""}>
                  <InventoryChecklist
                    // a new draft each time Brachtia answers, starting from what they answered
                    key={returned.data?.returnedAt ?? "draft"}
                    draftKey={`brachtia-inventory-${doc.key}${returned.data?.returnedAt ? `-${returned.data.returnedAt}` : ""}`}
                    {...(answered ? { initial: answered, decisions: returned.data?.decisions ?? {} } : {})}
                    onChange={setRecord}
                    photos={{ upload: uploadPhoto, urls: photoUrls }}
                    mode={doc.mode ?? "in"}
                    baseline={baseline.data ?? null}
                    disabled={busy}
                    // sent once, the answers are locked - view only (Dani, 5 Oct 2026)
                    locked={doc.stage === "returned"}
                  />
                  </div>
                  )}
                </>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-background">
                  <DocumentView pdf={pdf.data} pdfLoading={pdf.isLoading} onLastPage={() => setReadToEnd(true)} fileName={`${doc.label}.pdf`} />
                </div>
              )}
              {isList && doc.submitted ? null : doc.signed ? (
                <p className="flex items-center gap-2 text-sm text-emerald-800">
                  <CheckCircle2 className="size-4" /> You have signed this document. The pages above are your signed copy.
                </p>
              ) : incomplete ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  This document is not complete yet, so it cannot be signed. Please contact Brachtia.
                </p>
              ) : isList && (doc.stage === "open" || changed) ? (
                <div className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
                  <p className="text-sm font-semibold text-brand-deep">{changed ? "Send it back to Brachtia" : "Send it to Brachtia"}</p>
                  <p className="text-sm text-muted-foreground">
                    {changed
                      ? "You changed something since Brachtia answered. They answer it again; then you sign."
                      : "With defects or without, Brachtia looks at it first. They reply to your whole check within 48 hours, then you sign."}
                  </p>
                  {/* what is still missing, each one a way to get there (Dani, 2 Oct 2026) */}
                  {record && gaps.length ? (
                    <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3">
                      <p className="text-sm font-semibold text-amber-900">Before you send</p>
                      {gaps.map((g) => (
                        <button
                          key={g.label}
                          type="button"
                          onClick={() => g.rows[0] && goToInventoryRow(g.rows[0])}
                          className="flex w-full items-center justify-between gap-2 rounded-md bg-amber-100 px-3 py-2 text-left text-sm font-medium text-amber-900 hover:bg-amber-200"
                        >
                          {g.label}
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs">
                            Show me <ArrowRight className="size-3.5" />
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    className="w-full sm:w-auto"
                    disabled={busy || listProblems.length > 0}
                    onClick={() => void sendForReview()}
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                    {busy ? "Sending…" : changed ? "Send back to Brachtia" : "Send to Brachtia"}
                  </Button>
                </div>
              ) : isList && doc.stage === "returned" && answered && !allAgreed ? (
                <button
                  type="button"
                  onClick={() => document.getElementById("brachtia-answers")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-left text-sm font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Agree to each of Brachtia's answers first - then you can sign.
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs">
                    Show me <ArrowRight className="size-3.5" />
                  </span>
                </button>
              ) : isList && doc.stage === "returned" && answered && !changed && !confirmed ? (
                <div className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
                  <p className="text-sm font-semibold text-brand-deep">Confirm your Schedule C</p>
                  <p className="text-sm text-muted-foreground">
                    Your check becomes a PDF - the items, Brachtia's answers and the acknowledgement. Read it to the last page, then sign
                    there.
                  </p>
                  <Button type="button" className="w-full sm:w-auto" onClick={() => setConfirmed(true)}>
                    <ArrowRight className="size-4" /> Confirm and read the PDF
                  </Button>
                </div>
              ) : isList && confirmed && !readToEnd ? (
                <p className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-card p-3 text-sm text-muted-foreground">
                  <ChevronRight className="size-4 shrink-0" /> Read to the last page with the arrow above. You sign there.
                </p>
              ) : !isList && ready && !readToEnd ? (
                <p className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-card p-3 text-sm text-muted-foreground">
                  <ChevronRight className="size-4 shrink-0" /> Read to the last page with the arrow above. You sign there.
                </p>
              ) : ready ? (
                <div className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-5">
                  <p className="text-sm font-semibold text-brand-deep">Sign {doc.label.split(" – ")[0]}</p>
                  {isList ? (
                    <p className="text-xs text-muted-foreground">Something still not right? Contact Brachtia before you sign.</p>
                  ) : null}
                  <Step n={1} done={agreed} title="Agree">
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                      <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                      <span>
                        {isList
                          ? "I have read Brachtia's answers and the acknowledgement, and I agree this is the condition of the items as I received them."
                          : "I have read this document and I agree to it."}
                      </span>
                    </label>
                  </Step>
                  <Step n={2} done={!!name.trim()} title="Your full name" hint="As it appears on the document">
                    <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!agreed} autoComplete="name" className="sm:max-w-sm" />
                  </Step>
                  <Step n={3} done={!!png} title="Your signature" last>
                    <SignaturePad onChange={setPng} disabled={!agreed} />
                  </Step>
                  <Button type="button" className="w-full sm:w-auto" disabled={!agreed || !name.trim() || !png || busy} onClick={() => void sign()}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />}
                    {busy ? "Signing…" : isList ? "Sign & send to Brachtia" : "Sign document"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

/**
 * A phone photo is several megabytes; 1600 pixels on the long side is enough
 * to see a scratch. Made small here, before it is sent.
 */
async function shrinkPhoto(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * k);
  canvas.height = Math.round(img.height * k);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8).split(",")[1]!;
}

/** Brachtia's answer to each defect, above the list, before the resident signs. */
function Answers({
  record,
  decisions,
  agreed,
  onToggle,
}: {
  record: InventoryRecord;
  decisions: Record<string, { verdict: "resolved" | "accepted" }>;
  agreed: string[];
  onToggle: (key: string) => void;
}) {
  // only what Brachtia resolved comes back to them - an accepted item needs nothing from them (Dani, 5 Oct 2026)
  const items = inventoryAnswerables(record).filter((d) => decisions[d.key]?.verdict === "resolved");
  // only Resolved needs their agreement; "accepted as it is" changes nothing for them
  const left = items.filter((d) => decisions[d.key]?.verdict === "resolved" && !agreed.includes(d.key)).length;
  const label = (_kind: string, v: "resolved" | "accepted") => VERDICT_LABEL[v];
  return (
    <div id="brachtia-answers" className="scroll-mt-24 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm">
      <p className="font-semibold text-sky-900">Brachtia has answered your check</p>
      {items.some((d) => decisions[d.key]?.verdict === "resolved") ? (
        <p className="mt-0.5 text-xs text-sky-900/80">
          Tap <b>I agree</b> on each resolved item, once you have seen it. Then confirm and sign.
        </p>
      ) : null}
      {items.length ? (
        <ul className="mt-2 space-y-2">
          {items.map((d) => {
            const v = decisions[d.key]?.verdict;
            return (
              <li key={d.key} className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{d.name}</span>
                  <span className="text-muted-foreground"> · {d.area}</span>
                  <p className="text-xs text-muted-foreground">{d.kind === "not_provided" ? "Not provided" : d.remark}</p>
                </div>
                {v ? (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      v === "resolved" ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-800"
                    }`}
                  >
                    {label(d.kind, v)}
                  </span>
                ) : null}
                {v === "resolved" ? (
                  <button
                    type="button"
                    onClick={() => onToggle(d.key)}
                    aria-pressed={agreed.includes(d.key)}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
                      agreed.includes(d.key)
                        ? "border-brand bg-brand text-primary-foreground"
                        : "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
                    }`}
                  >
                    {agreed.includes(d.key) ? <Check className="size-3.5" /> : null}
                    {agreed.includes(d.key) ? "Agreed" : "I agree"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1 text-sky-900/80">Nothing for you to agree to. Confirm and sign below.</p>
      )}
      {items.length ? (
        <p className="mt-3 text-xs text-sky-900/80">
          Resolved: Brachtia fixed it, or will provide it. Anything not listed here stays as you recorded it - you are not charged for it
          when you leave. If something is not right, contact Brachtia.
        </p>
      ) : null}
      {left ? (
        <p className="mt-2 rounded-md bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">
          {left} resolved item{left === 1 ? "" : "s"} still to agree to before you can sign.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The checkout statement (Dani, 2 Oct 2026): what Brachtia holds, what is
 * taken off and what comes back. Read to the end, agree, name, sign - the
 * same three steps as every document. A newer version replaces the one shown.
 */
function CheckoutCard({ token }: { token: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["checkout-sign", token], queryFn: () => getResidentCheckout({ data: { token } }) });
  const [open, setOpen] = useState(true);
  const [readToEnd, setReadToEnd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState("");
  const [png, setPng] = useState("");
  const [busy, setBusy] = useState(false);
  const c = q.data;
  if (!c) return null;

  async function sign() {
    if (!c) return;
    setBusy(true);
    try {
      const r = await signCheckout({ data: { token, v: c.v, typedName: name, agreed: true, png } });
      if (!r.ok) {
        toast.error(r.error);
        await qc.invalidateQueries({ queryKey: ["checkout-sign", token] });
        return;
      }
      toast.success("Checkout statement signed", {
        description: c.net >= 0 ? "Brachtia will now pay your refund and send the proof." : "Brachtia will contact you about the balance.",
      });
      await qc.invalidateQueries({ queryKey: ["checkout-sign", token] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const amount = `RM ${Math.abs(c.net).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;
  return (
    <section className={`${CARD} mt-4 overflow-hidden ${c.signed ? "" : "ring-2 ring-brand/20"}`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand-deep">
          {c.signed ? <Check className="size-4" /> : <DoorOpen className="size-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-brand-deep">Checkout statement · {c.number}</span>
          <span className="block text-xs text-muted-foreground">
            {c.refunded
              ? `Settled · ${amount}`
              : c.signed
                ? c.net >= 0
                  ? "Signed - Brachtia will pay your refund"
                  : "Signed - Brachtia will contact you about the balance"
                : `${c.net >= 0 ? "Refund to you" : "Balance you owe"}: ${amount} · read and sign`}
          </span>
        </span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="space-y-4 border-t border-border bg-muted/20 p-4 sm:p-5">
          <div className="overflow-hidden rounded-xl border border-border bg-background">
            <DocumentView pdf={c.pdf} pdfLoading={false} onLastPage={() => setReadToEnd(true)} fileName={`Checkout statement ${c.number}.pdf`} />
          </div>
          {c.signed ? (
            <p className="flex items-center gap-2 text-sm text-emerald-800">
              <CheckCircle2 className="size-4" /> You have signed this statement. The pages above are your signed copy.
            </p>
          ) : !readToEnd ? (
            <p className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-card p-3 text-sm text-muted-foreground">
              <ChevronRight className="size-4 shrink-0" /> Read to the last page with the arrow above. You sign there.
            </p>
          ) : (
            <div className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-5">
              <p className="text-sm font-semibold text-brand-deep">Sign the checkout statement</p>
              <Step n={1} done={agreed} title="Agree">
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                  <span>I have read this statement, and I agree to the deposits held, every deduction and the final amount.</span>
                </label>
              </Step>
              <Step n={2} done={!!name.trim()} title="Your full name" hint="As it appears on your documents">
                <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!agreed} autoComplete="name" className="sm:max-w-sm" />
              </Step>
              <Step n={3} done={!!png} title="Your signature" last>
                <SignaturePad onChange={setPng} disabled={!agreed} />
              </Step>
              <Button type="button" className="w-full sm:w-auto" disabled={!agreed || !name.trim() || !png || busy} onClick={() => void sign()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />}
                {busy ? "Signing…" : "Sign statement"}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

/** One of the three things a signature takes, numbered like the form's steps. */
function Step({
  n,
  done,
  title,
  hint,
  last = false,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  hint?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
            done ? "bg-brand text-primary-foreground" : "border border-border bg-background text-muted-foreground"
          }`}
        >
          {done ? <Check className="size-3.5" /> : n}
        </span>
        {!last ? <span className="mt-1 w-px flex-1 bg-border" /> : null}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 pb-1">
        <p className="text-xs font-medium text-foreground">
          {title}
          {hint ? <span className="font-normal text-muted-foreground"> · {hint}</span> : null}
        </p>
        {children}
      </div>
    </div>
  );
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="admin-ui min-h-screen bg-brand-tint">
      {/* the inventory check is a five-column table: it gets the room */}
      <div className={`mx-auto w-full px-4 py-8 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>{children}</div>
    </div>
  );
}
