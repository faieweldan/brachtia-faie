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
 * The terms sit on the page itself, not in a small scrolling box, and each one
 * has its own tick. A single "I agree to all 13" gets ticked without a word
 * being read; thirteen ticks, each beside the term it confirms, make the
 * student stop at every one. The terms keep the bold and underline of the
 * paper form, because that emphasis is part of the document.
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
  const [ticked, setTicked] = useState<boolean[]>(() => DECLARATION_TERMS.map(() => false));
  const [typedName, setTypedName] = useState("");
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
        <pre className="mt-4 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {signed.body}
        </pre>
      </section>
    );
  }

  const left = ticked.filter((t) => !t).length;
  const nameOk = nameMatches(typedName, fullName);

  // a disabled button with no reason is the commonest failure in the world -
  // it always says what is still missing
  const blocker =
    left > 0
      ? `Tick each term to confirm you have read it - ${left} still to go.`
      : !typedName.trim()
        ? "Type your full name to sign."
        : !nameOk
          ? `This does not match the name we hold (${fullName || "—"}).`
          : "";

  async function sign() {
    setBusy(true);
    try {
      const agreedTerms = Object.fromEntries(ticked.map((t, i) => [`term_${i + 1}`, t]));
      const res = await signDeclarationByToken({
        data: { token, signedName: typedName, agreedTerms, scrolledToEnd: true },
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
        Please read each term and tick it. This is the agreement between you and {LANDLORD_ENTITY}.
      </p>

      <p className="mt-4 text-sm leading-relaxed text-foreground">{DECLARATION_INTRO}</p>

      <ol className="mt-4 space-y-3">
        {DECLARATION_TERMS.map((t, i) => (
          <li key={i}>
            <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-brand"
                checked={ticked[i]}
                onChange={(e) =>
                  setTicked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))
                }
              />
              <span className="text-muted-foreground">
                <span className="mr-1 font-medium text-foreground">{i + 1}.</span>
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
              </span>
            </label>
          </li>
        ))}
      </ol>

      {/* the signature. the evidence is the record, not the look of it */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
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
        <Button disabled={left > 0 || !nameOk || busy} onClick={() => void sign()}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Sign declaration
        </Button>
        {blocker ? <p className="text-xs text-muted-foreground">{blocker}</p> : null}
      </div>
    </section>
  );
}
