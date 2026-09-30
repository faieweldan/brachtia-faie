import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronRight, Lock, PenLine } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentView } from "@/components/admin/DocumentView";
import { SignaturePad } from "@/components/site/SignaturePad";
import { getSigningPack, getSigningPdf, signDocument, type SigningDoc } from "@/lib/signing.functions";

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
function SigningPage() {
  const { token } = Route.useParams();
  const pack = useQuery({ queryKey: ["signing", token], queryFn: () => getSigningPack({ data: { token } }) });
  const [open, setOpen] = useState<string | null>(null);

  if (pack.isLoading) return <Shell><p className="py-24 text-center text-sm text-muted-foreground">Loading your documents…</p></Shell>;
  if (!pack.data?.ok) {
    return (
      <Shell>
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-destructive">
          {pack.data && !pack.data.ok ? pack.data.error : "This page could not be opened."}
        </div>
      </Shell>
    );
  }

  const docs = pack.data.documents;
  const toSign = docs.filter((d) => !d.signed && !d.locked).length;

  return (
    <Shell>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-brand-deep">Your tenancy documents</h1>
        <p className="text-sm text-muted-foreground">
          Hi {pack.data.name || "there"}. Open each document, read it through, then sign it. You can sign some now and come back to
          this link for the rest. If anything needs clarifying, contact us before signing.
        </p>
        <p className="text-xs font-medium text-brand-deep">
          {docs.length === 0
            ? "Nothing to sign yet."
            : toSign === 0
              ? "All done — thank you."
              : `${docs.filter((d) => d.signed).length} of ${docs.length} signed`}
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {docs.map((d) => (
          <Section
            key={d.id}
            token={token}
            doc={d}
            open={open === d.id}
            onToggle={() => setOpen(open === d.id ? null : d.id)}
            onSigned={() => setOpen(null)}
          />
        ))}
      </div>

      <p className="mt-8 text-[11px] leading-relaxed text-muted-foreground">
        Signing here is your electronic signature. For each document we keep the exact file you signed, with the time, your
        device and a fingerprint of the file, so it cannot be changed afterwards.
      </p>
    </Shell>
  );
}

function Section({ token, doc, open, onToggle, onSigned }: { token: string; doc: SigningDoc; open: boolean; onToggle: () => void; onSigned: () => void }) {
  const qc = useQueryClient();
  const pdf = useQuery({
    queryKey: ["signing-pdf", token, doc.id, doc.signed],
    queryFn: () => getSigningPdf({ data: { token, kind: doc.kind, id: doc.id } }),
    enabled: open && !doc.locked,
    staleTime: Infinity,
  });
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState("");
  const [png, setPng] = useState("");
  const [busy, setBusy] = useState(false);

  async function sign() {
    setBusy(true);
    try {
      const r = await signDocument({ data: { token, kind: doc.kind, id: doc.id, typedName: name, agreed: true, png } });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${doc.label} signed`);
      await qc.invalidateQueries({ queryKey: ["signing", token] });
      onSigned();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const ready = pdf.data?.ok === true && !pdf.data.gaps.length;
  const incomplete = pdf.data?.ok === true && pdf.data.gaps.length > 0;

  return (
    <div className="rounded-2xl border border-border bg-card">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-brand-deep">
          {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
          <span className="truncate">{doc.label}</span>
        </span>
        {doc.signed ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
            <CheckCircle2 className="size-3" /> Signed
          </span>
        ) : doc.locked ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            <Lock className="size-3" /> Later
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
            <PenLine className="size-3" /> To sign
          </span>
        )}
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border p-4">
          {doc.locked ? (
            <p className="text-sm text-muted-foreground">{doc.locked}</p>
          ) : (
            <>
              <DocumentView pdf={pdf.data} pdfLoading={pdf.isLoading} />
              {doc.signed ? (
                <p className="text-sm text-emerald-800">You have signed this document. The pages above are the signed copy.</p>
              ) : incomplete ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  This document is not complete yet, so it cannot be signed. Please contact Brachtia.
                </p>
              ) : ready ? (
                <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                    <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                    <span>I have read this document and I agree to it.</span>
                  </label>
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Type your full name, as it appears on the document</p>
                    <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!agreed} autoComplete="name" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Your signature</p>
                    <SignaturePad onChange={setPng} disabled={!agreed} />
                  </div>
                  <Button type="button" className="w-full sm:w-auto" disabled={!agreed || !name.trim() || !png || busy} onClick={() => void sign()}>
                    {busy ? "Signing…" : `Sign ${doc.label.split(" – ")[0]}`}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
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
