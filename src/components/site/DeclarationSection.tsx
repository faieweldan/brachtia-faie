import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COST_TERMS, DECLARATION_INTRO, DECLARATION_TERMS, nameMatches } from "@/lib/declaration";
import {
  getDeclarationByToken,
  signDeclarationByToken,
  type SignedDeclaration,
} from "@/lib/declaration.functions";

/**
 * A printable copy, for the one signature this form cannot collect.
 *
 * A parent or guardian is a second person; a student typing their name proves
 * nothing at all. Until a parent gets a link of their own, paper is the honest
 * route - and it is the one Brachtia already uses.
 */
function printDeclaration(fullName: string, idNumber: string) {
  const esc = (v: string) =>
    v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return;
  const terms = DECLARATION_TERMS.map((t) => `<li>${t}</li>`).join("");
  w.document.write(`<!doctype html><html><head><title>Brachtia Homes - Declaration</title>
<style>
  body { font: 12pt/1.5 Georgia, "Times New Roman", serif; margin: 32px; color: #111; }
  h1 { font-size: 15pt; letter-spacing: .04em; }
  ol { padding-left: 22px; } li { margin-bottom: 8px; }
  .who { margin: 18px 0; }
  .sign { display: flex; gap: 40px; margin-top: 44px; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 6px; font-size: 10pt; }
</style></head><body>
  <h1>PART 2: DECLARATION</h1>
  <p class="who">I, <b>${esc(fullName) || "________________"}</b>,
     NRIC / Passport No. <b>${esc(idNumber) || "________________"}</b>,</p>
  <p>${DECLARATION_INTRO}</p>
  <ol>${terms}</ol>
  <div class="sign">
    <div>Student signature<br/>Name:<br/>Date:</div>
    <div>Parent / guardian signature<br/>Name:<br/>Date:</div>
  </div>
</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

/**
 * The declaration, read and signed.
 *
 * It is laid out as a document rather than a form, because it is one: a form
 * says "fill me in" and a contract says "read me", and the page should say
 * which before a word is read.
 *
 * What a student actually reads is the cost table. So that comes first, in
 * their own currency, with the full thirteen terms underneath - nothing hidden,
 * but nothing buried either. The ticks are on the five terms that cost money,
 * not on all thirteen: thirteen ticks are clicked in four seconds without being
 * read, and that is weaker evidence of agreement, not stronger.
 */
export function DeclarationSection({
  token,
  fullName,
  idNumber,
  signed,
  onSigned,
}: {
  token: string;
  fullName: string;
  idNumber: string;
  signed: SignedDeclaration | null;
  onSigned: (s: SignedDeclaration) => void;
}) {
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [readAll, setReadAll] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [busy, setBusy] = useState(false);

  // once signed the section stops being a form and becomes a receipt - a
  // student coming back in eight months needs to see what they agreed to
  if (signed) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-brand-deep">Declaration signed</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Signed by {signed.signedName} on{" "}
              {new Date(signed.signedAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}{" "}
              · version {signed.version}
            </p>
          </div>
        </div>
        <pre className="mt-4 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
          {signed.body}
        </pre>
      </section>
    );
  }

  const allTicked = COST_TERMS.every((t) => agreed[t.key]) && readAll;
  const nameOk = nameMatches(typedName, fullName);

  // a disabled button with no reason is the commonest failure in the world -
  // it always says what is still missing
  const blocker = !scrolledToEnd
    ? "Scroll to the end of the terms first."
    : !COST_TERMS.every((t) => agreed[t.key])
      ? "Tick all five cost items."
      : !readAll
        ? "Confirm you have read all 13 terms."
        : !typedName.trim()
          ? "Type your full name to sign."
          : !nameOk
            ? `This does not match the name we hold (${fullName || "—"}).`
            : "";

  async function sign() {
    setBusy(true);
    try {
      const res = await signDeclarationByToken({
        data: { token, signedName: typedName, agreedTerms: agreed, scrolledToEnd },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Declaration signed");
      // read back what was actually recorded, so the receipt shows the stored
      // version and wording rather than a guess made in the browser
      const fresh = await getDeclarationByToken({ data: { token } });
      if (fresh.ok && fresh.signed) onSigned(fresh.signed);
    } catch {
      toast.error("Could not record your signature. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-brand-deep">Declaration</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Please read this before you sign. It is the agreement between you and Brachtia.
      </p>

      {/* the five numbers a student will want to know, before the wording */}
      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <p className="border-b border-border bg-muted/60 px-4 py-2 text-xs font-medium text-foreground">
          What this means for you
        </p>
        <dl className="divide-y divide-border">
          {COST_TERMS.map((t) => (
            <div key={t.key} className="flex flex-wrap gap-2 px-4 py-2.5 text-sm">
              <dt className="min-w-40 flex-1 text-muted-foreground">{t.summary}</dt>
              <dd className="font-medium text-foreground">{t.plain}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* the whole thing, unabridged */}
      <div
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setScrolledToEnd(true);
        }}
        className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-border p-4"
      >
        <p className="text-sm leading-relaxed text-foreground">{DECLARATION_INTRO}</p>
        <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-muted-foreground">
          {DECLARATION_TERMS.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      </div>
      {!scrolledToEnd ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Scroll to the end of the terms to continue.
        </p>
      ) : null}

      {/* a tick for each term that costs money, and one for the rest */}
      <div className="mt-5 space-y-2.5">
        {COST_TERMS.map((t) => (
          <label key={t.key} className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0"
              checked={!!agreed[t.key]}
              onChange={(e) => setAgreed((a) => ({ ...a, [t.key]: e.target.checked }))}
            />
            <span className="text-foreground">
              {t.detail} <span className="text-muted-foreground">(term {t.term})</span>
            </span>
          </label>
        ))}
        <label className="flex cursor-pointer items-start gap-3 border-t border-border pt-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0"
            checked={readAll}
            onChange={(e) => setReadAll(e.target.checked)}
          />
          <span className="font-medium text-foreground">
            I have read and agree to all {DECLARATION_TERMS.length} terms above.
          </span>
        </label>
      </div>

      {/* the signature. the evidence is the record, not the look of it */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Type your full name to sign</Label>
          <Input
            value={typedName}
            placeholder={fullName || "Your full name"}
            onChange={(e) => setTypedName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">NRIC / Passport number</Label>
          <Input value={idNumber} readOnly className="bg-muted/50" />
          <p className="text-[11px] text-muted-foreground">
            Taken from your details above. Not right? Correct it there first.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button disabled={!allTicked || !nameOk || busy} onClick={() => void sign()}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Sign declaration
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => printDeclaration(fullName, idNumber)}
        >
          Print for parent / guardian
        </Button>
        {blocker ? <p className="text-xs text-muted-foreground">{blocker}</p> : null}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Only if Brachtia asked for a parent or guardian signature: print this, have it signed, then
        upload the photo under Your documents above.
      </p>
    </section>
  );
}
