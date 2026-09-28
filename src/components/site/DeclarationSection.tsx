import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  termRuns,
  DECLARATION_CLOSING,
  DECLARATION_INTRO,
  DECLARATION_TERMS,
  DECLARATION_TITLE,
  shownBody,
  idMatches,
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
  const [typedId, setTypedId] = useState("");
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
              {/* the time is part of the record: it is what settles the order of
                  events months later, when the day on its own does not */}
              {new Date(signed.signedAt).toLocaleString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
        <pre className="mt-4 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {shownBody(signed.body)}
        </pre>
      </section>
    );
  }

  const left = ticked.filter((t) => !t).length;
  const nameOk = nameMatches(typedName, fullName);
  // nothing on file to check against: what they type is what we keep
  const idOk = !idNumber.trim() || idMatches(typedId, idNumber);

  // a disabled button with no reason is the commonest failure in the world -
  // it always says what is still missing
  const blocker =
    left > 0
      ? `Tick each term to confirm you have read it - ${left} still to go.`
      : !typedName.trim()
        ? "Type your full name to sign."
        : !nameOk
          ? `This does not match the name we hold (${fullName || "—"}).`
          : !typedId.trim()
            ? "Type your NRIC or passport number to sign."
            : !idOk
              ? `This does not match the number we hold (${idNumber || "—"}).`
              : "";

  async function sign() {
    setBusy(true);
    try {
      const agreedTerms = Object.fromEntries(ticked.map((t, i) => [`term_${i + 1}`, t]));
      const res = await signDeclarationByToken({
        data: { token, signedName: typedName, signedIdNumber: typedId, agreedTerms },
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
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-16px_rgba(16,24,40,0.18)] sm:p-6">
      <h2 className="border-b border-border pb-3 text-base font-semibold tracking-tight text-brand-deep">
        {DECLARATION_TITLE}
      </h2>
      <p className="mt-4 text-sm leading-relaxed text-foreground">{DECLARATION_INTRO}</p>

      {/* a contract, laid out as one: each term gets the full width of the page
          and a rule of its own, rather than being packed into a list inside a
          box. Reading it is the point, so nothing crowds it. */}
      <ul className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {DECLARATION_TERMS.map((t, i) => (
          <li key={i}>
            {/* a ticked term tints, so progress down a long contract is visible
                at a glance and the unread ones stand out */}
            <label
              className={`flex cursor-pointer items-start gap-4 px-4 py-4 transition-colors ${
                ticked[i] ? "bg-brand-tint/70" : "hover:bg-muted/40"
              }`}
            >
              <input
                type="checkbox"
                // level with the first line of the term, not floating below it: the
                // browser's own margin is taken off, and the box is centred on a
                // 22.75px line (text-sm, leading-relaxed) - (22.75 - 16) / 2
                className="m-0 mt-[3.5px] size-4 shrink-0 accent-brand"
                checked={ticked[i]}
                onChange={(e) =>
                  setTicked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))
                }
              />
              {/* the tick box is what marks a term off, so a number beside it
                  only repeats the count the boxes already give */}
              <span className="text-sm leading-relaxed text-muted-foreground">
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
      </ul>

      {/* the sentence the signature is given against, so what is being agreed
          to sits next to the box where it is agreed rather than above a list */}
      <p className="mt-5 text-sm font-medium leading-relaxed text-foreground">
        {DECLARATION_CLOSING}
      </p>

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
          {/* typed, not filled in: a number they never entered is not something
              they attested to. It is checked against the record on the server */}
          <Input
            value={typedId}
            placeholder="As written on your ID"
            onChange={(e) => setTypedId(e.target.value)}
          />
        </div>
        {/* under both boxes, since both are the signature - under one of them
            it pushed that side down and the two no longer lined up */}
        <p className="-mt-2 text-[11px] text-muted-foreground sm:col-span-2">
          Type both yourself - together they are your signature.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          disabled={left > 0 || !nameOk || !typedId.trim() || !idOk || busy}
          onClick={() => void sign()}
        >
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Sign declaration
        </Button>
        {/* red so it is noticed: it is the one thing still stopping them signing */}
        {blocker ? <p className="text-xs font-medium text-destructive">{blocker}</p> : null}
      </div>
    </section>
  );
}
