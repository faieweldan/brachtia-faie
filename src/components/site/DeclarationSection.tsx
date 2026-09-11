import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DECLARATION_INTRO,
  termRuns,
  DECLARATION_TERMS,
  LANDLORD_ENTITY,
  LANDLORD_REG_NO,
  nameMatches,
} from "@/lib/declaration";
import {
  getDeclarationByToken,
  signDeclarationByToken,
  type SignedDeclaration,
} from "@/lib/declaration.functions";

/**
 * A copy to keep, or to take to a parent or guardian.
 *
 * It is not how the student signs - that happens here, and the record of it is
 * stronger than a photograph of a signed page could be. It exists because a
 * parent or guardian is a second person this form cannot reach, and because
 * people like a copy of what they agreed to.
 */
function printDeclaration(fullName: string, idNumber: string) {
  const esc = (v: string) =>
    v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) return;
  const runHtml = (t: string) =>
    termRuns(t)
      .map((r) => {
        let html = esc(r.text);
        if (r.underline) html = `<u>${html}</u>`;
        if (r.bold) html = `<b>${html}</b>`;
        return html;
      })
      .join("");
  const terms = DECLARATION_TERMS.map((t) => `<li>${runHtml(t)}</li>`).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>Brachtia Homes - Declaration</title>
<style>
  /* the original is a single page, and so is this: the type sizes and spacing
     are set to fit thirteen terms and three signature blocks on one sheet */
  @page { margin: 14mm; size: A4; }
  body { font: 9.5pt/1.34 Calibri, Arial, sans-serif; color: #000; margin: 0; }
  h1 { font-size: 17pt; letter-spacing: .06em; margin: 0 0 9px; font-family: Georgia, serif; }
  p { margin: 0 0 7px; }
  .rule { display: inline-block; border-bottom: 1px solid #000; min-width: 190px; }
  ol { padding-left: 18px; margin: 7px 0 0; }
  li { margin-bottom: 3.5px; text-align: justify; }
  .sign { display: flex; gap: 22px; margin-top: 20px; page-break-inside: avoid; }
  .sign div { flex: 1; }
  .sign .role { min-height: 26px; }
  .sign .line { border-top: 1px solid #000; margin-top: 24px; padding-top: 4px; }
  footer { margin-top: 14px; border-top: 2px solid #2f6f5e; padding-top: 5px;
           color: #2f6f5e; font-weight: 700; page-break-inside: avoid; }
  footer small { display: block; color: #444; font-weight: 400; }
</style></head><body>
  <h1>PART 2: DECLARATION</h1>
  <p class="who">I, <span class="rule">&nbsp;<b>${esc(fullName)}</b></span>
     NRIC / Passport No. <span class="rule">&nbsp;<b>${esc(idNumber)}</b></span>,</p>
  <p>${esc(DECLARATION_INTRO)}</p>
  <ol>${terms}</ol>
  <div class="sign">
    <div><div class="role">Student Signature</div>
      <div class="line">Name:<br/>NRIC / PP No.:<br/>Date:</div></div>
    <div><div class="role">Parents / Guardian Signature</div>
      <div class="line">Name:<br/>NRIC / PP No.:<br/>Date:</div></div>
    <div><div class="role">Landlord/Landlord's Authorized Person</div>
      <div class="line">Name:<br/>NRIC / PP No.:<br/>Date:</div></div>
  </div>
  <footer>${esc(LANDLORD_ENTITY)}
    <small>Reg No : ${esc(LANDLORD_REG_NO)}</small></footer>
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
 * The terms carry the bold and underline of the paper form, because that
 * emphasis is part of the document rather than styling. Agreement is a single
 * deliberate act taken after reading to the end, and the fact that the text was
 * read to the end is recorded alongside it.
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

  const allTicked = readAll;
  const nameOk = nameMatches(typedName, fullName);

  // a disabled button with no reason is the commonest failure in the world -
  // it always says what is still missing
  const blocker = !scrolledToEnd
    ? "Scroll to the end of the terms first."
    : !readAll
      ? `Confirm you have read and agree to all ${DECLARATION_TERMS.length} terms.`
      : !typedName.trim()
        ? "Type your full name to sign."
        : !nameOk
          ? `This does not match the name we hold (${fullName || "—"}).`
          : "";

  async function sign() {
    setBusy(true);
    try {
      const res = await signDeclarationByToken({
        data: { token, signedName: typedName, agreedTerms: { all_terms: readAll }, scrolledToEnd },
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
        Please read this before you sign. It is the agreement between you and {LANDLORD_ENTITY}.
      </p>

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
            <li key={i}>
              {termRuns(t).map((r, j) => (
                <span
                  key={j}
                  className={`${r.bold ? "font-semibold text-foreground" : ""} ${
                    r.underline ? "underline" : ""
                  }`}
                >
                  {r.text}
                </span>
              ))}
            </li>
          ))}
        </ol>
      </div>
      {!scrolledToEnd ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Scroll to the end of the terms to continue.
        </p>
      ) : null}

      {/* agreement sits with the terms it refers to, and is one deliberate act
          rather than a row of ticks repeating what the terms already say */}
      <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
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
        Signing here is your signature - nothing needs printing or sending back. The printed copy is
        yours to keep, or for a parent or guardian if Brachtia has asked for one.
      </p>
    </section>
  );
}
