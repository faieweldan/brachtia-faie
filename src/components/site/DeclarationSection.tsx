import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  termRuns,
  DECLARATION_INTRO,
  DECLARATION_TERMS,
  LANDLORD_ENTITY,
  nameMatches,
} from "@/lib/declaration";
import {
  getDeclarationByToken,
  signDeclarationByToken,
  type SignedDeclaration,
} from "@/lib/declaration.functions";

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
        {blocker ? <p className="text-xs text-muted-foreground">{blocker}</p> : null}
      </div>
    </section>
  );
}
