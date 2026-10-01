import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, ChevronDown, ChevronRight, FileSignature, Loader2, Lock, PenLine, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentView } from "@/components/admin/DocumentView";
import { SignaturePad } from "@/components/site/SignaturePad";
import { getInventoryBaseline, getSigningPack, getSigningPdf, signDocument, submitInventory, type SigningDoc } from "@/lib/signing.functions";
import { InventoryChecklist } from "@/components/site/InventoryChecklist";
import { inventoryProblems, type InventoryRecord } from "@/lib/inventory";

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

  const docs = pack.data.documents;
  // a check sent in is done, for the resident - Brachtia signs it next
  const signed = docs.filter((d) => d.signed || d.submitted).length;
  const pct = docs.length ? Math.round((signed / docs.length) * 100) : 0;
  const allDone = docs.length > 0 && docs.every((d) => d.signed || d.submitted || d.locked);
  // after signing one, the next one still to sign opens by itself
  const nextAfter = (key: string) => {
    const i = docs.findIndex((d) => d.key === key);
    return docs.slice(i + 1).find((d) => !d.signed && !d.submitted && !d.locked)?.key ?? null;
  };

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
              Hi {pack.data.name || "there"}. Open each document, read it through, then sign it. You can sign some now and come
              back to this link for the rest. If anything needs clarifying, contact us before signing.
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

      {allDone ? (
        <section className={`${CARD} mt-4 flex items-start gap-3 border-emerald-200 bg-emerald-50/60 p-5`}>
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">All done — thank you!</p>
            <p className="mt-0.5 text-sm text-emerald-900/80">
              {docs.some((d) => d.locked)
                ? "The rest opens after you check in. We will let you know."
                : "Everything is signed. We will be in touch about the next steps."}
            </p>
          </div>
        </section>
      ) : null}

      <div className="mt-4 space-y-3">
        {docs.length === 0 ? (
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

      <p className="mt-6 flex items-start gap-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        Signing here is your electronic signature. For each document we keep the exact file you signed, with the time, your device
        and a fingerprint of the file, so it cannot be changed afterwards.
      </p>
    </Shell>
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
    queryKey: ["signing-pdf", token, doc.key, doc.signed],
    queryFn: () => getSigningPdf({ data: { token, kind: doc.kind, id: doc.id, ...(doc.mode ? { mode: doc.mode } : {}) } }),
    // a checklist has no pages until Brachtia has signed it
    enabled: open && !doc.locked && (doc.form !== "inventory" || doc.signed),
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
  const listProblems = record ? inventoryProblems(record) : ["Loading"];

  async function sign() {
    setBusy(true);
    try {
      const r = isList
        ? await submitInventory({ data: { token, kind: doc.kind, id: doc.id, mode: doc.mode ?? "in", typedName: name, agreed: true, png, record: record! as never } })
        : await signDocument({ data: { token, kind: doc.kind, id: doc.id, typedName: name, agreed: true, png } });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(isList ? `${doc.label} sent in` : `${doc.label} signed`);
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

  const ready = isList ? listProblems.length === 0 : pdf.data?.ok === true && !pdf.data.gaps.length;
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
              : doc.submitted
                ? "Sent in — Brachtia is reviewing it"
                : doc.locked
                  ? "Opens after you check in"
                  : isList
                    ? "Check each item and sign"
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
              {isList && doc.submitted ? (
                <p className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                  <CheckCircle2 className="size-4 shrink-0" /> Sent in. Brachtia will review it and sign; you will see the
                  signed copy here.
                </p>
              ) : isList && !doc.signed ? (
                <>
                  {doc.closes ? (
                    <p className="text-xs text-muted-foreground">
                      Open until{" "}
                      {new Date(doc.closes).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" })}
                      . Your answers are kept on this device until you sign.
                    </p>
                  ) : null}
                  <InventoryChecklist
                    draftKey={`brachtia-inventory-${doc.key}`}
                    onChange={setRecord}
                    mode={doc.mode ?? "in"}
                    baseline={baseline.data ?? null}
                    disabled={busy}
                  />
                </>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-background">
                  <DocumentView pdf={pdf.data} pdfLoading={pdf.isLoading} onLastPage={() => setReadToEnd(true)} />
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
              ) : isList && !ready ? (
                <p className="rounded-xl border border-dashed border-border bg-card p-3 text-sm text-muted-foreground">
                  To sign: {listProblems.join(" · ")}.
                </p>
              ) : !isList && ready && !readToEnd ? (
                <p className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-card p-3 text-sm text-muted-foreground">
                  <ChevronRight className="size-4 shrink-0" /> Read to the last page with the arrow above. You sign there.
                </p>
              ) : ready ? (
                <div className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-5">
                  <p className="text-sm font-semibold text-brand-deep">Sign {doc.label.split(" – ")[0]}</p>
                  <Step n={1} done={agreed} title="Agree">
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                      <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                      <span>
                        {isList
                          ? "I have checked the items above, and I agree this is their condition as I received them."
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
                    {busy ? (isList ? "Sending…" : "Signing…") : isList ? "Sign & send in" : "Sign document"}
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

/** One of the three things a signature takes, numbered like the form's steps. */
function Step({ n, done, title, hint, last = false, children }: { n: number; done: boolean; title: string; hint?: string; last?: boolean; children: React.ReactNode }) {
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-ui min-h-screen bg-brand-tint">
      <div className="mx-auto w-full max-w-3xl px-4 py-8">{children}</div>
    </div>
  );
}
